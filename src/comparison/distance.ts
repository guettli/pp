/**
 * IPA distance calculation using Levenshtein distance
 */

import { distance } from 'fastest-levenshtein';

export interface IPADistanceResult {
  distance: number;
  similarity: number;
  maxLength: number;
  targetNormalized: string;
  actualNormalized: string;
}

/**
 * Normalize IPA string for comparison
 * Removes formatting characters but preserves phonetic content
 */
function normalizeIPA(ipa: string): string {
  // Remove slashes, stress marks can optionally be removed for lenient comparison
  return ipa
    .replace(/[/[\]]/g, '')  // Remove delimiters
    .replace(/[ˈˌ]/g, '')      // Remove stress marks for lenient comparison
    .trim();
}

/**
 * Calculate distance between two IPA strings
 */
export function calculateIPADistance(target: string, actual: string): IPADistanceResult {
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
