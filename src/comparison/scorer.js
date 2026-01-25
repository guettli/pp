/**
 * Pronunciation scoring logic using PanPhon phoneme features
 */

import { calculateIPADistance } from './distance.js';
import { calculatePanPhonDistance } from './panphon-distance.js';

/**
 * Score pronunciation based on phoneme feature similarity using PanPhon
 * @param {string} targetIPA - Target IPA pronunciation
 * @param {string} actualIPA - Actual IPA pronunciation
 * @returns {Object} Score object with grade, color, message, and metrics
 */
export function scorePronunciation(targetIPA, actualIPA) {
  // Use PanPhon-based phoneme distance for more accurate scoring
  const panphonResult = calculatePanPhonDistance(targetIPA, actualIPA);
  const { distance: dist, similarity, phonemeComparison } = panphonResult;

  // Also calculate basic Levenshtein for fallback/comparison
  const basicResult = calculateIPADistance(targetIPA, actualIPA);

  let grade, color, message, bootstrapClass;

  // Determine grade based on PanPhon similarity threshold
  // PanPhon is more lenient with phonetically similar sounds
  if (similarity >= 0.85) {
    grade = 'Excellent!';
    color = 'success';
    bootstrapClass = 'alert-success';
    message = '🎉 Perfect pronunciation! You nailed it!';
  } else if (similarity >= 0.65) {
    grade = 'Good!';
    color = 'primary';
    bootstrapClass = 'alert-primary';
    message = '👍 Very close! Keep practicing!';
  } else if (similarity >= 0.45) {
    grade = 'Fair';
    color = 'warning';
    bootstrapClass = 'alert-warning';
    message = '💪 Getting there! Try again!';
  } else {
    grade = 'Try Again';
    color = 'danger';
    bootstrapClass = 'alert-danger';
    message = '🔄 Let\'s practice this word more.';
  }

  return {
    grade,
    color,
    bootstrapClass,
    message,
    similarity,
    similarityPercent: Math.round(similarity * 100),
    distance: dist,
    phonemeComparison,
    targetPhonemes: panphonResult.targetPhonemes,
    actualPhonemes: panphonResult.actualPhonemes,
    basicSimilarity: basicResult.similarity  // For comparison
  };
}
