import { load } from "js-yaml";
import phrasesDeYaml from "../../phrases-de-DE.yaml?raw";
import phrasesEnYaml from "../../phrases-en-GB.yaml?raw";
import phrasesFrYaml from "../../phrases-fr-FR.yaml?raw";
import type { Phrase, SupportedLanguage } from "../types.js";

// Parse YAML files
const phrasesDe: Phrase[] = load(phrasesDeYaml) as Phrase[];
const phrasesEn: Phrase[] = load(phrasesEnYaml) as Phrase[];
const phrasesFr: Phrase[] = load(phrasesFrYaml) as Phrase[];

function getPhraseList(phraseLang: string): Phrase[] {
  if (phraseLang === "de-DE") return phrasesDe;
  if (phraseLang === "fr-FR") return phrasesFr;
  return phrasesEn;
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
 * Get a random phrase from the phrase list, avoiding recently shown phrases.
 * @param phraseLang - The target language
 * @param userLevel - User level (1-1000). Filters phrases within ±80 levels, expanding if needed
 * @param recentPhrases - Phrase texts to avoid (most recent shown); relaxed if no alternatives exist
 */
export function getRandomPhrase(
  phraseLang: SupportedLanguage,
  userLevel: number,
  recentPhrases: string[] = [],
): Phrase {
  const phrasesData = getPhraseList(phraseLang);
  const filteredPhrases = filterByLevel(phrasesData, userLevel);

  // Exclude recently shown phrases if alternatives exist
  const recentSet = new Set(recentPhrases);
  const candidates = filteredPhrases.filter((p) => !recentSet.has(p.phrase));
  const pool = candidates.length > 0 ? candidates : filteredPhrases;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Get the full phrase list
 */
export function getAllPhrases(phraseLang: SupportedLanguage): Phrase[] {
  return getPhraseList(phraseLang);
}

/**
 * Find a phrase by name (case-insensitive)
 */
export function findPhraseByName(name: string, phraseLang: string): Phrase | null {
  const phrasesData = getPhraseList(phraseLang);
  const lowerName = name.toLowerCase();
  return phrasesData.find((w) => w.phrase.toLowerCase() === lowerName) || null;
}
