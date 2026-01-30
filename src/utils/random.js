import wordsDe from '../../words-de.json';
import wordsEn from '../../words-en.json';
import { getLanguage } from '../i18n.js';

function getWordList(language = getLanguage()) {
  return language === 'de' ? wordsDe : wordsEn;
}

/**
 * Get a random word from the word list
 * @returns {Object} Random word object with word, emoji, and ipa properties
 */
export function getRandomWord(language = getLanguage()) {
  const wordsData = getWordList(language);
  const index = Math.floor(Math.random() * wordsData.length);
  return wordsData[index];
}

/**
 * Get the full word list
 * @returns {Array} Array of all words
 */
export function getAllWords(language = getLanguage()) {
  return getWordList(language);
}

/**
 * Find a word by name (case-insensitive)
 * @param {string} name - Word to find
 * @param {string} language - Language code
 * @returns {Object|null} Word object or null if not found
 */
export function findWordByName(name, language = getLanguage()) {
  const wordsData = getWordList(language);
  const lowerName = name.toLowerCase();
  return wordsData.find((w) => w.word.toLowerCase() === lowerName) || null;
}
