import { load } from "js-yaml";
import phrasesDeYaml from "../../phrases-de.yaml?raw";
import phrasesEnYaml from "../../phrases-en.yaml?raw";
import { getLanguage } from "../i18n.js";
import type { Phrase, SupportedLanguage } from "../types.js";

// Parse YAML files
const phrasesDe: Phrase[] = load(phrasesDeYaml) as Phrase[];
const phrasesEn: Phrase[] = load(phrasesEnYaml) as Phrase[];

function getPhraseList(language: SupportedLanguage = getLanguage()): Phrase[] {
  return language === "de" ? phrasesDe : phrasesEn;
}

/**
 * Get a random phrase from the phrase list
 */
export function getRandomPhrase(language: SupportedLanguage = getLanguage()): Phrase {
  const phrasesData = getPhraseList(language);
  const index = Math.floor(Math.random() * phrasesData.length);
  return phrasesData[index];
}

/**
 * Get the full phrase list
 */
export function getAllPhrases(language: SupportedLanguage = getLanguage()): Phrase[] {
  return getPhraseList(language);
}

/**
 * Find a phrase by name (case-insensitive)
 */
export function findPhraseByName(
  name: string,
  language: SupportedLanguage = getLanguage(),
): Phrase | null {
  const phrasesData = getPhraseList(language);
  const lowerName = name.toLowerCase();
  return phrasesData.find((w) => w.phrase.toLowerCase() === lowerName) || null;
}
