import type { Phrase, SupportedLanguage } from "../types.js";
import { preloadPhrases, getCachedPhrases } from "./phrase-loader.js";

function getBlacklistedEnKeys(): Set<string> {
  const en = getCachedPhrases("en-GB") ?? [];
  return new Set(en.filter((p) => p.blacklisted).map((p) => p.phrase));
}

/**
 * Filter phrases to those within userLevel ± window, expanding window until matches are found.
 */
export function filterByLevel(phrases: Phrase[], userLevel: number): Phrase[] {
  let levelWindow = 80;
  let result: Phrase[] = [];

  while (result.length === 0 && levelWindow <= 1000) {
    const minLevel = userLevel - levelWindow;
    const maxLevel = userLevel + levelWindow;
    result = phrases.filter((p) => {
      if (p.level === undefined || p.level === null) return true;
      return p.level >= minLevel && p.level <= maxLevel;
    });
    if (result.length === 0) levelWindow *= 2;
  }

  return result.length > 0 ? result : phrases;
}

/**
 * Get the full phrase list, excluding blacklisted phrases.
 * For en-GB: excludes phrases with blacklisted: true.
 * For other languages: also excludes phrases whose en-GB key is blacklisted.
 */
export async function getAllPhrases(phraseLang: SupportedLanguage): Promise<Phrase[]> {
  await preloadPhrases(phraseLang);
  if (phraseLang !== "en-GB") await preloadPhrases("en-GB");
  const phrases = getCachedPhrases(phraseLang);
  if (!phrases) throw new Error(`Phrases not loaded for ${phraseLang}`);
  const blacklistedEnKeys = getBlacklistedEnKeys();
  return phrases.filter((p) => !p.blacklisted && !blacklistedEnKeys.has(p["en-GB"] ?? ""));
}

/**
 * Find a phrase by name (case-insensitive)
 */
export async function findPhraseByName(name: string, phraseLang: string): Promise<Phrase | null> {
  await preloadPhrases(phraseLang as SupportedLanguage);
  const phrases = getCachedPhrases(phraseLang) ?? [];
  const lowerName = name.toLowerCase();
  return phrases.find((w) => w.phrase?.toLowerCase() === lowerName) ?? null;
}

/**
 * Find the equivalent phrase in a target language using the en-GB key as a cross-language lookup.
 * For en-GB phrases the phrase text itself is the key (no "en-GB" field).
 * Returns null if no match is found.
 */
export async function findPhraseByEnGBKey(
  enKey: string,
  phraseLang: string,
): Promise<Phrase | null> {
  await preloadPhrases(phraseLang as SupportedLanguage);
  const phrases = getCachedPhrases(phraseLang) ?? [];
  if (phraseLang === "en-GB") {
    return phrases.find((p) => p.phrase === enKey) ?? null;
  }
  return phrases.find((p) => p["en-GB"] === enKey) ?? null;
}
