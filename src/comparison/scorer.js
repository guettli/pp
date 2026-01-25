/**
 * Pronunciation scoring logic
 */

import { calculateIPADistance } from './distance.js';

/**
 * Score pronunciation based on IPA similarity
 * @param {string} targetIPA - Target IPA pronunciation
 * @param {string} actualIPA - Actual IPA pronunciation
 * @returns {Object} Score object with grade, color, message, and metrics
 */
export function scorePronunciation(targetIPA, actualIPA) {
  const { distance: dist, similarity } = calculateIPADistance(targetIPA, actualIPA);

  let grade, color, message, bootstrapClass;

  // Determine grade based on similarity threshold
  if (similarity >= 0.9) {
    grade = 'Excellent!';
    color = 'success';
    bootstrapClass = 'alert-success';
    message = '🎉 Perfect pronunciation! You nailed it!';
  } else if (similarity >= 0.7) {
    grade = 'Good!';
    color = 'primary';
    bootstrapClass = 'alert-primary';
    message = '👍 Very close! Keep practicing!';
  } else if (similarity >= 0.5) {
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
    distance: dist
  };
}
