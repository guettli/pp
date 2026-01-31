/**
 * Core PanPhon distance calculation logic
 * Shared between browser and Node.js environments
 */

/**
 * Create distance calculation functions with the given feature table
 * @param {Object} panphonFeatures - Map of phoneme -> feature array
 * @returns {Object} Object containing all distance functions
 */
export function createDistanceCalculator(panphonFeatures) {
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
      .replace(/[\/\[\]ˈˌ]/g, '')
      .replace(/\u0361/g, '')  // Remove tie bar
      .replace(/(.)\u0329/g, 'ə$1')  // Syllabic consonant → schwa + consonant
      .replace(/\u0261/g, 'g')  // IPA ɡ → regular g
      .replace(/\u032F/g, '')  // Remove non-syllabic mark
      .replace(/\u0334/g, '')  // Remove velarized mark
      .replace(/\u02DE/g, '')  // Remove rhoticity hook
      .replace(/\u025D/g, 'ɜɹ')  // Expand rhotic vowel ɝ → ɜɹ
      .trim();

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
   * Also returns the aligned phoneme pairs via backtracking
   * @param {Array<string>} phonemes1 - First phoneme sequence (target)
   * @param {Array<string>} phonemes2 - Second phoneme sequence (actual)
   * @returns {Object} {distance, alignment} where alignment is array of {target, actual, distance}
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

    // Backtrack to find alignment
    const alignment = [];
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
   * @param {string} target - Target IPA pronunciation
   * @param {string} actual - Actual IPA pronunciation
   * @returns {Object} Distance metrics with phoneme-level analysis
   */
  function calculatePanPhonDistance(target, actual) {
    // Split into phonemes
    const targetPhonemes = splitIntoPhonemes(target);
    const actualPhonemes = splitIntoPhonemes(actual);

    // Calculate alignment distance and get optimal alignment
    const { distance, alignment } = alignPhonemes(targetPhonemes, actualPhonemes);

    // Calculate max length for normalization
    const maxLen = Math.max(targetPhonemes.length, actualPhonemes.length);

    // Calculate similarity (1 = identical, 0 = completely different)
    const similarity = maxLen === 0 ? 1 : 1 - (distance / maxLen);

    // Build phoneme comparison from alignment, adding match flag
    const phonemeComparison = alignment.map(item => ({
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
   * @param {string} phoneme - IPA phoneme symbol
   * @returns {Array|null} Feature vector or null if not found
   */
  function getPhonemeFeatures(phoneme) {
    return panphonFeatures[phoneme] || null;
  }

  /**
   * Check if a phoneme is in the PanPhon database
   * @param {string} phoneme - IPA phoneme symbol
   * @returns {boolean}
   */
  function isKnownPhoneme(phoneme) {
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
