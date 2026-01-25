import wordsData from '../../words-de.json';

/**
 * Get a random word from the word list
 * @returns {Object} Random word object with word, emoji, and ipa properties
 */
export function getRandomWord() {
  const index = Math.floor(Math.random() * wordsData.length);
  return wordsData[index];
}

/**
 * Get the full word list
 * @returns {Array} Array of all words
 */
export function getAllWords() {
  return wordsData;
}
