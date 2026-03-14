/**
 * Shared utilities for phrase-audio scripts.
 * Used by static-phrase-audio-ipa.ts.
 */

import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

// ── Types ────────────────────────────────────────────────────────────────────

export interface IpaEntry {
  ipa: string;
  engine: string;
}

export interface PhraseEntry {
  phrase: string;
  emoji?: string;
  ipas: IpaEntry[];
  "en-GB"?: string;
  level?: number;
  blacklisted?: boolean;
}

export interface DebugYaml {
  datetime: string;
  audio_file: string;
  studyLang: string;
  voice: string;
  ipa: string;
  details?: Array<{ symbol: string; confidence: number; duration: number }>;
}

export interface PhraseInfo {
  phrase: string;
  expectedIPA: string;
}

export interface DebugFile {
  debugPath: string;
  stem: string;
  studyLang: string;
  voice: string;
}

// ── Filename derivation ───────────────────────────────────────────────────────

/** djb2 hash over UTF-8 bytes, returned as 8 lowercase hex chars. */
export function djb2hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 5381;
  for (const b of bytes) {
    h = (Math.imul(h, 33) + b) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Derive the audio filename stem from an en-GB text.
 * Matches the algorithm in scripts/generate_edge_tts_audio.py.
 */
export function phraseToFilename(enGbText: string): string {
  const safe = enGbText.replace(/[^a-zA-Z0-9]/g, "_");
  if (safe.length <= 25) return safe;
  return safe.slice(0, 25) + "_" + djb2hex(enGbText);
}

// ── Phrase YAML helpers ───────────────────────────────────────────────────────

/**
 * Build a map from audio filename stem → { phrase, expectedIPA } for a given language.
 * The expected IPA is taken from the phrase YAML file phrases-{studyLang}.yaml.
 */
export function buildFilenameLookup(studyLang: string): Map<string, PhraseInfo> {
  const phrasesFile = path.join(PROJECT_ROOT, `phrases-${studyLang}.yaml`);
  if (!fs.existsSync(phrasesFile)) return new Map();

  const content = fs.readFileSync(phrasesFile, "utf8");
  const phrases = yaml.load(content) as PhraseEntry[];
  const map = new Map<string, PhraseInfo>();

  for (const entry of phrases) {
    if (!entry.ipas || entry.ipas.length === 0) continue;
    const enGbText = studyLang === "en-GB" ? entry.phrase : (entry["en-GB"] ?? entry.phrase);
    const stem = phraseToFilename(enGbText);
    const expectedIPA = entry.ipas.map((i) => i.ipa.replace(/^\/|\/$/g, "")).join("|");
    map.set(stem, { phrase: entry.phrase, expectedIPA });
  }

  return map;
}

// ── Debug file collection ─────────────────────────────────────────────────────

/**
 * Collect all .opus.debug.yaml files under static/audio/, optionally filtered by language.
 */
export function collectDebugFiles(studyLangFilter: string | undefined): DebugFile[] {
  const audioRoot = path.join(PROJECT_ROOT, "static", "audio");
  const result: DebugFile[] = [];

  for (const studyLang of fs.readdirSync(audioRoot)) {
    if (studyLangFilter && studyLang !== studyLangFilter) continue;
    const langDir = path.join(audioRoot, studyLang);
    if (!fs.statSync(langDir).isDirectory()) continue;

    for (const voice of fs.readdirSync(langDir)) {
      const voiceDir = path.join(langDir, voice);
      if (!fs.statSync(voiceDir).isDirectory()) continue;

      for (const file of fs.readdirSync(voiceDir)) {
        if (!file.endsWith(".opus.debug.yaml")) continue;
        const stem = file.replace(/\.opus\.debug\.yaml$/, "");
        result.push({ debugPath: path.join(voiceDir, file), stem, studyLang, voice });
      }
    }
  }

  return result;
}
