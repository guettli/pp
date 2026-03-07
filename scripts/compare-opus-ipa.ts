#!/usr/bin/env tsx
/**
 * Compare detected IPA (from .opus.debug.yaml) with expected IPA from phrases yaml.
 * Shows files where similarity is below a threshold.
 *
 * Usage: ./run tsx scripts/compare-opus-ipa.ts [--threshold <0-100>] [--lang <lang>]
 *
 * Options:
 *   --threshold <n>  Similarity threshold in % (default: 85). Files below this are shown.
 *   --lang <lang>    Filter by language, e.g. de-DE (default: all)
 *   --all            Show all results, not just those below threshold
 *   --delete         Delete opus + debug.yaml files below threshold
 *   --help           Show help
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { parseArgs } from "util";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

interface DebugYaml {
  datetime: string;
  audio_file: string;
  studyLang: string;
  voice: string;
  ipa: string;
}

interface PhraseEntry {
  phrase: string;
  emoji?: string;
  ipas: Array<{ ipa: string; category: string }>;
  "en-GB"?: string;
}

// ── Filename derivation (mirrors src/speech/phrase-audio.ts) ─────────────────

function djb2hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 5381;
  for (const b of bytes) {
    h = (Math.imul(h, 33) + b) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function phraseToFilename(enGbText: string): string {
  const safe = enGbText.replace(/[^a-zA-Z0-9]/g, "_");
  if (safe.length <= 25) return safe;
  return safe.slice(0, 25) + "_" + djb2hex(enGbText);
}

// ── Build reverse lookup: filename stem → { phrase, expectedIPA } ─────────────

interface PhraseInfo {
  phrase: string;
  expectedIPA: string;
}

function buildFilenameLookup(studyLang: string): Map<string, PhraseInfo> {
  const phrasesFile = path.join(PROJECT_ROOT, `phrases-${studyLang}.yaml`);
  if (!fs.existsSync(phrasesFile)) return new Map();

  const content = fs.readFileSync(phrasesFile, "utf8");
  const phrases = yaml.load(content) as PhraseEntry[];
  const map = new Map<string, PhraseInfo>();

  for (const entry of phrases) {
    if (!entry.ipas || entry.ipas.length === 0) continue;

    // For en-GB study lang the phrase itself is the en-GB text; otherwise use en-GB field
    const enGbText = studyLang === "en-GB" ? entry.phrase : (entry["en-GB"] ?? entry.phrase);
    const stem = phraseToFilename(enGbText);

    // Take all IPAs joined by | (same as existing convention)
    const expectedIPA = entry.ipas.map((i) => i.ipa.replace(/^\/|\/$/g, "")).join("|");

    map.set(stem, { phrase: entry.phrase, expectedIPA });
  }

  return map;
}

// ── Collect all debug yaml files ──────────────────────────────────────────────

interface DebugFile {
  debugPath: string;
  stem: string;
  studyLang: string;
  voice: string;
}

function collectDebugFiles(langFilter: string | undefined): DebugFile[] {
  const audioRoot = path.join(PROJECT_ROOT, "static", "audio");
  const result: DebugFile[] = [];

  for (const studyLang of fs.readdirSync(audioRoot)) {
    if (langFilter && studyLang !== langFilter) continue;
    const langDir = path.join(audioRoot, studyLang);
    if (!fs.statSync(langDir).isDirectory()) continue;

    for (const voice of fs.readdirSync(langDir)) {
      const voiceDir = path.join(langDir, voice);
      if (!fs.statSync(voiceDir).isDirectory()) continue;

      for (const file of fs.readdirSync(voiceDir)) {
        if (!file.endsWith(".opus.debug.yaml")) continue;
        const stem = file.replace(/\.opus\.debug\.yaml$/, "");
        result.push({
          debugPath: path.join(voiceDir, file),
          stem,
          studyLang,
          voice,
        });
      }
    }
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface CompareResult {
  studyLang: string;
  voice: string;
  phrase: string;
  stem: string;
  actualIPA: string;
  expectedIPA: string;
  similarity: number;
  notFound: boolean;
}

function printHelp(): void {
  console.log(`Usage: ./run tsx scripts/compare-opus-ipa.ts [options]

Options:
  --threshold <n>  Similarity threshold in % below which files are shown (default: 85)
  --lang <lang>    Filter by language code, e.g. de-DE (default: all)
  --all            Show all results, not just those below threshold
  --delete         Delete opus + debug.yaml files below threshold
  --help           Show this help
`);
}

async function main(): Promise<void> {
  let values: {
    threshold?: string;
    lang?: string;
    all?: boolean;
    delete?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        threshold: { type: "string" },
        lang: { type: "string" },
        all: { type: "boolean" },
        delete: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
    }));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  if (values.help) {
    printHelp();
    return;
  }

  const threshold = values.threshold !== undefined ? parseInt(values.threshold, 10) : 85;
  const langFilter = values.lang;
  const showAll = values.all ?? false;
  const doDelete = values.delete ?? false;

  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    console.error("--threshold must be a number between 0 and 100");
    process.exit(1);
  }

  const debugFiles = collectDebugFiles(langFilter);
  if (debugFiles.length === 0) {
    console.log("No .opus.debug.yaml files found. Run scripts/test-all-opus.ts first.");
    return;
  }

  console.log(`=== Opus IPA Comparison ===\n`);
  console.log(`Debug files found: ${debugFiles.length}`);
  console.log(`Threshold:         ${threshold}%`);
  if (langFilter) console.log(`Language filter:   ${langFilter}`);
  console.log();

  // Build lookup per language
  const lookups = new Map<string, Map<string, PhraseInfo>>();

  const results: CompareResult[] = [];
  let notFoundCount = 0;
  let errorCount = 0;

  for (const df of debugFiles) {
    if (!lookups.has(df.studyLang)) {
      lookups.set(df.studyLang, buildFilenameLookup(df.studyLang));
    }
    const lookup = lookups.get(df.studyLang)!;

    let debugData: DebugYaml;
    try {
      debugData = yaml.load(fs.readFileSync(df.debugPath, "utf8")) as DebugYaml;
    } catch {
      errorCount++;
      continue;
    }

    const phraseInfo = lookup.get(df.stem);
    if (!phraseInfo) {
      notFoundCount++;
      results.push({
        studyLang: df.studyLang,
        voice: df.voice,
        phrase: df.stem,
        stem: df.stem,
        actualIPA: debugData.ipa,
        expectedIPA: "",
        similarity: -1,
        notFound: true,
      });
      continue;
    }

    // Multiple expected IPAs separated by |
    const expectedIPAs = phraseInfo.expectedIPA.split("|");
    let bestSimilarity = 0;
    for (const ipa of expectedIPAs) {
      try {
        const r = calculatePanPhonDistance(ipa, debugData.ipa, df.studyLang);
        if (r.similarity > bestSimilarity) bestSimilarity = r.similarity;
      } catch {
        // ignore individual comparison errors
      }
    }

    results.push({
      studyLang: df.studyLang,
      voice: df.voice,
      phrase: phraseInfo.phrase,
      stem: df.stem,
      actualIPA: debugData.ipa,
      expectedIPA: phraseInfo.expectedIPA,
      similarity: bestSimilarity,
      notFound: false,
    });
  }

  // Sort by similarity ascending (worst first)
  results.sort((a, b) => {
    if (a.notFound && !b.notFound) return -1;
    if (!a.notFound && b.notFound) return 1;
    return a.similarity - b.similarity;
  });

  const bad = results.filter((r) => !r.notFound && r.similarity < threshold / 100);

  if (doDelete) {
    let deleted = 0;
    for (const r of bad) {
      const opusPath = path.join(
        PROJECT_ROOT,
        "static",
        "audio",
        r.studyLang,
        r.voice,
        `${r.stem}.opus`,
      );
      const debugPath = opusPath + ".debug.yaml";
      for (const p of [opusPath, debugPath]) {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
      console.log(
        `DELETED  ${r.studyLang}/${r.voice}/${r.stem}.opus  (${Math.round(r.similarity * 100)}%)`,
      );
      deleted++;
    }
    console.log(`\nDeleted ${deleted} opus+debug.yaml pairs below ${threshold}%.`);
    return;
  }

  const toShow = showAll ? results.filter((r) => !r.notFound) : bad;

  if (toShow.length === 0) {
    console.log(
      `All ${results.filter((r) => !r.notFound).length} files meet the ${threshold}% threshold.`,
    );
  } else {
    const header = [
      "Lang".padEnd(7),
      "Voice".padEnd(18),
      "Sim%".padEnd(6),
      "Phrase".padEnd(30),
      "Expected IPA".padEnd(30),
      "Actual IPA",
    ].join("  ");
    console.log(header);
    console.log("-".repeat(120));

    for (const r of toShow) {
      const sim = Math.round(r.similarity * 100) + "%";
      const phrase = r.phrase.length > 28 ? r.phrase.slice(0, 27) + "…" : r.phrase;
      const expected = r.expectedIPA.length > 28 ? r.expectedIPA.slice(0, 27) + "…" : r.expectedIPA;
      const actual = r.actualIPA.length > 40 ? r.actualIPA.slice(0, 39) + "…" : r.actualIPA;
      console.log(
        [
          r.studyLang.padEnd(7),
          r.voice.padEnd(18),
          sim.padEnd(6),
          phrase.padEnd(30),
          expected.padEnd(30),
          actual,
        ].join("  "),
      );
    }
  }

  console.log();
  const withIPA = results.filter((r) => !r.notFound);
  const avgSim =
    withIPA.length > 0 ? withIPA.reduce((s, r) => s + r.similarity, 0) / withIPA.length : 0;

  console.log(`Total files compared: ${withIPA.length}`);
  console.log(`Average similarity:   ${Math.round(avgSim * 100)}%`);
  console.log(`Below ${threshold}%:         ${bad.length}`);
  if (notFoundCount > 0)
    console.log(`Phrase not in yaml:   ${notFoundCount} (stems with no matching phrase)`);
  if (errorCount > 0) console.log(`Read errors:          ${errorCount}`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
