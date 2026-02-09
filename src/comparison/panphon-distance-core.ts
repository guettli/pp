/**
 * Core PanPhon distance calculation logic
 * Shared between browser and Node.js environments
 */

import type {
  AlignmentItem,
  PanPhonDistanceResult,
  PhonemeComparisonItem,
  PhonemeFeatureTable,
} from "../types.js";

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
/**
 * Parse a single IPA word/string into phonemes
 */
function parseIPAWord(cleaned: string, panphonFeatures: PhonemeFeatureTable): string[] {
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

  // Combine vowels with following length mark (ː)
  const combined: string[] = [];
  for (let j = 0; j < phonemes.length; j++) {
    if (phonemes[j] === "ː" && combined.length > 0) {
      // Append length mark to previous token
      combined[combined.length - 1] += "ː";
    } else {
      combined.push(phonemes[j]);
    }
  }

  return combined;
}

export function createDistanceCalculator(panphonFeatures: PhonemeFeatureTable): DistanceCalculator {
  /**
   * German phoneme equivalence rules
   * Maps phonemes that should be treated as equal for German pronunciation
   * Note: "ər" sequences are normalized to "ɐ" before phoneme splitting
   */
  const germanEquivalences: Array<Set<string>> = [
    new Set(["ɐ", "r"]), // r-vocalization: ɐ (and ɐ̯ after normalization) ↔ r
    new Set(["ə", "ɛ"]), // schwa variations
    new Set(["ʁ", "r"]), // uvular vs alveolar r
    new Set(["z", "s"]), // voiced vs voiceless s
  ];

  /**
   * Check if two phonemes are equivalent according to German phoneme rules
   */
  function areGermanEquivalent(p1: string, p2: string): boolean {
    for (const equivalenceSet of germanEquivalences) {
      if (equivalenceSet.has(p1) && equivalenceSet.has(p2)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate distance between two phonemes based on their articulatory features
   */
  function phonemeFeatureDistance(phoneme1: string, phoneme2: string): number {
    if (phoneme1 === phoneme2) {
      return 0;
    }

    // Check German equivalence rules
    if (areGermanEquivalent(phoneme1, phoneme2)) {
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
    // - Expand rhoticity hook (U+02DE): V˞ → Vɹ (e.g., ʊ˞ → ʊɹ)
    // - Expand rhotic vowel ɝ (U+025D) → ɜ ɹ
    // - German normalization: ər → ɐ, ɛʁ → ɐ (r-vocalization)
    const cleaned = ipa
      .replace(/[/[\]ˈˌ]/g, "")
      .replace(/\u0361/g, "") // Remove tie bar
      .replace(/(.)\u0329/g, "ə$1") // Syllabic consonant → schwa + consonant
      .replace(/\u0261/g, "g") // IPA ɡ → regular g
      .replace(/\u032F/g, "") // Remove non-syllabic mark
      .replace(/\u0334/g, "") // Remove velarized mark
      .replace(/(.)\u02DE/g, "$1ɹ") // Expand rhoticity: V˞ → Vɹ
      .replace(/\u025D/g, "ɜɹ") // Expand rhotic vowel ɝ → ɜɹ
      .replace(/ɛʁ/g, "ɐ") // German: normalize ɛʁ sequence to ɐ
      .replace(/ər/g, "ɐ") // German: normalize ər sequence to ɐ
      .trim();

    // If input contains spaces, check if it's already tokenized (single-char tokens)
    // or if it contains multi-word phrases (multi-char tokens that need parsing)
    if (cleaned.includes(" ")) {
      const tokens = cleaned.split(/\s+/).filter((p: string) => p.length > 0);

      // Check if all tokens are single characters (already tokenized by phoneme model)
      const allSingleChar = tokens.every((t: string) => t.length === 1 || t === "ː");
      if (allSingleChar) {
        // Already tokenized: just combine length marks with previous vowels
        const combined: string[] = [];
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i] === "ː" && combined.length > 0) {
            combined[combined.length - 1] += "ː";
          } else {
            combined.push(tokens[i]);
          }
        }
        return combined;
      }

      // Multi-word phrase: parse each word separately and combine
      const allPhonemes: string[] = [];
      for (const word of tokens) {
        // Parse each word using the character-by-character logic below
        const wordPhonemes = parseIPAWord(word, panphonFeatures);
        allPhonemes.push(...wordPhonemes);
      }
      return allPhonemes;
    }

    // Otherwise, split into graphemes (accounting for multi-character IPA symbols)
    return parseIPAWord(cleaned, panphonFeatures);
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
   *
   * Insertion/deletion penalty is set to 0.5 (instead of 1.0) following PanPhon's
   * low-cost variant approach. This is more appropriate for speech recognition where
   * phoneme recognizers may naturally add or miss short sounds, and substitutions
   * (wrong phoneme) are more informative errors than insertions/deletions.
   */
  function alignPhonemes(
    phonemes1: string[],
    phonemes2: string[],
  ): { distance: number; alignment: AlignmentItem[] } {
    const m = phonemes1.length;
    const n = phonemes2.length;

    // Insertion/deletion penalty (reduced from 1.0 to 0.5 for speech recognition)
    const indelPenalty = 0.5;

    // Create DP table
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0) as number[]);

    // Initialize first row and column (insertion/deletion costs)
    for (let i = 1; i <= m; i++) {
      dp[i][0] = i * indelPenalty; // Cost of deleting all phonemes
    }
    for (let j = 1; j <= n; j++) {
      dp[0][j] = j * indelPenalty; // Cost of inserting all phonemes
    }

    // Fill DP table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const substitutionCost = alignmentCost(phonemes1[i - 1], phonemes2[j - 1]);

        dp[i][j] = Math.min(
          dp[i - 1][j] + indelPenalty, // Deletion
          dp[i][j - 1] + indelPenalty, // Insertion
          dp[i - 1][j - 1] + substitutionCost, // Substitution
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
            distance: substitutionCost,
          });
          i--;
          j--;
          continue;
        }
      }
      if (i > 0 && dp[i][j] === dp[i - 1][j] + indelPenalty) {
        // Deletion (target phoneme missing in actual)
        alignment.unshift({
          target: phonemes1[i - 1],
          actual: null,
          distance: indelPenalty,
        });
        i--;
      } else if (j > 0) {
        // Insertion (extra phoneme in actual)
        alignment.unshift({
          target: null,
          actual: phonemes2[j - 1],
          distance: indelPenalty,
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
    const similarity = maxLen === 0 ? 1 : Math.max(0, 1 - distance / maxLen);

    // Build phoneme comparison from alignment, adding match flag
    const phonemeComparison: PhonemeComparisonItem[] = alignment.map((item) => ({
      target: item.target,
      actual: item.actual,
      distance: item.distance,
      match: item.distance < 0.3, // Consider close matches as acceptable
    }));

    return {
      distance,
      similarity: Math.max(0, Math.min(1, similarity)),
      targetPhonemes,
      actualPhonemes,
      phonemeComparison,
      maxLength: maxLen,
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
    phonemeFeatureDistance,
  };
}
