/**
 * Pre-generated phrase audio playback.
 *
 * Audio files are produced offline by scripts/generate_edge_tts_audio.py,
 * stored as static assets:
 *
 *   static/audio/{lang}/{voice}/{filename}.opus
 *
 * The filename is derived from the phrase's en-GB translation:
 *   - Replace all non-alphanumeric characters with underscores
 *   - If the result is ≤ 25 chars: use as-is
 *   - If longer: take first 25 chars + '_' + 8-char djb2 hash
 *
 * Example: "The rabbit laughs" → The_rabbit_laughs.opus
 *
 * Voices available:
 *   de-DE, en-GB, fr-FR, it-IT → edge-tts-male, edge-tts-female
 */

import { resolve } from "$app/paths";
import type { Phrase, StudyLanguage } from "../types.js";
import { phraseToFilename } from "../utils/phrase-filename.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceOption {
  /** Internal key matching the directory name, e.g. "edge-tts-male" */
  name: string;
  /** Human-readable label shown in the voice selector */
  label: string;
}

// ── Voice registry ───────────────────────────────────────────────────────────

/** Sentinel voice name for the "pick a random voice each phrase" option. */
export const RANDOM_VOICE_NAME = "random";

const VOICES_BY_LANG: Record<string, VoiceOption[]> = {
  "de-DE": [
    { name: "edge-tts-male", label: "Edge TTS ♂" },
    { name: "edge-tts-female", label: "Edge TTS ♀" },
  ],
  "en-GB": [
    { name: "edge-tts-male", label: "Edge TTS ♂" },
    { name: "edge-tts-female", label: "Edge TTS ♀" },
  ],
  "fr-FR": [
    { name: "edge-tts-male", label: "Edge TTS ♂" },
    { name: "edge-tts-female", label: "Edge TTS ♀" },
  ],
  "it-IT": [
    { name: "edge-tts-male", label: "Edge TTS ♂" },
    { name: "edge-tts-female", label: "Edge TTS ♀" },
  ],
};

// ── Filename derivation ───────────────────────────────────────────────────────

/** Get the en-GB text used as the filename key for a phrase. */
function getEnGbText(phrase: Phrase, studyLang: StudyLanguage): string {
  if (studyLang === "en-GB") return phrase.phrase;
  return phrase["en-GB"] ?? phrase.phrase;
}

// ── Query helpers ────────────────────────────────────────────────────────────

/**
 * Return the list of pre-generated voices available for a study language.
 */
export function getAvailableVoices(studyLang: StudyLanguage): VoiceOption[] {
  return VOICES_BY_LANG[studyLang] ?? [];
}

/**
 * Pick a random voice from the available voices for a study language.
 * Returns null if no voices are available.
 */
export function pickRandomVoice(studyLang: StudyLanguage): string | null {
  const voices = getAvailableVoices(studyLang);
  if (voices.length === 0) return null;
  return voices[Math.floor(Math.random() * voices.length)].name;
}

/**
 * Return the URL path to the pre-generated audio file.
 */
export function getPhraseAudioUrl(
  phrase: Phrase,
  studyLang: StudyLanguage,
  voiceName: string,
): string {
  const enGbText = getEnGbText(phrase, studyLang);
  const filename = phraseToFilename(enGbText);
  // @ts-expect-error TS2345 - resolve() types match known routes; static asset paths are untyped
  return resolve(`/audio/${studyLang}/${voiceName}/${filename}.opus`);
}

// ── Playback rate ────────────────────────────────────────────────────────────

/**
 * Calculate audio playback rate based on user level.
 * Level 1–599: scales from 0.5× (slow) to 1.0× (normal).
 * Level 600+: 1.0× (normal speed).
 */
export function ttsPlaybackRate(userLevel: number): number {
  if (userLevel < 600) {
    return 0.5 + (userLevel / 600) * 0.5;
  }
  return 1.0;
}

// ── Prefetch ─────────────────────────────────────────────────────────────────

/** Returns true if the network is metered/cellular — skip prefetch to save data. */
function isMeteredConnection(): boolean {
  // Network Information API — available in Chrome/Android; absent in Firefox/Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true; // user enabled Data Saver
  if (conn.type === "cellular") return true;
  return ["slow-2g", "2g", "3g"].includes(conn.effectiveType as string);
}

const prefetchedUrls = new Set<string>();

/**
 * Prefetch audio files for a list of phrases into the browser cache.
 * No-ops silently on metered/cellular connections.
 *
 * @param phrases    Phrases to prefetch (top-N by priority).
 * @param studyLang  Study language (e.g. "de-DE").
 * @param voiceNames Voices to prefetch; pass all available voices when in "random" mode.
 */
export function prefetchPhraseAudio(
  phrases: Phrase[],
  studyLang: StudyLanguage,
  voiceNames: string[],
): void {
  if (isMeteredConnection()) return;
  for (const phrase of phrases) {
    for (const voice of voiceNames) {
      const url = getPhraseAudioUrl(phrase, studyLang, voice);
      if (prefetchedUrls.has(url)) continue;
      prefetchedUrls.add(url);
      // Fire-and-forget: warm the browser cache; errors are benign
      fetch(url, { priority: "low" }).catch(() => {});
    }
  }
}

// ── Playback ─────────────────────────────────────────────────────────────────

let currentAudioEl: HTMLAudioElement | null = null;

/**
 * Play the pre-generated audio for a phrase.
 *
 * @returns true if playback started; false if an error occurred before play.
 */
export async function playPhraseAudio(
  phrase: Phrase,
  studyLang: StudyLanguage,
  voiceName: string,
  playbackRate = 1.0,
): Promise<boolean> {
  const url = getPhraseAudioUrl(phrase, studyLang, voiceName);

  if (currentAudioEl) {
    currentAudioEl.pause();
    currentAudioEl = null;
  }

  const audio = new Audio(url);
  audio.playbackRate = Math.max(0.25, Math.min(4.0, playbackRate));
  currentAudioEl = audio;

  audio.onended = () => {
    if (currentAudioEl === audio) currentAudioEl = null;
  };

  audio.onerror = () => {
    if (currentAudioEl === audio) currentAudioEl = null;
  };

  await audio.play();
  return true;
}
