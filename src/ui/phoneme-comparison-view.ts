/**
 * Shared phoneme comparison visualization
 * Used by both web UI (feedback.ts) and CLI tools
 */

import type { PhonemeComparisonItem } from "../types.js";

/**
 * Normalize IPA string for comparison
 * Removes slashes, stress marks, and other markers
 */
export function normalizeIPAForComparison(ipa: string): string {
  return ipa
    .replace(/[/[\]ˈˌ]/g, "") // Remove slashes and stress marks
    .replace(/\u0361/g, "") // Remove tie bar
    .replace(/\u032F/g, "") // Remove non-syllabic mark
    .replace(/\u0334/g, "") // Remove velarized mark
    .trim();
}

/**
 * Generate HTML for phoneme comparison grouped by words
 */
export function generatePhonemeComparisonHTML(
  phonemeComparison: PhonemeComparisonItem[],
  targetIPA: string,
  t: (key: string) => string = (key) => key.split(".").pop() || key, // Default translation function
): string {
  // Guard against undefined or non-array input
  if (!phonemeComparison || !Array.isArray(phonemeComparison) || phonemeComparison.length === 0) {
    return "";
  }

  // Normalize the IPA to match how phonemeComparison was created
  const normalizedIPA = normalizeIPAForComparison(targetIPA);

  // Split normalized IPA by spaces to detect word boundaries
  const words = normalizedIPA.split(/\s+/).filter((w) => w.length > 0);

  // If no word boundaries or single word, group all phonemes together
  if (words.length <= 1) {
    return generateWordBlock(phonemeComparison, t);
  }

  // Calculate word boundaries by matching phoneme targets to words
  const wordPhonemeIndices: number[] = [];

  // Simple approach: detect word boundaries by looking for next word start
  let phonemeIdx = 0;

  for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
    const word = words[wordIdx];
    const nextWord = wordIdx < words.length - 1 ? words[wordIdx + 1] : null;

    // Count phonemes until we've covered this word
    const startIdx = phonemeIdx;
    let charsMatched = 0;

    while (phonemeIdx < phonemeComparison.length && charsMatched < word.length) {
      const phoneme = phonemeComparison[phonemeIdx].target || "";

      // Check if this phoneme starts the next word (word boundary detection)
      if (nextWord && phoneme.length > 0 && nextWord.startsWith(phoneme)) {
        // We've reached the next word, stop here
        break;
      }

      charsMatched += phoneme.length;
      phonemeIdx++;

      // Stop if we've matched enough and the next phoneme starts the next word
      if (charsMatched >= word.length - 1 && nextWord && phonemeIdx < phonemeComparison.length) {
        const nextPhoneme = phonemeComparison[phonemeIdx].target || "";
        if (nextWord.startsWith(nextPhoneme)) {
          break;
        }
      }
    }

    wordPhonemeIndices.push(phonemeIdx - startIdx);
  }

  // Group phoneme comparisons by words
  let html = '<div class="phoneme-words-wrapper">';
  let phonemeIndex = 0;

  for (const wordLength of wordPhonemeIndices) {
    if (wordLength > 0) {
      const wordComparisons = phonemeComparison.slice(phonemeIndex, phonemeIndex + wordLength);
      html += generateWordBlock(wordComparisons, t);
      phonemeIndex += wordLength;
    }
  }

  // Handle any remaining phonemes (in case of extra insertions at the end)
  if (phonemeIndex < phonemeComparison.length) {
    const remainingComparisons = phonemeComparison.slice(phonemeIndex);
    html += generateWordBlock(remainingComparisons, t);
  }

  html += "</div>";
  return html;
}

/**
 * Generate HTML block for a single word's phoneme comparison
 */
export function generateWordBlock(
  comparisons: PhonemeComparisonItem[],
  t: (key: string) => string = (key) => key.split(".").pop() || key,
): string {
  let html = '<div class="phoneme-word-block">';

  // Target row
  html += '<div class="phoneme-word-row phoneme-word-target">';
  for (const comp of comparisons) {
    const target = comp.target || "—";
    let pairClass = "match";
    if (!comp.match) {
      if (comp.target && !comp.actual) {
        pairClass = "missing";
      } else if (!comp.target && comp.actual) {
        pairClass = "extra";
      } else {
        pairClass = "mismatch";
      }
    }

    const tooltip = comp.match ? "" : `${t("feedback.distance")}: ${comp.distance.toFixed(2)}`;

    html += tooltip
      ? `<span class="phoneme-char ${pairClass}" title="${tooltip}">${target}</span>`
      : `<span class="phoneme-char ${pairClass}">${target}</span>`;
  }
  html += "</div>";

  // Actual row
  html += '<div class="phoneme-word-row phoneme-word-actual">';
  for (const comp of comparisons) {
    const actual = comp.actual || "—";
    let pairClass = "match";
    if (!comp.match) {
      if (comp.target && !comp.actual) {
        pairClass = "missing";
      } else if (!comp.target && comp.actual) {
        pairClass = "extra";
      } else {
        pairClass = "mismatch";
      }
    }

    const tooltip = comp.match ? "" : `${t("feedback.distance")}: ${comp.distance.toFixed(2)}`;

    html += tooltip
      ? `<span class="phoneme-char ${pairClass}" title="${tooltip}">${actual}</span>`
      : `<span class="phoneme-char ${pairClass}">${actual}</span>`;
  }
  html += "</div>";

  html += "</div>";
  return html;
}

/**
 * Get the phoneme comparison CSS styles
 */
export function getPhonemeComparisonCSS(): string {
  return `
.phoneme-words-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  align-items: flex-start;
}

.phoneme-word-block {
  display: flex;
  flex-direction: column;
  border: 1px solid #dee2e6;
  border-radius: 0.375rem;
  overflow: hidden;
  background: #f8f9fa;
}

@media (max-width: 576px) {
  .phoneme-words-wrapper {
    flex-direction: column;
    align-items: stretch;
  }
  .phoneme-word-block {
    width: 100%;
  }
}

.phoneme-word-row {
  display: flex;
  gap: 0.125rem;
  padding: 0.25rem;
}

.phoneme-word-target {
  border-bottom: 1px dashed #adb5bd;
}

.phoneme-char {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 1rem;
  line-height: 1.4;
  min-width: 1.5rem;
  padding: 0.125rem 0.25rem;
  text-align: center;
  border-radius: 0.25rem;
}

.phoneme-word-target .phoneme-char {
  color: #495057;
}

.phoneme-word-actual .phoneme-char {
  color: #212529;
  font-weight: 500;
}

.phoneme-char.match {
  background: #d1e7dd;
}

.phoneme-char.mismatch {
  background: #fff3cd;
}

.phoneme-char.missing {
  background: #f8d7da;
}

.phoneme-char.extra {
  background: #cfe2ff;
}
`;
}
