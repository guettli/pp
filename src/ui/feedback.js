/**
 * Feedback display component
 */

import { t, getLanguage } from '../i18n.js';
import { state, setState } from '../state.js';
import { generateExplanationsHTML } from './ipa-helper.js';

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

  // Increment recording count and hide tips after 3 recordings
  setState({ recordingCount: state.recordingCount + 1 });
  if (state.recordingCount >= 3) {
    const tipsSection = document.getElementById('tips-section');
    if (tipsSection) tipsSection.style.display = 'none';
  }

  // Update alert styling
  if (alert) {
    alert.className = `alert ${score.bootstrapClass}`;

    // Show similarity only if word was recognized
    const similarityText = score.notFound
      ? ''
      : `<p class="mb-0">${t('feedback.phoneme_similarity')} <strong>${score.similarityPercent}%</strong></p>`;

    alert.innerHTML = `
      <h4 class="alert-heading">${score.grade}</h4>
      ${similarityText}
    `;
  }

  // Generate side-by-side phoneme comparison
  const comparisonGrid = document.getElementById('phoneme-comparison-grid');
  if (comparisonGrid) {
    if (!score.notFound && score.phonemeComparison && score.phonemeComparison.length > 0) {
      comparisonGrid.innerHTML = generatePhonemeComparisonHTML(score.phonemeComparison);
    } else if (score.notFound) {
      comparisonGrid.innerHTML = `<span class="text-muted">${t('feedback.word_not_in_vocab')}</span>`;
    } else {
      comparisonGrid.innerHTML = '';
    }
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
    setupPlayButton(playBtn);
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

  // Populate IPA explanations
  const ipaContent = document.getElementById('ipa-explanations-content');
  if (ipaContent) {
    const explanationsHTML = generateExplanationsHTML(targetWord.ipa, actualIPA);
    ipaContent.innerHTML = explanationsHTML || t('feedback.no_ipa_help');
  }

  // Set up IPA help toggle (collapse initially)
  const ipaToggle = document.getElementById('ipa-help-toggle');
  const ipaExplanations = document.getElementById('ipa-explanations');
  const ipaChevron = document.getElementById('ipa-help-chevron');
  if (ipaToggle && ipaExplanations) {
    ipaExplanations.style.display = 'none';
    if (ipaChevron) {
      ipaChevron.className = 'bi bi-chevron-down ms-1';
    }
    ipaToggle.onclick = (e) => {
      e.preventDefault();
      const isHidden = ipaExplanations.style.display === 'none';
      ipaExplanations.style.display = isHidden ? 'block' : 'none';
      if (ipaChevron) {
        ipaChevron.className = isHidden ? 'bi bi-chevron-up ms-1' : 'bi bi-chevron-down ms-1';
      }
    };
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

  // Collapse IPA explanations
  const ipaExplanations = document.getElementById('ipa-explanations');
  if (ipaExplanations) ipaExplanations.style.display = 'none';
  const ipaChevron = document.getElementById('ipa-help-chevron');
  if (ipaChevron) ipaChevron.className = 'bi bi-chevron-down ms-1';

  // Cancel any ongoing speech
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
}

// Long-press threshold in milliseconds
const LONG_PRESS_THRESHOLD = 500;

/**
 * Set up play button with click (play) and long-press (download) handlers
 * @param {HTMLElement} playBtn - The play button element
 */
function setupPlayButton(playBtn) {
  let pressTimer = null;
  let isLongPress = false;

  const handlePressStart = (e) => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      downloadRecording();
    }, LONG_PRESS_THRESHOLD);
  };

  const handlePressEnd = (e) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (!isLongPress) {
      playRecording();
    }
  };

  const handlePressCancel = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  // Remove existing listeners by cloning
  const newBtn = playBtn.cloneNode(true);
  playBtn.parentNode.replaceChild(newBtn, playBtn);

  // Mouse events
  newBtn.addEventListener('mousedown', handlePressStart);
  newBtn.addEventListener('mouseup', handlePressEnd);
  newBtn.addEventListener('mouseleave', handlePressCancel);

  // Touch events
  newBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePressStart(e);
  });
  newBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    handlePressEnd(e);
  });
  newBtn.addEventListener('touchcancel', handlePressCancel);
}

/**
 * Download the last recorded audio as a file
 */
function downloadRecording() {
  if (!state.lastRecordingBlob) return;

  const url = URL.createObjectURL(state.lastRecordingBlob);
  const a = document.createElement('a');
  a.href = url;

  // Use current word for filename if available
  const word = state.currentWord?.word || 'recording';
  const lang = getLanguage();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  a.download = `${word}_${timestamp}_${lang}.webm`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

/**
 * Generate HTML for side-by-side phoneme comparison using table layout
 * @param {Array} phonemeComparison - Array of {target, actual, match, distance}
 * @returns {string} - HTML string
 */
function generatePhonemeComparisonHTML(phonemeComparison) {
  // Build class and tooltip data for each column
  const columns = phonemeComparison.map((comp) => {
    const target = comp.target || '—';
    const actual = comp.actual || '—';

    let pairClass = 'match';
    if (!comp.match) {
      if (comp.target && !comp.actual) {
        pairClass = 'missing';
      } else if (!comp.target && comp.actual) {
        pairClass = 'extra';
      } else {
        pairClass = 'mismatch';
      }
    }

    const tooltip = comp.match
      ? t('feedback.phoneme_match')
      : `${t('feedback.distance')}: ${comp.distance.toFixed(2)}`;

    return { target, actual, pairClass, tooltip };
  });

  // Build table with two rows for proper text selection
  let html = '<table class="phoneme-table"><tbody>';

  // Target row
  html += '<tr class="phoneme-row-target">';
  for (const col of columns) {
    html += `<td class="phoneme-cell ${col.pairClass}" title="${col.tooltip}">${col.target}</td>`;
  }
  html += '</tr>';

  // Actual row
  html += '<tr class="phoneme-row-actual">';
  for (const col of columns) {
    html += `<td class="phoneme-cell ${col.pairClass}" title="${col.tooltip}">${col.actual}</td>`;
  }
  html += '</tr>';

  html += '</tbody></table>';
  return html;
}
