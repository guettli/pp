/**
 * Phoneme Party - Main Application
 * German pronunciation practice with AI
 */

// Import styles
import './styles/main.css';

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
  resetRecordButton,
  setRecordButtonEnabled,
  showProcessing,
  updateRecordButton
} from './ui/recorder-ui.js';
import { displayWord } from './ui/word-display.js';

/**
 * Initialize the application
 */
async function init() {
  try {
    console.log('Initializing Phoneme Party...');

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

  if (recordBtn) {
    recordBtn.addEventListener('click', handleRecord);
  }

  if (nextWordBtn) {
    nextWordBtn.addEventListener('click', nextWord);
  }
}

/**
 * Handle record button click
 */
async function handleRecord() {
  try {
    if (!state.isRecording) {
      // Start recording
      await state.recorder.start();
      setState({ isRecording: true });
      updateRecordButton(true);
    } else {
      // Stop recording and process
      const audioBlob = await state.recorder.stop();
      setState({ isRecording: false });

      // Show processing state
      showProcessing();

      // Process the audio
      const audioData = await prepareAudioForWhisper(audioBlob);

      // Transcribe using Whisper
      const transcription = await transcribeAudio(audioData);
      console.log('Transcription:', transcription);

      // Convert transcription to IPA
      const actualIPA = convertTextToIPA(transcription);
      console.log('Actual IPA:', actualIPA);

      // Score the pronunciation
      const score = scorePronunciation(state.currentWord.ipa, actualIPA);
      console.log('Score:', score);

      // Update state
      setState({ transcription, score });

      // Display feedback
      displayFeedback(state.currentWord, transcription, actualIPA, score);

      // Reset record button
      resetRecordButton();
    }
  } catch (error) {
    console.error('Recording error:', error);

    // Show error in UI
    showInlineError(error);

    // Reset states
    setState({ isRecording: false });
    resetRecordButton();
  }
}

/**
 * Load next random word
 */
function nextWord() {
  const word = getRandomWord();
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
