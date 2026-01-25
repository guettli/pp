/**
 * Word display component
 */

/**
 * Display a word with its emoji and IPA
 * @param {Object} word - Word object with word, emoji, and ipa properties
 */
export function displayWord(word) {
  const emojiElement = document.getElementById('word-emoji');
  const textElement = document.getElementById('word-text');
  const ipaElement = document.getElementById('word-ipa');

  if (emojiElement) emojiElement.textContent = word.emoji;
  if (textElement) textElement.textContent = word.word;
  if (ipaElement) ipaElement.textContent = word.ipa;
}
