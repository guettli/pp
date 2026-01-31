/**
 * Word display component
 */

import type { Word } from '../types.js';

/**
 * Display a word with its emoji and IPA
 */
export function displayWord(word: Word): void {
  const emojiElement = document.getElementById('word-emoji');
  const textElement = document.getElementById('word-text');
  const ipaElement = document.getElementById('word-ipa');

  if (emojiElement) {
    // Check if emoji is an SVG path (starts with / or ends with .svg)
    if (word.emoji && (word.emoji.startsWith('/') || word.emoji.endsWith('.svg'))) {
      emojiElement.innerHTML = `<img src="${word.emoji}" alt="${word.word}" style="height: 1em; width: auto;">`;
    } else {
      emojiElement.textContent = word.emoji;
    }
  }
  if (textElement) textElement.textContent = word.word;
  if (ipaElement) ipaElement.textContent = word.ipa;
}
