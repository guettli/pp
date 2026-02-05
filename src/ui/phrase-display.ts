/**
 * Phrase display component
 */

import type { Phrase } from '../types.js';

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
 * Display a phrase with its emoji and IPA
 */
export function displayPhrase(phrase: Phrase): void {
  const emojiElement = document.getElementById('phrase-emoji');
  const textElement = document.getElementById('phrase-text');
  const ipaElement = document.getElementById('phrase-ipaa');

  if (emojiElement) {
    // Check if emoji is an SVG path (starts with / or ends with .svg)
    if (phrase.emoji && (phrase.emoji.startsWith('/') || phrase.emoji.endsWith('.svg'))) {
      emojiElement.innerHTML = `<img src="${phrase.emoji}" alt="${phrase.phrase}" style="height: 1em; width: auto;">`;
    } else if (phrase.emoji) {
      // Use Twemoji for reliable cross-platform emoji display
      const twemojiUrl = emojiToTwemojiUrl(phrase.emoji);
      emojiElement.innerHTML = `<img src="${twemojiUrl}" alt="${phrase.emoji}" draggable="false" style="height: 1em; width: auto;">`;
    }
  }
  if (textElement) textElement.textContent = phrase.phrase;
  if (ipaElement) {
    // Use the first (standard) IPA pronunciation
    ipaElement.textContent = phrase.ipas[0]?.ipa || '';
  }
}
