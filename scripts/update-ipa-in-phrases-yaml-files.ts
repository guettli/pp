#!/usr/bin/env tsx
/**
 * Update IPA entries in all phrases-*.yaml files from pre-generated IPA files.
 *
 * Sources:
 *   de-DE, en-GB, fr-FR → static/ipa/{lang}/olaph/default/{stem}.txt  (engine: "olaph")
 *   it-IT               → static/ipa/{lang}/espeak-ng/default/{stem}.txt (engine: "espeak-ng")
 *
 * Removes all existing ipas entries and replaces them.
 * The `category` field is removed; replaced by `engine`.
 *
 * Usage: ./run tsx scripts/update-ipa-in-phrases-yaml-files.ts [lang]
 *   lang: optional, e.g. de-DE (defaults to all four languages)
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { PROJECT_ROOT, phraseToFilename, type PhraseEntry } from "./lib/phrase-audio-utils.js";

const LANGS = ["de-DE", "en-GB", "fr-FR", "it-IT", "es-ES"];

const LANG_ENGINE: Record<string, { engine: string }> = {
  "de-DE": { engine: "olaph" },
  "en-GB": { engine: "olaph" },
  "fr-FR": { engine: "olaph" },
  "it-IT": { engine: "espeak-ng" },
  "es-ES": { engine: "olaph" },
};

function readIpaFile(lang: string, engine: string, stem: string): string | null {
  const ipaPath = path.join(PROJECT_ROOT, "static", "ipa", lang, engine, "default", `${stem}.txt`);
  if (!fs.existsSync(ipaPath)) return null;
  const raw = fs.readFileSync(ipaPath, "utf-8").trim();
  return raw || null;
}

function main(): void {
  const targetLang = process.argv[2];
  const langs = targetLang ? [targetLang] : LANGS;

  for (const lang of langs) {
    const cfg = LANG_ENGINE[lang];
    if (!cfg) {
      console.error(`Unknown lang: ${lang}`);
      process.exit(1);
    }

    const yamlPath = path.join(PROJECT_ROOT, `phrases-${lang}.yaml`);
    if (!fs.existsSync(yamlPath)) {
      console.error(`File not found: ${yamlPath}`);
      continue;
    }

    const content = fs.readFileSync(yamlPath, "utf-8");
    const entries = yaml.load(content) as PhraseEntry[];

    let updated = 0;
    let missing = 0;

    for (const entry of entries) {
      const enGb = lang === "en-GB" ? entry.phrase : (entry["en-GB"] ?? entry.phrase);
      const stem = phraseToFilename(enGb);
      const ipa = readIpaFile(lang, cfg.engine, stem);

      if (!ipa) {
        missing++;
        // Remove any stale ipas rather than leaving old data
        entry.ipas = [];
        continue;
      }

      entry.ipas = [{ ipa: `/${ipa}/`, engine: cfg.engine }];
      updated++;
    }

    fs.writeFileSync(yamlPath, yaml.dump(entries, { lineWidth: -1, indent: 2 }));
    console.log(`[${lang}]  updated ${updated}, missing ${missing}  → ${yamlPath}`);
  }
}

main();
