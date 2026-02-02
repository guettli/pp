import wordsDeYaml from '../../words-de.yaml?raw';
import wordsEnYaml from '../../words-en.yaml?raw';
import { load } from 'js-yaml';
import { getLanguage } from '../i18n.js';
import type { Word, SupportedLanguage } from '../types.js';

// Parse YAML files
const wordsDe: Word[] = load(wordsDeYaml) as Word[];
const wordsEn: Word[] = load(wordsEnYaml) as Word[];

function getWordList(language: SupportedLanguage = getLanguage()): Word[] {
  return language === 'de' ? wordsDe : wordsEn;
}

/**
 * Get a random word from the word list
 */
export function getRandomWord(language: SupportedLanguage = getLanguage()): Word {
  const wordsData = getWordList(language);
  const index = Math.floor(Math.random() * wordsData.length);
  return wordsData[index];
}

/**
 * Get the full word list
 */
export function getAllWords(language: SupportedLanguage = getLanguage()): Word[] {
  return getWordList(language);
}

/**
 * Find a word by name (case-insensitive)
 */
export function findWordByName(name: string, language: SupportedLanguage = getLanguage()): Word | null {
  const wordsData = getWordList(language);
  const lowerName = name.toLowerCase();
  return wordsData.find((w) => w.word.toLowerCase() === lowerName) || null;
}
