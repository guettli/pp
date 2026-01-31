import wordsDe from '../../words-de.json';
import wordsEn from '../../words-en.json';
import { getLanguage } from '../i18n.js';
import type { Word, SupportedLanguage } from '../types.js';

function getWordList(language: SupportedLanguage = getLanguage()): Word[] {
  return (language === 'de' ? wordsDe : wordsEn) as Word[];
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
