#!/usr/bin/env tsx
/**
 * Generate IPA using espeak-ng for all 4 languages.
 * Output: static/ipa/{lang}/espeak-ng/default/{stem}.txt
 *
 * Usage: ./run tsx scripts/generate-ipa-espeak.ts [lang]
 *   lang: optional, e.g. de-DE (defaults to all languages)
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { PROJECT_ROOT, phraseToFilename, type PhraseEntry } from "./lib/phrase-audio-utils.js";

const VOICE: Record<string, string> = {
  "de-DE": "de",
  "en-GB": "en-gb",
  "fr-FR": "fr",
  "it-IT": "it",
};

function espeakIPA(voice: string, text: string): string | null {
  const result = spawnSync("espeak-ng", ["--ipa", "-q", "-v", voice, text], {
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) return null;
  // espeak-ng prints a blank line then the IPA on stdout
  return (
    result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ") || null
  );
}

function loadPhrases(studyLang: string): PhraseEntry[] {
  const yamlPath = path.join(PROJECT_ROOT, `phrases-${studyLang}.yaml`);
  return yaml.load(fs.readFileSync(yamlPath, "utf-8")) as PhraseEntry[];
}

function main(): void {
  const targetLang = process.argv[2];
  const langs = targetLang ? [targetLang] : Object.keys(VOICE);

  for (const studyLang of langs) {
    const voice = VOICE[studyLang];
    if (!voice) {
      console.error(`Unknown lang: ${studyLang}`);
      process.exit(1);
    }

    console.log(`\n[${studyLang}] espeak-ng voice=${voice}`);
    const phrases = loadPhrases(studyLang);
    let ok = 0;
    let skip = 0;

    for (const entry of phrases) {
      const enGb = studyLang === "en-GB" ? entry.phrase : (entry["en-GB"] ?? entry.phrase);
      const stem = phraseToFilename(enGb);

      const ipa = espeakIPA(voice, entry.phrase);
      if (ipa === null) {
        skip++;
        continue;
      }

      const outDir = path.join(PROJECT_ROOT, "static", "ipa", studyLang, "espeak-ng", "default");
      const outPath = path.join(outDir, `${stem}.txt`);
      if (fs.existsSync(outPath)) {
        ok++;
        continue;
      }
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, ipa, "utf-8");
      ok++;
    }

    console.log(`  wrote ${ok}, skipped ${skip}`);
  }
}

main();
