/**
 * Checks that every phrase in every study language has pre-generated audio
 * files for all available voices (edge-tts-male and edge-tts-female).
 *
 * Audio files live at:
 *   static/audio/{lang}/{voice}/{stem}.opus
 *
 * The filename stem is derived from the phrase's en-GB text using the same
 * algorithm as src/speech/phrase-audio.ts → phraseToFilename().
 *
 * Run with: node tests/phrase-audio-coverage.test.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

const LANGS = ["de-DE", "en-GB", "fr-FR", "it-IT", "es-ES"];
const VOICES = ["edge-tts-male", "edge-tts-female"];

// ── filename algorithm (mirrors src/speech/phrase-audio.ts) ──────────────────

function djb2hex(s) {
  const bytes = Buffer.from(s, "utf-8");
  let h = 5381;
  for (const b of bytes) {
    h = (Math.imul(h, 33) + b) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function phraseToFilename(enGbText) {
  const safe = enGbText.replace(/[^a-zA-Z0-9]/g, "_");
  if (safe.length <= 25) return safe;
  return safe.slice(0, 25) + "_" + djb2hex(enGbText);
}

// ── load helpers ─────────────────────────────────────────────────────────────

function loadPhrases(studyLang) {
  const filePath = path.join(PROJECT_ROOT, `phrases-${studyLang}.yaml`);
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content);
}

function getEnGbText(item, studyLang) {
  if (studyLang === "en-GB") return item.phrase;
  return item["en-GB"] || item.phrase;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("Phrase audio coverage check");
  console.log("===========================");

  let totalMissing = 0;

  for (const studyLang of LANGS) {
    const phrases = loadPhrases(studyLang);
    const missingByVoice = {};
    for (const voice of VOICES) {
      missingByVoice[voice] = [];
    }

    for (const item of phrases) {
      const enGbText = getEnGbText(item, studyLang);
      const stem = phraseToFilename(enGbText);

      for (const voice of VOICES) {
        const audioPath = path.join(
          PROJECT_ROOT,
          "static",
          "audio",
          studyLang,
          voice,
          `${stem}.opus`,
        );
        if (!fs.existsSync(audioPath)) {
          missingByVoice[voice].push({ phrase: item.phrase, enGbText, stem });
        }
      }
    }

    let langOk = true;
    for (const voice of VOICES) {
      const missing = missingByVoice[voice];
      if (missing.length > 0) {
        langOk = false;
        totalMissing += missing.length;
        console.error(`\n${studyLang}/${voice}: ${missing.length} missing audio file(s):`);
        for (const { phrase, stem } of missing) {
          console.error(`  "${phrase}"  →  ${stem}.opus`);
        }
      }
    }

    if (langOk) {
      console.log(`  ${studyLang}: all ${phrases.length} phrases have audio for all voices. OK`);
    }
  }

  if (totalMissing > 0) {
    console.error(`\n${totalMissing} missing audio file(s) found.`);
    console.error("To generate missing opus files, run:");
    console.error("  ./run python scripts/generate_edge_tts_audio.py create");
    process.exit(1);
  }

  console.log("\n  ✓ All phrase audio coverage checks passed.");
}

main();
