/**
 * Feedback display component
 */

/**
 * Display pronunciation feedback
 * @param {Object} targetWord - Target word object
 * @param {string} transcription - Transcribed text
 * @param {string} actualIPA - Actual IPA pronunciation
 * @param {Object} score - Score object from scorer.js
 */
export function displayFeedback(targetWord, transcription, actualIPA, score) {
  const section = document.getElementById('feedback-section');
  const alert = document.getElementById('feedback-alert');
  const targetElement = document.getElementById('feedback-target');
  const transcriptionElement = document.getElementById('feedback-transcription');
  const targetIPAElement = document.getElementById('feedback-target-ipa');
  const actualIPAElement = document.getElementById('feedback-actual-ipa');
  const scoreElement = document.getElementById('feedback-score');
  const messageElement = document.getElementById('feedback-message');

  // Show feedback section
  if (section) section.style.display = 'block';

  // Update alert styling
  if (alert) {
    alert.className = `alert ${score.bootstrapClass}`;
    alert.innerHTML = `
      <h4 class="alert-heading">${score.grade}</h4>
      <p class="mb-0">Similarity: <strong>${score.similarityPercent}%</strong></p>
    `;
  }

  // Update content
  if (targetElement) targetElement.textContent = targetWord.word;
  if (transcriptionElement) {
    transcriptionElement.textContent = transcription || '(No speech detected)';
  }
  if (targetIPAElement) targetIPAElement.textContent = targetWord.ipa;
  if (actualIPAElement) actualIPAElement.textContent = actualIPA || '—';
  if (scoreElement) scoreElement.textContent = score.grade;
  if (messageElement) messageElement.textContent = score.message;

  // Scroll to feedback
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Hide feedback section
 */
export function hideFeedback() {
  const section = document.getElementById('feedback-section');
  if (section) section.style.display = 'none';
}
