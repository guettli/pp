/**
 * Feedback display component
 */

import { t } from '../i18n.js';

/**
 * Display pronunciation feedback with phoneme-level analysis
 * @param {Object} targetWord - Target word object
 * @param {string} actualIPA - Actual IPA pronunciation
 * @param {Object} score - Score object from scorer.js
 */
export function displayFeedback(targetWord, actualIPA, score) {
  const section = document.getElementById('feedback-section');
  const alert = document.getElementById('feedback-alert');
  const targetElement = document.getElementById('feedback-target');
  const targetIPAElement = document.getElementById('feedback-target-ipa');
  const actualIPAElement = document.getElementById('feedback-actual-ipa');
  const scoreElement = document.getElementById('feedback-score');
  const messageElement = document.getElementById('feedback-message');

  // Show feedback section
  if (section) section.style.display = 'block';

  // Update alert styling with phoneme-level details
  if (alert) {
    alert.className = `alert ${score.bootstrapClass}`;

    let phonemeDetails = '';

    // Only show phoneme analysis if word was recognized
    if (!score.notFound && score.phonemeComparison && score.phonemeComparison.length > 0) {
      phonemeDetails = `<div class="mt-2 small"><strong>${t('feedback.phoneme_analysis')}</strong><br>`;
      phonemeDetails += '<div class="d-flex flex-wrap gap-2 mt-1">';

      score.phonemeComparison.forEach((comp, idx) => {
        const matchClass = comp.match ? 'bg-success' : 'bg-warning';
        const matchIcon = comp.match ? '✓' : '~';
        phonemeDetails += `
          <span class="badge ${matchClass} text-white" title="${t('feedback.distance')}: ${comp.distance.toFixed(2)}">
            ${matchIcon} [${comp.target}] → [${comp.actual}]
          </span>
        `;
      });

      phonemeDetails += '</div></div>';
    }

    // Show similarity only if word was recognized
    const similarityText = score.notFound
      ? ''
      : `<p class="mb-0">${t('feedback.phoneme_similarity')} <strong>${score.similarityPercent}%</strong></p>`;

    alert.innerHTML = `
      <h4 class="alert-heading">${score.grade}</h4>
      ${similarityText}
      ${phonemeDetails}
    `;
  }

  // Update content
  if (targetElement) targetElement.textContent = targetWord.word;
  if (targetIPAElement) {
    targetIPAElement.textContent = targetWord.ipa;
  }
  if (actualIPAElement) {
    // Show phonemes if available, or "Not recognized" if word not found
    if (score.notFound) {
      actualIPAElement.textContent = t('feedback.word_not_in_vocab');
    } else {
      actualIPAElement.textContent = actualIPA || '—';
    }
  }
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
