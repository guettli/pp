/**
 * Pre-generated phrase audio playback.
 *
 * Audio files are produced offline by scripts/generate-phrase-audio.sh and
 * stored as static assets:
 *
 *   static/audio/{lang}/{voice}/{md5_16}.mp3
 *   static/audio/manifest.json
 *
 * The manifest maps:  lang → voice → phrase_text → md5_filename
 *
 * Voices currently generated:
 *   de-DE → piper-thorsten (Thorsten ♂), piper-kerstin (Kerstin ♀)
 *   en-GB → piper-alan    (Alan ♂)
 *   fr-FR → piper-siwis   (Siwis ♀)
 */

import { resolve } from "$app/paths";
import type { StudyLanguage } from "../types.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceOption {
  /** Internal key matching the directory name, e.g. "piper-thorsten" */
  name: string;
  /** Human-readable label shown in the voice selector */
  label: string;
}

// Manifest: lang → voice → phrase → md5_hex filename (without extension)
type Manifest = Record<string, Record<string, Record<string, string>>>;

// ── Voice label registry ─────────────────────────────────────────────────────

const VOICE_LABELS: Record<string, string> = {
  "piper-thorsten": "Thorsten ♂",
  "piper-alan": "Alan ♂",
  "piper-siwis": "Siwis ♀",
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
 * Returns an empty array if the manifest has not been loaded yet.
 */
export function getAvailableVoices(studyLang: StudyLanguage): VoiceOption[] {
  if (!manifest) return [];
  return Object.keys(manifest[studyLang] ?? {}).map((name) => ({
    name,
    label: VOICE_LABELS[name] ?? name,
  }));
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
  return resolve(`/audio/${studyLang}/${voiceName}/${hash}.mp3`);
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
