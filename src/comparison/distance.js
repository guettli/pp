/**
 * IPA distance calculation using Levenshtein distance
 */

import { distance } from 'fastest-levenshtein';

/**
 * Normalize IPA string for comparison
 * Removes formatting characters but preserves phonetic content
 * @param {string} ipa - IPA string
 * @returns {string} Normalized IPA
 */
function normalizeIPA(ipa) {
  // Remove slashes, stress marks can optionally be removed for lenient comparison
  return ipa
    .replace(/[\/\[\]]/g, '')  // Remove delimiters
    .replace(/[ˈˌ]/g, '')      // Remove stress marks for lenient comparison
    .trim();
}

/**
 * Calculate distance between two IPA strings
 * @param {string} target - Target IPA pronunciation
 * @param {string} actual - Actual IPA pronunciation
 * @returns {Object} Distance metrics
 */
export function calculateIPADistance(target, actual) {
  // Normalize both strings
  const normalizedTarget = normalizeIPA(target);
  const normalizedActual = normalizeIPA(actual);

  // Calculate Levenshtein distance
  const dist = distance(normalizedTarget, normalizedActual);

  // Calculate max length for normalization
  const maxLen = Math.max(normalizedTarget.length, normalizedActual.length);

  // Avoid division by zero
  const similarity = maxLen === 0 ? 1 : 1 - (dist / maxLen);

  return {
    distance: dist,
    similarity: Math.max(0, Math.min(1, similarity)),  // Clamp to [0, 1]
    maxLength: maxLen,
    targetNormalized: normalizedTarget,
    actualNormalized: normalizedActual
  };
}
