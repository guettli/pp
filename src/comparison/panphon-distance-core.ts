/**
 * Core PanPhon distance calculation logic
 * Shared between browser and Node.js environments
 */

import type { AlignmentItem, PanPhonDistanceResult, PhonemeComparisonItem, PhonemeFeatureTable } from '../types.js';

export interface DistanceCalculator {
  calculatePanPhonDistance: (target: string, actual: string) => PanPhonDistanceResult;
  getPhonemeFeatures: (phoneme: string) => number[] | null;
  isKnownPhoneme: (phoneme: string) => boolean;
  splitIntoPhonemes: (ipa: string) => string[];
  phonemeFeatureDistance: (phoneme1: string, phoneme2: string) => number;
}

/**
 * Create distance calculation functions with the given feature table
 */
export function createDistanceCalculator(panphonFeatures: PhonemeFeatureTable): DistanceCalculator {
  /**
   * Calculate distance between two phonemes based on their articulatory features
   */
  function phonemeFeatureDistance(phoneme1: string, phoneme2: string): number {
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
    //
    // IMPORTANT: We now count ALL feature differences, including cases where one
    // phoneme has -1 (not applicable) and the other has 0 or 1. This fixes the
    // bug where phonemes like 'n' and 't' were considered identical because they
    // only differed in features where one had -1.
    let differences = 0;
    const totalFeatures = features1.length;

    for (let i = 0; i < totalFeatures; i++) {
      const f1 = features1[i];
      const f2 = features2[i];

      // Count any difference, including -1 vs non-(-1)
      if (f1 !== f2) {
        differences++;
      }
    }

    // Normalize by total number of features (not just comparable ones)
    return differences / totalFeatures;
  }

  /**
   * Split IPA string into individual phonemes
   */
  function splitIntoPhonemes(ipa: string): string[] {
    // Normalize IPA for comparison:
    // - Remove stress marks and delimiters
    // - Remove tie bars (U+0361) to split affricates: t͡s → ts
    // - Expand syllabic consonants: l̩ → əl, n̩ → ən (U+0329 = syllabic mark)
    // - Normalize IPA g (U+0261) to regular g
    // - Remove non-syllabic mark (U+032F): a̯ → a
    // - Remove velarized/dark l mark (U+0334): l̴ → l
    // - Remove rhoticity hook (U+02DE): ɜ˞ → ɜ
    // - Expand rhotic vowel ɝ (U+025D) → ɜ ɹ
    const cleaned = ipa
      .replace(/[/[\]ˈˌ]/g, '')
      .replace(/\u0361/g, '')  // Remove tie bar
      .replace(/(.)\u0329/g, 'ə$1')  // Syllabic consonant → schwa + consonant
      .replace(/\u0261/g, 'g')  // IPA ɡ → regular g
      .replace(/\u032F/g, '')  // Remove non-syllabic mark
      .replace(/\u0334/g, '')  // Remove velarized mark
      .replace(/\u02DE/g, '')  // Remove rhoticity hook
      .replace(/\u025D/g, 'ɜɹ')  // Expand rhotic vowel ɝ → ɜɹ
      .trim();

    // If input contains spaces, it's already tokenized (from phoneme model)
    if (cleaned.includes(' ')) {
      const tokens = cleaned.split(/\s+/).filter((p: string) => p.length > 0);
      // Combine vowels with following length mark (ː)
      const combined: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === 'ː' && combined.length > 0) {
          // Append length mark to previous token
          combined[combined.length - 1] += 'ː';
        } else {
          combined.push(tokens[i]);
        }
      }
      return combined;
    }

    // Otherwise, split into graphemes (accounting for multi-character IPA symbols)
    // This is a simplified approach - ideally we'd use a proper IPA tokenizer
    const phonemes: string[] = [];
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
   */
  function alignmentCost(p1: string, p2: string): number {
    return phonemeFeatureDistance(p1, p2);
  }

  /**
   * Calculate phonetic distance using dynamic programming alignment
   * Similar to Levenshtein but uses phonetic feature distance
   * Also returns the aligned phoneme pairs via backtracking
   */
  function alignPhonemes(phonemes1: string[], phonemes2: string[]): { distance: number; alignment: AlignmentItem[] } {
    const m = phonemes1.length;
    const n = phonemes2.length;

    // Create DP table
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0) as number[]);

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

    // Backtrack to find alignment
    const alignment: AlignmentItem[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0) {
        const substitutionCost = alignmentCost(phonemes1[i - 1], phonemes2[j - 1]);
        if (dp[i][j] === dp[i - 1][j - 1] + substitutionCost) {
          // Substitution or match
          alignment.unshift({
            target: phonemes1[i - 1],
            actual: phonemes2[j - 1],
            distance: substitutionCost
          });
          i--;
          j--;
          continue;
        }
      }
      if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        // Deletion (target phoneme missing in actual)
        alignment.unshift({
          target: phonemes1[i - 1],
          actual: null,
          distance: 1.0
        });
        i--;
      } else if (j > 0) {
        // Insertion (extra phoneme in actual)
        alignment.unshift({
          target: null,
          actual: phonemes2[j - 1],
          distance: 1.0
        });
        j--;
      }
    }

    return { distance: dp[m][n], alignment };
  }

  /**
   * Calculate distance between two IPA strings using PanPhon features
   */
  function calculatePanPhonDistance(target: string, actual: string): PanPhonDistanceResult {
    // Split into phonemes
    const targetPhonemes = splitIntoPhonemes(target);
    const actualPhonemes = splitIntoPhonemes(actual);

    // Calculate alignment distance and get optimal alignment
    const { distance, alignment } = alignPhonemes(targetPhonemes, actualPhonemes);

    // Calculate max length for normalization
    const maxLen = Math.max(targetPhonemes.length, actualPhonemes.length);

    // Calculate similarity (1 = identical, 0 = completely different)
    // Use max length to properly penalize both missing and extra phonemes
    // This ensures that "munda" (5 phonemes) gets a worse score than "mund" (4 phonemes)
    // when compared to "moːnt" (4 phonemes target)
    const similarity = maxLen === 0 ? 1 : Math.max(0, 1 - (distance / maxLen));

    // Build phoneme comparison from alignment, adding match flag
    const phonemeComparison: PhonemeComparisonItem[] = alignment.map(item => ({
      target: item.target,
      actual: item.actual,
      distance: item.distance,
      match: item.distance < 0.3  // Consider close matches as acceptable
    }));

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
   */
  function getPhonemeFeatures(phoneme: string): number[] | null {
    return panphonFeatures[phoneme] || null;
  }

  /**
   * Check if a phoneme is in the PanPhon database
   */
  function isKnownPhoneme(phoneme: string): boolean {
    return phoneme in panphonFeatures;
  }

  return {
    calculatePanPhonDistance,
    getPhonemeFeatures,
    isKnownPhoneme,
    splitIntoPhonemes,
    phonemeFeatureDistance
  };
}
