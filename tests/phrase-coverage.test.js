/**
 * Checks cross-language phrase coverage:
 *
 * 1. Every non-en-GB phrase must have a non-empty `en-GB` field that links to
 *    a real phrase in phrases-en-GB.yaml.
 *
 * 2. Every en-GB phrase must have a corresponding translation in every other
 *    supported study language (de-DE, fr-FR, it-IT).
 *
 * Run with: node tests/phrase-coverage.test.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NON_EN_LANGS = ["de-DE", "fr-FR", "it-IT", "es-ES"];

function loadPhrases(filename) {
  const filePath = path.join(__dirname, "..", filename);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const phrases = yaml.load(content);
  if (!Array.isArray(phrases)) {
    console.error(`Invalid YAML in ${filename}`);
    process.exit(1);
  }
  return phrases;
}

function main() {
  console.log("Phrase coverage check");
  console.log("=====================");

  const enPhrases = loadPhrases("phrases-en-GB.yaml");
  const enKeys = new Set(enPhrases.map((p) => p.phrase));

  let totalErrors = 0;

  // --- Check 0: no case-insensitive duplicate phrases in en-GB ---
  {
    const seen = new Map(); // lowercased phrase -> first original
    const caseDupes = [];
    for (const p of enPhrases) {
      const key = p.phrase.toLowerCase();
      if (seen.has(key)) {
        caseDupes.push({ a: seen.get(key), b: p.phrase });
      } else {
        seen.set(key, p.phrase);
      }
    }
    if (caseDupes.length > 0) {
      console.error(`\nen-GB: ${caseDupes.length} case-insensitive duplicate(s):`);
      for (const { a, b } of caseDupes) console.error(`  "${a}" vs "${b}"`);
      totalErrors += caseDupes.length;
    } else {
      console.log(`  en-GB: no case-insensitive duplicates. OK`);
    }
  }

  // --- Check 1: non-en-GB phrases all link to a real en-GB phrase ---
  for (const lang of NON_EN_LANGS) {
    const phrases = loadPhrases(`phrases-${lang}.yaml`);
    const missing = [];
    const invalid = [];

    for (const p of phrases) {
      if (!p["en-GB"] || p["en-GB"].trim() === "") {
        missing.push(p.phrase);
      } else if (!enKeys.has(p["en-GB"])) {
        invalid.push({ phrase: p.phrase, enKey: p["en-GB"] });
      }
    }

    if (missing.length > 0) {
      console.error(`\n${lang}: ${missing.length} phrase(s) with missing en-GB field:`);
      for (const ph of missing) console.error(`  "${ph}"`);
      totalErrors += missing.length;
    }
    if (invalid.length > 0) {
      console.error(`\n${lang}: ${invalid.length} phrase(s) with invalid en-GB link:`);
      for (const { phrase, enKey } of invalid)
        console.error(`  "${phrase}" → en-GB "${enKey}" (not found)`);
      totalErrors += invalid.length;
    }
    if (missing.length === 0 && invalid.length === 0) {
      console.log(`  ${lang}: all ${phrases.length} phrases have valid en-GB links. OK`);
    }
  }

  // --- Check 1b: no duplicate en-GB links within a language file ---
  for (const lang of NON_EN_LANGS) {
    const phrases = loadPhrases(`phrases-${lang}.yaml`);
    const seen = new Map(); // enKey -> first phrase
    const duplicates = [];

    for (const p of phrases) {
      if (!p["en-GB"]) continue;
      if (seen.has(p["en-GB"])) {
        duplicates.push({ phrase: p.phrase, enKey: p["en-GB"], first: seen.get(p["en-GB"]) });
      } else {
        seen.set(p["en-GB"], p.phrase);
      }
    }

    if (duplicates.length > 0) {
      console.error(`\n${lang}: ${duplicates.length} duplicate en-GB link(s):`);
      for (const { phrase, enKey, first } of duplicates)
        console.error(`  "${phrase}" and "${first}" both link to en-GB "${enKey}"`);
      totalErrors += duplicates.length;
    } else {
      console.log(`  ${lang}: no duplicate en-GB links. OK`);
    }
  }

  // --- Check 2: every en-GB phrase covered by every other language ---
  const langPhrases = {};
  for (const lang of NON_EN_LANGS) {
    const phrases = loadPhrases(`phrases-${lang}.yaml`);
    langPhrases[lang] = new Set(phrases.map((p) => p["en-GB"]).filter(Boolean));
  }

  for (const lang of NON_EN_LANGS) {
    const covered = langPhrases[lang];
    const uncovered = enPhrases.filter((p) => !covered.has(p.phrase));
    if (uncovered.length > 0) {
      console.error(`\n${lang}: ${uncovered.length} en-GB phrase(s) have no ${lang} translation:`);
      for (const p of uncovered) console.error(`  "${p.phrase}"`);
      totalErrors += uncovered.length;
    } else {
      console.log(`  ${lang}: all ${enPhrases.length} en-GB phrases are translated. OK`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} error(s) found.`);
    process.exit(1);
  }

  console.log(`\n  ✓ All phrase coverage checks passed.`);
}

main();
