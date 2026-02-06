/**
 * Phrase display component
 */

import { t } from "../i18n.js";
import type { Phrase } from "../types.js";

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

  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codePoints.join("-")}.svg`;
}

/**
 * Display a phrase with its emoji and IPA
 */
export function displayPhrase(
  phrase: Phrase,
  onPlayClick?: () => void,
  showTextImmediately = true,
): void {
  const emojiElement = document.getElementById("phrase-emoji");
  const textElement = document.getElementById("phrase-text");
  const ipaElement = document.getElementById("phrase-ipa");
  const replayBtn = document.getElementById("replay-phrase-btn");

  if (emojiElement) {
    if (showTextImmediately) {
      // Show emoji when text is shown
      if (phrase.emoji) {
        // Use Twemoji for reliable cross-platform emoji display
        const twemojiUrl = emojiToTwemojiUrl(phrase.emoji);
        emojiElement.innerHTML = `<img src="${twemojiUrl}" alt="${phrase.emoji}" draggable="false" style="height: 1em; width: auto;">`;
      }
      emojiElement.style.display = "";
    } else {
      // Hide emoji on initial load (before playing)
      emojiElement.style.display = "none";
    }
  }

  if (textElement) {
    if (showTextImmediately) {
      // Show the actual phrase text
      textElement.textContent = phrase.phrase;
      textElement.style.cursor = "default";
      textElement.onclick = null;
    } else {
      // Show "Press to Play" message instead of text
      textElement.textContent = `▶ ${t("buttons.press_to_play")}`;
      textElement.style.cursor = "pointer";
      textElement.onclick = () => {
        if (onPlayClick) {
          onPlayClick();
        }
        // After playing, show the actual text and emoji
        textElement.textContent = phrase.phrase;
        textElement.style.cursor = "default";
        textElement.onclick = null;

        // Show the emoji now
        if (emojiElement) {
          if (phrase.emoji && (phrase.emoji.startsWith("/") || phrase.emoji.endsWith(".svg"))) {
            emojiElement.innerHTML = `<img src="${phrase.emoji}" alt="${phrase.phrase}" style="height: 1em; width: auto;">`;
          } else if (phrase.emoji) {
            const twemojiUrl = emojiToTwemojiUrl(phrase.emoji);
            emojiElement.innerHTML = `<img src="${twemojiUrl}" alt="${phrase.emoji}" draggable="false" style="height: 1em; width: auto;">`;
          }
          emojiElement.style.display = "";
        }

        // Show replay button after initial play
        if (replayBtn) {
          replayBtn.style.display = "inline-block";
        }
      };
    }
  }

  // Setup replay button
  if (replayBtn && onPlayClick) {
    if (showTextImmediately) {
      // Show replay button when text is shown immediately
      replayBtn.style.display = "inline-block";
      replayBtn.onclick = onPlayClick;
    } else {
      // Hide replay button until first play
      replayBtn.style.display = "none";
    }
  }

  if (ipaElement) {
    // Use the first (standard) IPA pronunciation
    ipaElement.textContent = phrase.ipas[0]?.ipa || "";
  }
}
