import { load } from "js-yaml";
import phrasesDeYaml from "../../phrases-de.yaml?raw";
import phrasesEnYaml from "../../phrases-en.yaml?raw";
import type { Phrase, SupportedLanguage } from "../types.js";

// Parse YAML files
const phrasesDe: Phrase[] = load(phrasesDeYaml) as Phrase[];
const phrasesEn: Phrase[] = load(phrasesEnYaml) as Phrase[];

function getPhraseList(phraseLang: string): Phrase[] {
  return phraseLang === "de" ? phrasesDe : phrasesEn;
}

/**
 * Get a random phrase from the phrase list
 * @param language - The target language
 * @param userLevel - User level (1-1000). Filters phrases within ±80 levels, expanding if needed
 */
export function getRandomPhrase(phraseLang: SupportedLanguage, userLevel: number): Phrase {
  const phrasesData = getPhraseList(phraseLang);

  // Start with initial level window
  let levelWindow = 80;
  let filteredPhrases: Phrase[] = [];

  // Try progressively broader windows until we find phrases
  while (filteredPhrases.length === 0 && levelWindow <= 1000) {
    const minLevel = userLevel - levelWindow;
    const maxLevel = userLevel + levelWindow;

    // Filter phrases within level range
    filteredPhrases = phrasesData.filter((phrase) => {
      // If phrase doesn't have a level, include it (fallback)
      if (phrase.level === undefined || phrase.level === null) {
        return true;
      }
      return phrase.level >= minLevel && phrase.level <= maxLevel;
    });

    // If no matches, double the window and try again
    if (filteredPhrases.length === 0) {
      levelWindow *= 2;
    }
  }

  // Final fallback: use all phrases (should never happen)
  if (filteredPhrases.length === 0) {
    filteredPhrases = phrasesData;
  }

  const index = Math.floor(Math.random() * filteredPhrases.length);
  return filteredPhrases[index];
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
