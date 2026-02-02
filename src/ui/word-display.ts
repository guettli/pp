/**
 * Word display component
 */

import type { Word } from '../types.js';

/**
 * Convert emoji to Twemoji CDN URL for reliable cross-platform display
 */
function emojiToTwemojiUrl(emoji: string): string {
  // Convert emoji to code points (excluding variation selectors like FE0F)
  const codePoints: string[] = [];
  for (let i = 0; i < emoji.length; i++) {
    const cp = emoji.codePointAt(i);
    if (cp === undefined) continue;
    // Skip variation selector FE0F
    if (cp === 0xfe0f) continue;
    codePoints.push(cp.toString(16));
    // Skip low surrogate if this was a surrogate pair
    if (cp > 0xffff) i++;
  }

  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codePoints.join('-')}.svg`;
}

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
    } else if (word.emoji) {
      // Use Twemoji for reliable cross-platform emoji display
      const twemojiUrl = emojiToTwemojiUrl(word.emoji);
      emojiElement.innerHTML = `<img src="${twemojiUrl}" alt="${word.emoji}" draggable="false" style="height: 1em; width: auto;">`;
    }
  }
  if (textElement) textElement.textContent = word.word;
  if (ipaElement) {
    // Use the first (standard) IPA pronunciation
    ipaElement.textContent = word.ipas[0]?.ipa || '';
  }
}
