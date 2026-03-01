/**
 * Pre-generated phrase audio playback.
 *
 * Audio files are produced offline by scripts/generate_google_tts_audio.py
 * and scripts/generate_edge_tts_audio.py, stored as static assets:
 *
 *   static/audio/{lang}/{voice}/{hash}.opus
 *   static/audio/manifest.json
 *
 * The manifest maps:  lang → voice → phrase_text → hash_filename
 *
 * Voices currently generated:
 *   de-DE → google-male, google-female, edge-tts-male, edge-tts-female
 *   en-GB → google-male, google-female, edge-tts-male, edge-tts-female
 *   fr-FR → google-male, google-female, edge-tts-male, edge-tts-female
 */

import { resolve } from "$app/paths";
import type { StudyLanguage } from "../types.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceOption {
  /** Internal key matching the directory name, e.g. "google-male" */
  name: string;
  /** Human-readable label shown in the voice selector */
  label: string;
}

// Manifest: lang → voice → phrase → md5_hex filename (without extension)
type Manifest = Record<string, Record<string, Record<string, string>>>;

// ── Voice label registry ─────────────────────────────────────────────────────

/** Sentinel voice name for the "pick a random voice each phrase" option. */
export const RANDOM_VOICE_NAME = "random";

const VOICE_LABELS: Record<string, string> = {
  "google-male": "Google ♂",
  "google-female": "Google ♀",
  "edge-tts-male": "Edge TTS ♂",
  "edge-tts-female": "Edge TTS ♀",
};

// ── Manifest state ───────────────────────────────────────────────────────────

let manifest: Manifest | null = null;

/**
 * Load the audio manifest from {base}/audio/manifest.json.
 * Should be called once at app startup (before voice selection is shown).
 * Fails silently if the file is not present (audio not yet generated).
 */
export async function loadPhraseAudioManifest(): Promise<void> {
  try {
    // @ts-expect-error TS2554 - resolve() types require route params; static asset paths have none
    const resp = await fetch(resolve("/audio/manifest.json"));
    if (resp.ok) {
      manifest = (await resp.json()) as Manifest;
    }
  } catch {
    manifest = null;
  }
}

// ── Query helpers ────────────────────────────────────────────────────────────

/**
 * Return the list of pre-generated voices available for a study language.
 * Only includes voices that have at least one phrase entry.
 * Returns an empty array if the manifest has not been loaded yet.
 */
export function getAvailableVoices(studyLang: StudyLanguage): VoiceOption[] {
  if (!manifest) return [];
  return Object.entries(manifest[studyLang] ?? {})
    .filter(([, phrases]) => Object.keys(phrases).length > 0)
    .map(([name]) => ({
      name,
      label: VOICE_LABELS[name] ?? name,
    }));
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
 * Check whether a pre-generated audio file exists for this phrase + voice.
 */
export function hasPhraseAudio(
  phrase: string,
  studyLang: StudyLanguage,
  voiceName: string,
): boolean {
  return !!manifest?.[studyLang]?.[voiceName]?.[phrase];
}

/**
 * Return the URL path to the pre-generated MP3, or null if not available.
 */
export function getPhraseAudioUrl(
  phrase: string,
  studyLang: StudyLanguage,
  voiceName: string,
): string | null {
  const hash = manifest?.[studyLang]?.[voiceName]?.[phrase];
  if (!hash) return null;
  // @ts-expect-error TS2345 - resolve() types match known routes; static asset paths are untyped
  return resolve(`/audio/${studyLang}/${voiceName}/${hash}.opus`);
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
 * No-ops silently on metered/cellular connections or if the manifest is not loaded.
 *
 * @param phrases    Phrase texts to prefetch (top-N by priority).
 * @param studyLang  Study language (e.g. "de-DE").
 * @param voiceNames Voices to prefetch; pass all available voices when in "random" mode.
 */
export function prefetchPhraseAudio(
  phrases: string[],
  studyLang: StudyLanguage,
  voiceNames: string[],
): void {
  if (!manifest) return;
  if (isMeteredConnection()) return;
  for (const phrase of phrases) {
    for (const voice of voiceNames) {
      const url = getPhraseAudioUrl(phrase, studyLang, voice);
      if (!url || prefetchedUrls.has(url)) continue;
      prefetchedUrls.add(url);
      // Fire-and-forget: warm the browser cache; errors are benign
      // @ts-expect-error `priority` not yet in RequestInit types
      fetch(url, { priority: "low" }).catch(() => {});
    }
  }
}

// ── Playback ─────────────────────────────────────────────────────────────────

let currentAudioEl: HTMLAudioElement | null = null;

/**
 * Play the pre-generated MP3 for a phrase.
 *
 * @returns true if the file was found and playback started; false otherwise.
 */
export async function playPhraseAudio(
  phrase: string,
  studyLang: StudyLanguage,
  voiceName: string,
  playbackRate = 1.0,
): Promise<boolean> {
  const url = getPhraseAudioUrl(phrase, studyLang, voiceName);
  if (!url) return false;

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
