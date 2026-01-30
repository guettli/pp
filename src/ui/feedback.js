/**
 * Feedback display component
 */

import { t, getLanguage } from '../i18n.js';
import { state } from '../state.js';

// Track current audio playback
let currentAudio = null;
let currentUtterance = null;
let speechSynthesisSupported = null; // null = unknown, true/false after check

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

  // Show play button if recording is available
  const playBtn = document.getElementById('play-recording-btn');
  if (playBtn && state.lastRecordingBlob) {
    playBtn.style.display = 'inline-block';
    playBtn.onclick = playRecording;
  }

  // Show play target button for desired pronunciation (if supported)
  const playTargetBtn = document.getElementById('play-target-btn');
  const speechHint = document.getElementById('speech-synthesis-hint');
  if (playTargetBtn && targetWord.word) {
    checkSpeechSynthesisSupport().then((supported) => {
      if (supported) {
        playTargetBtn.style.display = 'inline-block';
        playTargetBtn.onclick = () => playDesiredPronunciation(targetWord.word);
        if (speechHint) speechHint.style.display = 'none';
      } else {
        playTargetBtn.style.display = 'none';
        if (speechHint) {
          speechHint.style.display = 'inline';
          speechHint.textContent = t('feedback.speech_not_supported');
        }
      }
    });
  }

  // Scroll to feedback
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Hide feedback section
 */
export function hideFeedback() {
  const section = document.getElementById('feedback-section');
  if (section) section.style.display = 'none';

  // Hide play buttons
  const playBtn = document.getElementById('play-recording-btn');
  if (playBtn) playBtn.style.display = 'none';

  const playTargetBtn = document.getElementById('play-target-btn');
  if (playTargetBtn) playTargetBtn.style.display = 'none';

  const speechHint = document.getElementById('speech-synthesis-hint');
  if (speechHint) speechHint.style.display = 'none';

  // Cancel any ongoing speech
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
}

/**
 * Play the last recorded audio
 */
function playRecording() {
  if (!state.lastRecordingBlob) return;

  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const url = URL.createObjectURL(state.lastRecordingBlob);
  currentAudio = new Audio(url);
  currentAudio.onended = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;
  };
  currentAudio.play();
}

/**
 * Check if Web Speech API is supported and has voices available
 * @returns {Promise<boolean>}
 */
function checkSpeechSynthesisSupport() {
  // Return cached result if already checked
  if (speechSynthesisSupported !== null) {
    return Promise.resolve(speechSynthesisSupported);
  }

  // No speechSynthesis API at all
  if (!window.speechSynthesis) {
    speechSynthesisSupported = false;
    return Promise.resolve(false);
  }

  // Check if voices are available (they load async in some browsers)
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      speechSynthesisSupported = true;
      resolve(true);
      return;
    }

    // Wait for voices to load (with timeout)
    const timeout = setTimeout(() => {
      speechSynthesisSupported = false;
      resolve(false);
    }, 1000);

    speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timeout);
      const loadedVoices = speechSynthesis.getVoices();
      speechSynthesisSupported = loadedVoices.length > 0;
      resolve(speechSynthesisSupported);
    };
  });
}

/**
 * Play the desired pronunciation using Web Speech API
 * @param {string} word - The word to pronounce
 */
function playDesiredPronunciation(word) {
  if (!word || !window.speechSynthesis) return;

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  utterance.rate = 0.9; // Slightly slower for clarity

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}
