import yaml from "js-yaml";
import phrasesDe from "../../phrases-de-DE.yaml?raw";
import phrasesEn from "../../phrases-en-GB.yaml?raw";
import phrasesFr from "../../phrases-fr-FR.yaml?raw";
import type { Phrase } from "../types";

const phrasesByLang: Record<string, Phrase[]> = {
  "de-DE": yaml.load(phrasesDe) as Phrase[],
  "fr-FR": yaml.load(phrasesFr) as Phrase[],
  "en-GB": yaml.load(phrasesEn) as Phrase[],
};

/**
 * Given a Phrase and a target uiLang, return the phrase text in that language.
 * en-GB phrases omit the "en-GB" field; their phrase text is used as the lookup key.
 * Falls back to the en-GB text when no match is found in the target language.
 */
export function getPhraseInLang(phrase: Phrase, uiLang: string): string {
  const enKey = phrase["en-GB"] ?? phrase.phrase;
  if (uiLang === "en-GB") return enKey;
  const candidates = phrasesByLang[uiLang];
  if (!candidates) return enKey;
  const match = candidates.find((p) => p["en-GB"] === enKey);
  return match ? match.phrase : enKey;
}
