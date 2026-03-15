import type { Phrase } from "../types";
import { getCachedPhrases } from "./phrase-loader.js";

/**
 * Given a Phrase and a target uiLang, return the phrase text in that language.
 * en-GB phrases omit the "en-GB" field; their phrase text is used as the lookup key.
 * Falls back to the en-GB text when no match is found in the target language.
 * Requires preloadPhrases(uiLang) to have been called first; returns enKey as fallback.
 */
export function getPhraseInLang(phrase: Phrase, uiLang: string): string {
  const enKey = phrase["en-GB"] ?? phrase.phrase;
  if (uiLang === "en-GB") return enKey;
  const candidates = getCachedPhrases(uiLang);
  if (!candidates) return enKey;
  const match = candidates.find((p) => p["en-GB"] === enKey);
  return match ? match.phrase : enKey;
}
