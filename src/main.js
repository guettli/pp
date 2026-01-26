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

// Import speech recognition
import { convertTextToIPA } from './speech/ipa-converter.js';
import { loadWhisper, transcribeAudio } from './speech/whisper.js';

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
  showProcessing,
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

    // Load Whisper model
    console.log('Starting to load Whisper model...');
    console.log('⏱️ This may take 30-60 seconds for first load (downloading ~40MB)');
    updateLoadingProgress({ status: 'downloading', progress: 0 });

    const transcriber = await loadWhisper((progress) => {
      updateLoadingProgress(progress);
    });

    // Stop heartbeat
    clearInterval(heartbeat);

    console.log('Whisper model loaded successfully');
    setState({ transcriber, isModelLoaded: true });

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
    });
  }
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

    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        showProcessing(progress);
      }
    }, 100);

    try {
      // Process the audio
      const audioData = await prepareAudioForWhisper(audioBlob);
      showProcessing(30);

      // Transcribe using Whisper
      const language = getLanguage();
      const transcription = await transcribeAudio(audioData, language);
      console.log('Transcription:', transcription);
      showProcessing(70);

      // Convert transcription to IPA
      const ipaResult = convertTextToIPA(transcription, language);
      console.log('IPA conversion result:', ipaResult);

      if (!ipaResult.found) {
        // Word not in vocabulary - show helpful message
        console.warn('Transcribed word not in vocabulary');
        showProcessing(100);
        clearInterval(progressInterval);

        // Create a special "not found" score
        const score = {
          grade: t('feedback.word_not_recognized'),
          color: 'info',
          bootstrapClass: 'alert-info',
          message: t('feedback.word_not_recognized_message', {
            heard: transcription,
            target: state.currentWord.word
          }),
          similarity: 0,
          similarityPercent: 0,
          distance: -1,
          phonemeComparison: [],
          targetPhonemes: [],
          actualPhonemes: [],
          notFound: true
        };

        setState({ transcription, score });
        displayFeedback(state.currentWord, transcription, null, score);

        setTimeout(() => {
          resetRecordButton();
          setState({ isProcessing: false });
        }, 500);

        return;
      }

      const actualIPA = ipaResult.ipa;
      console.log('Actual IPA:', actualIPA);
      showProcessing(85);

      // Score the pronunciation using PanPhon features
      const score = scorePronunciation(state.currentWord.ipa, actualIPA);
      console.log('Score:', score);
      console.log('Target phonemes:', score.targetPhonemes);
      console.log('Actual phonemes:', score.actualPhonemes);
      console.log('Phoneme comparison:', score.phonemeComparison);
      showProcessing(95);

      // Update state
      setState({ transcription, score });

      // Display feedback
      displayFeedback(state.currentWord, transcription, actualIPA, score);
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
