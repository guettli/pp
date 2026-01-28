/**
 * Phoneme Party - Main Application
 * German pronunciation practice with AI
 */

// Import styles
import './styles/main.css';

import {
  getLanguage,
  initI18n,
  onLanguageChange,
  setLanguage,
  t
} from './i18n.js';

// Import state management
import { resetFeedback, setState, state } from './state.js';

// Import utilities
import { getRandomWord } from './utils/random.js';

// Import audio modules
import { prepareAudioForWhisper } from './audio/processor.js';
import { AudioRecorder } from './audio/recorder.js';

// Import phoneme extraction (direct IPA output)
import {
  loadPhonemeModel,
  extractPhonemes,
  isPhonemeModelLoaded
} from './speech/phoneme-extractor.js';

// Import comparison logic
import { scorePronunciation } from './comparison/scorer.js';

// Import UI components
import { displayFeedback, hideFeedback } from './ui/feedback.js';
import {
  hideLoading,
  showError,
  showInlineError,
  showLoading,
  updateLoadingProgress
} from './ui/loading.js';
import {
  hideProcessingProgress,
  resetRecordButton,
  setRecordButtonEnabled,
  showMicrophonePermissionNotice,
  showProcessing,
  showProcessingDetails,
  showRecordingTooShortError,
  updateRecordButton
} from './ui/recorder-ui.js';
import { displayWord } from './ui/word-display.js';

// Track recording state
let recordingTimer = null;

/**
 * Initialize the application
 */
async function init() {
  try {
    console.log('Initializing Phoneme Party...');

    initI18n();
    setState({ webgpuAvailable: typeof navigator !== 'undefined' && !!navigator.gpu });
    updateWebGpuStatus();

    // Show loading overlay
    showLoading();

    // Start a heartbeat to show the page is still alive
    let heartbeatCount = 0;
    const heartbeat = setInterval(() => {
      heartbeatCount++;
      console.log(`💓 Heartbeat ${heartbeatCount} - Still loading... (${heartbeatCount * 5}s elapsed)`);
    }, 5000);

    // Initialize audio recorder
    setState({ recorder: new AudioRecorder() });
    console.log('Audio recorder initialized');

    // Load phoneme extraction model (wav2vec2-espeak INT4)
    console.log('Starting to load phoneme model...');
    console.log('⏱️ This may take 30-60 seconds for first load (downloading ~230MB)');
    updateLoadingProgress({ status: 'downloading', progress: 0 });

    const loadStart = performance.now();
    await loadPhonemeModel((progress) => {
      updateLoadingProgress(progress);
    });
    const modelLoadMs = performance.now() - loadStart;

    // Stop heartbeat
    clearInterval(heartbeat);

    console.log('Phoneme model loaded successfully');
    console.log(`Model load time: ${modelLoadMs.toFixed(0)}ms`);

    // Check if WebGPU is being used
    const webgpuBackend = state.webgpuAvailable ? 'webgpu' : 'wasm';
    setState({
      isModelLoaded: true,
      modelLoadMs,
      webgpuBackend
    });
    updateWebGpuStatus();

    // Hide loading, show main content
    hideLoading();

    // Load first random word
    nextWord();

    // Set up event listeners
    setupEventListeners();

    console.log('Application initialized successfully');

  } catch (error) {
    console.error('Initialization error:', error);
    showError(error);
  }
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
  const recordBtn = document.getElementById('record-btn');
  const nextWordBtn = document.getElementById('next-word-btn');
  const languageSelect = document.getElementById('language-select');

  if (recordBtn) {
    // Use mousedown/mouseup for press-and-hold recording
    recordBtn.addEventListener('mousedown', handleRecordStart);
    recordBtn.addEventListener('mouseup', handleRecordStop);
    recordBtn.addEventListener('mouseleave', handleRecordStop);

    // Also support touch events for mobile
    recordBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleRecordStart();
    });
    recordBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleRecordStop();
    });
    recordBtn.addEventListener('touchcancel', handleRecordStop);
  }

  if (nextWordBtn) {
    nextWordBtn.addEventListener('click', nextWord);
  }

  if (languageSelect) {
    languageSelect.value = getLanguage();
    languageSelect.addEventListener('change', (event) => {
      setLanguage(event.target.value);
    });

    onLanguageChange((language) => {
      languageSelect.value = language;
      resetRecordButton();
      nextWord();
      updateWebGpuStatus();
    });
  }
}


function updateWebGpuStatus() {
  const status = document.getElementById('webgpu-status');
  if (!status) return;

  if (!state.webgpuAvailable) {
    status.textContent = t('footer.webgpu_status_unavailable');
    status.classList.add('text-warning');
    // Show prominent warning
    console.warn('⚠️ WebGPU not available - using WASM fallback (slower)');
    return;
  }

  if (state.webgpuBackend === 'webgpu') {
    status.textContent = t('footer.webgpu_status_active');
    status.classList.remove('text-warning');
    return;
  }

  if (state.webgpuBackend) {
    status.textContent = t('footer.webgpu_status_fallback', {
      backend: state.webgpuBackend
    });
    if (state.webgpuBackend !== 'webgpu') {
      status.classList.add('text-warning');
    }
    return;
  }

  status.textContent = t('footer.webgpu_status_available');
}

/**
 * Handle record button press (start recording)
 */
async function handleRecordStart() {
  try {
    // Don't start if already recording or processing
    if (state.isRecording || state.isProcessing) {
      return;
    }

    if (await shouldDeferForMicrophonePermission()) {
      return;
    }

    // Start recording
    await state.recorder.start(() => {
      // Auto-stop callback when max duration reached
      handleRecordStop();
    });

    setState({ isRecording: true });
    updateRecordButton(true, 0);

    // Update UI with duration every 100ms
    recordingTimer = setInterval(() => {
      if (state.recorder.isRecording()) {
        const duration = state.recorder.getDuration();
        updateRecordButton(true, duration);
      }
    }, 100);

  } catch (error) {
    console.error('Recording start error:', error);
    showInlineError(error);
    setState({ isRecording: false });
    resetRecordButton();
  }
}

async function shouldDeferForMicrophonePermission() {
  if (!navigator.permissions?.query) {
    return false;
  }

  let status = null;
  try {
    status = await navigator.permissions.query({ name: 'microphone' });
  } catch (error) {
    console.warn('Microphone permission check failed:', error);
    return false;
  }

  if (status.state === 'prompt') {
    await state.recorder.requestPermission();
    showMicrophonePermissionNotice();
    resetRecordButton();
    return true;
  }

  return false;
}

/**
 * Handle record button release (stop recording and process)
 */
async function handleRecordStop() {
  try {
    // Only process if actually recording
    if (!state.isRecording) {
      return;
    }

    // Clear the recording timer
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    // Stop recording and get blob with duration
    const { blob: audioBlob, duration } = await state.recorder.stop();
    setState({ isRecording: false });

    console.log(`Recording stopped. Duration: ${duration}ms`);

    // Check if recording meets minimum duration
    if (duration < state.recorder.minDuration) {
      console.warn(`Recording too short: ${duration}ms < ${state.recorder.minDuration}ms`);
      showRecordingTooShortError();
      resetRecordButton();
      return;
    }

    // Set processing state
    setState({ isProcessing: true });

    // Show processing with simulated progress
    let progress = 0;
    showProcessing(progress);

    const timingStart = performance.now();
    const timingSteps = [];
    const recordTiming = (labelKey, start, end) => {
      timingSteps.push({ labelKey, ms: end - start });
    };
    const measureAsync = async (labelKey, action) => {
      const start = performance.now();
      const result = await action();
      recordTiming(labelKey, start, performance.now());
      return result;
    };
    const measureSync = (labelKey, action) => {
      const start = performance.now();
      const result = action();
      recordTiming(labelKey, start, performance.now());
      return result;
    };
    const debugMeta = [];
    if (Number.isFinite(state.modelLoadMs)) {
      debugMeta.push({
        labelKey: 'processing.meta_model_load',
        value: `${state.modelLoadMs.toFixed(0)} ms`
      });
    }
    const audioDurationSec = duration / 1000;
    debugMeta.push({
      labelKey: 'processing.meta_audio_duration',
      value: `${audioDurationSec.toFixed(1)} s`
    });
    debugMeta.push({
      labelKey: 'processing.meta_backend',
      value: state.webgpuBackend || 'wasm'
    });

    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        showProcessing(progress);
      }
    }, 100);

    try {
      // Process the audio
      const audioData = await measureAsync('processing.step_prepare', () =>
        prepareAudioForWhisper(audioBlob)
      );
      showProcessing(30);

      // Extract phonemes directly using wav2vec2-espeak model
      const actualIPA = await measureAsync('processing.step_phonemes', () =>
        extractPhonemes(audioData)
      );
      console.log('Extracted IPA phonemes:', actualIPA);
      showProcessing(85);

      // Score the pronunciation using PanPhon features
      const score = measureSync('processing.step_score', () =>
        scorePronunciation(state.currentWord.ipa, actualIPA)
      );
      console.log('Score:', score);
      console.log('Target phonemes:', score.targetPhonemes);
      console.log('Actual phonemes:', score.actualPhonemes);
      console.log('Phoneme comparison:', score.phonemeComparison);
      showProcessing(95);

      // Update state (no text transcription, just phonemes)
      setState({ transcription: actualIPA, score });

      // Display feedback (actualIPA is now the "transcription")
      displayFeedback(state.currentWord, actualIPA, actualIPA, score);
      showProcessingDetails({
        steps: timingSteps,
        meta: debugMeta,
        totalMs: performance.now() - timingStart
      });
      showProcessing(100);

      // Clear progress interval
      clearInterval(progressInterval);

      // Reset record button
      setTimeout(() => {
        resetRecordButton();
        setState({ isProcessing: false });
      }, 500);

    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }

  } catch (error) {
    console.error('Recording processing error:', error);

    // Show error in UI
    showInlineError(error);

    // Reset states
    setState({ isRecording: false, isProcessing: false });
    resetRecordButton();
  }
}

/**
 * Load next random word
 */
function nextWord() {
  const word = getRandomWord(getLanguage());
  setState({ currentWord: word });
  resetFeedback();

  // Display the word
  displayWord(word);

  // Hide feedback
  hideFeedback();

  // Enable record button
  setRecordButtonEnabled(true);
}

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
