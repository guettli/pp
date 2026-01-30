/**
 * PanPhon-based phoneme distance calculation
 * Uses articulatory features for more accurate phonetic distance
 */

import panphonFeatures from './panphon-loader.js';

/**
 * Calculate distance between two phonemes based on their articulatory features
 * @param {string} phoneme1 - First IPA phoneme
 * @param {string} phoneme2 - Second IPA phoneme
 * @returns {number} Feature distance (0 = identical, higher = more different)
 */
function phonemeFeatureDistance(phoneme1, phoneme2) {
  if (phoneme1 === phoneme2) {
    return 0;
  }

  const features1 = panphonFeatures[phoneme1];
  const features2 = panphonFeatures[phoneme2];

  // If either phoneme is not in the feature table, use maximum distance
  if (!features1 || !features2) {
    return 1.0;
  }

  // Calculate Hamming distance between feature vectors
  // Features are represented as: 1 (present), 0 (absent), -1 (not applicable)
  let differences = 0;
  let comparableFeatures = 0;

  for (let i = 0; i < features1.length; i++) {
    const f1 = features1[i];
    const f2 = features2[i];

    // Only compare if both features are specified (not -1)
    if (f1 !== -1 && f2 !== -1) {
      comparableFeatures++;
      if (f1 !== f2) {
        differences++;
      }
    }
  }

  // Normalize by number of comparable features
  return comparableFeatures > 0 ? differences / comparableFeatures : 1.0;
}

/**
 * Split IPA string into individual phonemes
 * @param {string} ipa - IPA string
 * @returns {Array<string>} Array of phoneme symbols
 */
function splitIntoPhonemes(ipa) {
  // Remove stress marks and delimiters for processing
  const cleaned = ipa.replace(/[\/\[\]ˈˌ]/g, '').trim();

  // If input contains spaces, it's already tokenized (from wav2vec2 model)
  if (cleaned.includes(' ')) {
    return cleaned.split(/\s+/).filter(p => p.length > 0);
  }

  // Otherwise, split into graphemes (accounting for multi-character IPA symbols)
  // This is a simplified approach - ideally we'd use a proper IPA tokenizer
  const phonemes = [];
  let i = 0;

  while (i < cleaned.length) {
    // Try to match multi-character combinations first
    let matched = false;

    // Try matching 3-character sequences
    if (i + 2 < cleaned.length) {
      const triple = cleaned.substring(i, i + 3);
      if (panphonFeatures[triple]) {
        phonemes.push(triple);
        i += 3;
        matched = true;
      }
    }

    // Try matching 2-character sequences
    if (!matched && i + 1 < cleaned.length) {
      const pair = cleaned.substring(i, i + 2);
      if (panphonFeatures[pair]) {
        phonemes.push(pair);
        i += 2;
        matched = true;
      }
    }

    // Match single character
    if (!matched) {
      const single = cleaned[i];
      phonemes.push(single);
      i += 1;
    }
  }

  return phonemes;
}

/**
 * Calculate alignment cost for dynamic programming
 * @param {string} p1 - Phoneme from first sequence
 * @param {string} p2 - Phoneme from second sequence
 * @returns {number} Alignment cost
 */
function alignmentCost(p1, p2) {
  return phonemeFeatureDistance(p1, p2);
}

/**
 * Calculate phonetic distance using dynamic programming alignment
 * Similar to Levenshtein but uses phonetic feature distance
 * @param {Array<string>} phonemes1 - First phoneme sequence
 * @param {Array<string>} phonemes2 - Second phoneme sequence
 * @returns {number} Total alignment distance
 */
function alignPhonemes(phonemes1, phonemes2) {
  const m = phonemes1.length;
  const n = phonemes2.length;

  // Create DP table
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize first row and column (insertion/deletion costs)
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i; // Cost of deleting all phonemes
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j; // Cost of inserting all phonemes
  }

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const substitutionCost = alignmentCost(phonemes1[i - 1], phonemes2[j - 1]);

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,           // Deletion
        dp[i][j - 1] + 1,           // Insertion
        dp[i - 1][j - 1] + substitutionCost  // Substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate distance between two IPA strings using PanPhon features
 * @param {string} target - Target IPA pronunciation
 * @param {string} actual - Actual IPA pronunciation
 * @returns {Object} Distance metrics with phoneme-level analysis
 */
export function calculatePanPhonDistance(target, actual) {
  // Split into phonemes
  const targetPhonemes = splitIntoPhonemes(target);
  const actualPhonemes = splitIntoPhonemes(actual);

  // Calculate alignment distance
  const distance = alignPhonemes(targetPhonemes, actualPhonemes);

  // Calculate max length for normalization
  const maxLen = Math.max(targetPhonemes.length, actualPhonemes.length);

  // Calculate similarity (1 = identical, 0 = completely different)
  const similarity = maxLen === 0 ? 1 : 1 - (distance / maxLen);

  // Calculate phoneme-by-phoneme comparison for detailed feedback
  const phonemeComparison = [];

  for (let i = 0; i < maxLen; i++) {
    const targetPhoneme = targetPhonemes[i] || null;
    const actualPhoneme = actualPhonemes[i] || null;

    if (targetPhoneme && actualPhoneme) {
      const dist = phonemeFeatureDistance(targetPhoneme, actualPhoneme);
      phonemeComparison.push({
        target: targetPhoneme,
        actual: actualPhoneme,
        distance: dist,
        match: dist < 0.3  // Consider close matches as acceptable
      });
    } else if (targetPhoneme && !actualPhoneme) {
      // Missing phoneme (target exists but not spoken)
      phonemeComparison.push({
        target: targetPhoneme,
        actual: null,
        distance: 1.0,
        match: false
      });
    } else if (!targetPhoneme && actualPhoneme) {
      // Extra phoneme (spoken but not in target)
      phonemeComparison.push({
        target: null,
        actual: actualPhoneme,
        distance: 1.0,
        match: false
      });
    }
  }

  return {
    distance,
    similarity: Math.max(0, Math.min(1, similarity)),
    targetPhonemes,
    actualPhonemes,
    phonemeComparison,
    maxLength: maxLen
  };
}

/**
 * Get phoneme features for a given IPA symbol
 * @param {string} phoneme - IPA phoneme symbol
 * @returns {Array|null} Feature vector or null if not found
 */
export function getPhonemeFeatures(phoneme) {
  return panphonFeatures[phoneme] || null;
}

/**
 * Check if a phoneme is in the PanPhon database
 * @param {string} phoneme - IPA phoneme symbol
 * @returns {boolean}
 */
export function isKnownPhoneme(phoneme) {
  return phoneme in panphonFeatures;
}
