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
 * Word boundaries are marked in the phonemeComparison data via the wordBoundary flag
 */
export function generatePhonemeComparisonHTML(
  phonemeComparison: PhonemeComparisonItem[],
  t: (key: string) => string = (key) => key.split(".").pop() || key, // Default translation function
): string {
  // Guard against undefined or non-array input
  if (!phonemeComparison || !Array.isArray(phonemeComparison) || phonemeComparison.length === 0) {
    return "";
  }

  // Check if there are any word boundaries
  const hasWordBoundaries = phonemeComparison.some((item) => item.wordBoundary);

  // If no word boundaries, group all phonemes together
  if (!hasWordBoundaries) {
    return generateWordBlock(phonemeComparison, t);
  }

  // Split phonemes by word boundaries
  let html = '<div class="phoneme-words-wrapper">';
  let currentWord: PhonemeComparisonItem[] = [];

  for (const item of phonemeComparison) {
    // Start a new word block when we hit a word boundary
    if (item.wordBoundary && currentWord.length > 0) {
      html += generateWordBlock(currentWord, t);
      currentWord = [];
    }
    currentWord.push(item);
  }

  // Add the last word block
  if (currentWord.length > 0) {
    html += generateWordBlock(currentWord, t);
  }

  html += "</div>";
  return html;
}

/**
 * Determine CSS class for a phoneme pair
 */
function getPhonemeClass(comp: PhonemeComparisonItem): string {
  if (comp.match) {
    return "match";
  }
  if (comp.target && !comp.actual) {
    return "missing";
  }
  if (!comp.target && comp.actual) {
    return "extra";
  }
  return "mismatch";
}

/**
 * Generate HTML for a single phoneme span
 */
function generatePhonemeSpan(phoneme: string, pairClass: string, tooltip: string): string {
  const symbolAttr = phoneme !== "—" ? ` data-ipa-symbol="${phoneme.replace(/"/g, "&quot;")}"` : "";
  return tooltip
    ? `<span class="phoneme-char ${pairClass}"${symbolAttr} title="${tooltip}">${phoneme}</span>`
    : `<span class="phoneme-char ${pairClass}"${symbolAttr}>${phoneme}</span>`;
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
    const phoneme = comp.target || "—";
    const pairClass = getPhonemeClass(comp);
    const tooltip = comp.match ? "" : `${t("feedback.distance")}: ${comp.distance.toFixed(2)}`;
    html += generatePhonemeSpan(phoneme, pairClass, tooltip);
  }
  html += "</div>";

  // Actual row
  html += '<div class="phoneme-word-row phoneme-word-actual">';
  for (const comp of comparisons) {
    const phoneme = comp.actual || "—";
    const pairClass = getPhonemeClass(comp);
    const tooltip = comp.match ? "" : `${t("feedback.distance")}: ${comp.distance.toFixed(2)}`;
    html += generatePhonemeSpan(phoneme, pairClass, tooltip);
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
