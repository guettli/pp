/**
 * Phoneme Party - Main Application
 * German pronunciation practice with AI
 */

// Import styles
import "./styles/main.css";

// Import Bootstrap JavaScript for interactive components (collapse, modals, etc.)
// Using side-effect import to initialize Bootstrap's data-bs-* attributes
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import { getLanguage, initI18n, onLanguageChange, setLanguage, t } from "./i18n.js";

// Import types
import { getLevelText, type SupportedLanguage } from "./types.js";

// Import state management
import { resetFeedback, setState, state } from "./state.js";

// Import database
import { db } from "./db.js";

// Import history UI
import { initHistory, refreshHistory } from "./ui/history.js";

// Import utilities
import { findPhraseByName, getRandomPhrase } from "./utils/random.js";
import { adjustUserLevel, loadUserLevel, saveUserLevel } from "./utils/level-adjustment.js";

// Import audio modules
import { prepareAudioForWhisper } from "./audio/processor.js";
import { AudioRecorder } from "./audio/recorder.js";

// Import phoneme extraction (direct IPA output)
import { extractPhonemes, loadPhonemeModel } from "./speech/phoneme-extractor.js";
import { RealTimePhonemeDetector } from "./speech/realtime-phoneme-detector.js";

// Import comparison logic
import { scorePronunciation } from "./comparison/scorer.js";

// Import UI components
import {
  displayFeedback,
  hideFeedback,
  playDesiredPronunciation,
  playRecording,
  setupVoiceSelectionButton,
} from "./ui/feedback.js";
import {
  hideLoading,
  showError,
  showInlineError,
  showLoading,
  updateLoadingProgress,
} from "./ui/loading.js";
import { displayPhrase } from "./ui/phrase-display.js";
import {
  resetRecordButton,
  setRecordButtonEnabled,
  showMicrophonePermissionNotice,
  showProcessing,
  showProcessingDetails,
  showRecordingTooShortError,
  updateRecordButton,
} from "./ui/recorder-ui.js";

// Track recording state
let recordingTimer: ReturnType<typeof setInterval> | null = null;
let pendingStopTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeDetector: RealTimePhonemeDetector | null = null;

/**
 * Initialize the application
 */
async function init() {
  try {
    console.log("Initializing Phoneme Party...");

    initI18n();
    setState({
      webgpuAvailable: typeof navigator !== "undefined" && !!navigator.gpu,
    });
    updateWebGpuStatus();

    // Show loading overlay
    showLoading();

    // Start a heartbeat to show the page is still alive
    let heartbeatCount = 0;
    const heartbeat = setInterval(() => {
      heartbeatCount++;
      console.log(
        `💓 Heartbeat ${heartbeatCount} - Still loading... (${heartbeatCount * 5}s elapsed)`,
      );
    }, 5000);

    // Initialize audio recorder
    setState({ recorder: new AudioRecorder() });
    console.log("Audio recorder initialized");

    // Load phoneme extraction model
    console.log("Starting to load phoneme model...");
    console.log("⏱️ This may take 30-60 seconds for first load (downloading ~230MB)");
    updateLoadingProgress({ status: "downloading", progress: 0 });

    const loadStart = performance.now();
    await loadPhonemeModel((progress: { status: string; progress: number }) => {
      updateLoadingProgress(progress);
    });
    const modelLoadMs = performance.now() - loadStart;

    // Stop heartbeat
    clearInterval(heartbeat);

    console.log("Phoneme model loaded successfully");
    console.log(`Model load time: ${modelLoadMs.toFixed(0)}ms`);

    // Check if WebGPU is being used
    const webgpuBackend = state.webgpuAvailable ? "webgpu" : "wasm";
    setState({
      isModelLoaded: true,
      modelLoadMs,
      webgpuBackend,
    });
    updateWebGpuStatus();

    // Expose API for testing (only in non-production builds)
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      (window as Window & { __test_api?: { extractPhonemes: typeof extractPhonemes } }).__test_api = {
        extractPhonemes,
      };
    }

    // Hide loading, show main content
    hideLoading();

    // Load first phrase (from query string or random)
    loadInitialPhrase();

    // Set up event listeners
    setupEventListeners();

    // Setup voice selection dialog on long press for both play buttons
    setupVoiceSelectionButton(["play-target-btn", "replay-phrase-btn"]);

    // Initialize history view (non-blocking, errors won't crash app)
    try {
      initHistory();
    } catch (error) {
      console.error("Failed to initialize history:", error);
      // Continue anyway - history is not critical for app to function
    }

    // Load user level (non-blocking, errors won't crash app)
    try {
      await loadAndUpdateUserLevel(getLanguage());
    } catch (error) {
      console.error("Failed to load user level:", error);
      // Continue anyway - level is not critical for app to function
    }

    console.log("Application initialized successfully");
  } catch (error) {
    console.error("Initialization error:", error);
    showError(error);
  }
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
  const recordBtn = document.getElementById("record-btn");
  const nextPhraseBtn = document.getElementById("next-phrase-btn");
  const languageSelect = document.getElementById("language-select");
  const levelSlider = document.getElementById("level-slider");

  if (recordBtn) {
    // Use mousedown/mouseup for press-and-hold recording
    recordBtn.addEventListener("mousedown", handleRecordStart);
    recordBtn.addEventListener("mouseup", handleRecordStop);
    recordBtn.addEventListener("mouseleave", handleRecordStop);

    // Also support touch events for mobile
    recordBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      void handleRecordStart();
    });
    recordBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      void handleRecordStop();
    });
    recordBtn.addEventListener("touchcancel", handleRecordStop);
  }

  if (nextPhraseBtn) {
    nextPhraseBtn.addEventListener("click", () => void nextPhrase());
  }

  if (languageSelect && languageSelect instanceof HTMLSelectElement) {
    languageSelect.value = getLanguage();
    languageSelect.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      setLanguage(target.value);
    });

    onLanguageChange((language) => {
      languageSelect.value = language;
      resetRecordButton();
      void nextPhrase();
      updateWebGpuStatus();
      refreshHistory();
      void loadAndUpdateUserLevel(language);
    });
  }

  if (levelSlider && levelSlider instanceof HTMLInputElement) {
    levelSlider.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      const level = parseInt(target.value, 10);
      setState({ userLevel: level });
      updateLevelDisplay(level);
    });

    levelSlider.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      const level = parseInt(target.value, 10);
      void saveUserLevel(getLanguage(), level);
    });
  }
}

function updateWebGpuStatus() {
  const status = document.getElementById("webgpu-status");
  if (!status) return;

  if (!state.webgpuAvailable) {
    status.textContent = t("footer.webgpu_status_unavailable");
    status.classList.add("text-warning");
    // Show prominent warning
    console.warn("⚠️ WebGPU not available - using WASM fallback (slower)");
    return;
  }

  if (state.webgpuBackend === "webgpu") {
    status.textContent = t("footer.webgpu_status_active");
    status.classList.remove("text-warning");
    return;
  }

  if (state.webgpuBackend) {
    status.textContent = t("footer.webgpu_status_fallback", {
      backend: state.webgpuBackend,
    });
    if (state.webgpuBackend !== "webgpu") {
      status.classList.add("text-warning");
    }
    return;
  }

  status.textContent = t("footer.webgpu_status_available");
}

/**
 * Update level display in UI
 */
function updateLevelDisplay(level: number) {
  const levelValue = document.getElementById("level-value");
  const levelText = document.getElementById("level-text");
  const levelSlider = document.getElementById("level-slider");

  if (levelValue) {
    levelValue.textContent = level.toString();
  }

  if (levelText) {
    levelText.textContent = getLevelText(level);
  }

  if (levelSlider && levelSlider instanceof HTMLInputElement) {
    levelSlider.value = level.toString();
  }
}

/**
 * Load user level from database and update UI
 */
async function loadAndUpdateUserLevel(language: SupportedLanguage) {
  try {
    // Get actual user level from performance stats
    const stats = await db.getUserStats(language);
    const actualLevel = stats.userLevel;

    // Get user's manual level preference (or use actual level if not set)
    const savedLevel = await loadUserLevel(language);
    const userLevel = savedLevel !== null ? savedLevel : actualLevel;

    // Update state
    setState({
      userLevel,
      actualUserLevel: actualLevel,
    });

    // Update UI
    updateLevelDisplay(userLevel);

    console.log(
      `User level loaded: manual=${userLevel}, actual=${actualLevel}, mastered=${stats.masteredCount}/${stats.totalInWindow}`,
    );
  } catch (error) {
    console.warn("Could not load user level, using default:", error);
    setState({ userLevel: 1, actualUserLevel: 1 });
    updateLevelDisplay(1);
  }
}

/**
 * Handle record button press (start recording)
 */
async function handleRecordStart() {
  try {
    // Cancel any pending stop timer
    if (pendingStopTimer) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }

    // Don't start if already recording or processing
    if (state.isRecording || state.isProcessing) {
      return;
    }

    if (await shouldDeferForMicrophonePermission()) {
      return;
    }

    // Get target IPA for real-time detection
    if (!state.currentPhrase?.ipas || state.currentPhrase.ipas.length === 0) {
      throw new Error("No target phrase available for recording");
    }
    const targetIPA = state.currentPhrase.ipas[0].ipa;

    // Create real-time phoneme detector
    realtimeDetector = new RealTimePhonemeDetector(
      {
        targetIPA,
        threshold: 1.0, // 100% similarity threshold for auto-stop
        minChunksBeforeCheck: 2, // Wait for at least 2 chunks before checking
        silenceThreshold: 0.01, // RMS volume threshold for silence
        silenceDuration: 1500, // Stop after 1.5 seconds of silence
      },
      {
        onPhonemeUpdate: (phonemes, similarity) => {
          console.log(
            `Real-time phonemes: ${phonemes} (similarity: ${(similarity * 100).toFixed(1)}%)`,
          );
        },
        onTargetMatched: (phonemes, similarity) => {
          console.log(
            `Target matched! Phonemes: ${phonemes} (similarity: ${(similarity * 100).toFixed(1)}%)`,
          );
          // Auto-stop recording when target is matched
          void actuallyStopRecording();
        },
        onSilenceDetected: () => {
          console.log("Silence detected - stopping recording");
          // Auto-stop recording after silence
          void actuallyStopRecording();
        },
      },
    );

    // Start recording with streaming
    if (!state.recorder) {
      throw new Error("Audio recorder not initialized");
    }
    await state.recorder.start(
      () => {
        // Auto-stop callback when max duration reached - stop immediately
        void actuallyStopRecording();
      },
      (chunk: Blob) => {
        // Stream audio chunks to the detector
        if (realtimeDetector) {
          void realtimeDetector.addChunk(chunk);
        }
      },
      500, // Request data every 500ms
    );

    setState({ isRecording: true });
    updateRecordButton(true, 0);

    // Update UI with duration every 100ms
    const recorder = state.recorder;
    recordingTimer = setInterval(() => {
      if (recorder.isRecording()) {
        const duration = recorder.getDuration();
        updateRecordButton(true, duration);
      }
    }, 100);
  } catch (error) {
    console.error("Recording start error:", error);
    showInlineError(error);
    setState({ isRecording: false });
    resetRecordButton();
    realtimeDetector = null;
  }
}

async function shouldDeferForMicrophonePermission() {
  if (!navigator.permissions?.query) {
    return false;
  }

  let status = null;
  try {
    status = await navigator.permissions.query({ name: "microphone" });
  } catch (error) {
    console.warn("Microphone permission check failed:", error);
    return false;
  }

  if (status.state === "prompt" && state.recorder) {
    await state.recorder.requestPermission();
    showMicrophonePermissionNotice();
    resetRecordButton();
    return true;
  }

  return false;
}

/**
 * Handle record button release (stop recording and process)
 * Continues recording for 500ms after release to capture trailing audio
 */
async function handleRecordStop() {
  // Only process if actually recording
  if (!state.isRecording) {
    return;
  }

  // If already pending stop, don't schedule another
  if (pendingStopTimer) {
    return;
  }

  // Delay stop by 500ms to capture trailing audio
  pendingStopTimer = setTimeout(() => {
    pendingStopTimer = null;
    void actuallyStopRecording();
  }, 500);
}

/**
 * Actually stop recording and process the audio
 */
async function actuallyStopRecording() {
  try {
    // Clear any pending stop timer
    if (pendingStopTimer) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }

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
    if (!state.recorder) {
      throw new Error("Audio recorder not initialized");
    }
    const { blob: audioBlob, duration } = await state.recorder.stop();
    setState({ isRecording: false, lastRecordingBlob: audioBlob });

    // Clean up real-time detector
    const detector = realtimeDetector;
    realtimeDetector = null;

    console.log(`Recording stopped. Duration: ${duration}ms`);

    // Check if recording meets minimum duration
    if (duration < state.recorder.minDuration) {
      console.warn(`Recording too short: ${duration}ms < ${state.recorder.minDuration}ms`);
      showRecordingTooShortError();
      resetRecordButton();
      return;
    }

    // Set processing state (play recording after we have the score)
    setState({ isProcessing: true });

    // Show processing with simulated progress
    let progress = 0;
    showProcessing(progress);

    interface TimingStep {
      labelKey: string;
      ms: number;
    }
    interface DebugMeta {
      labelKey: string;
      value: string;
    }
    const timingStart = performance.now();
    const timingSteps: TimingStep[] = [];
    const recordTiming = (labelKey: string, start: number, end: number): void => {
      timingSteps.push({ labelKey, ms: end - start });
    };
    const measureAsync = async <T>(labelKey: string, action: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      const result = await action();
      recordTiming(labelKey, start, performance.now());
      return result;
    };
    const measureSync = <T>(labelKey: string, action: () => T): T => {
      const start = performance.now();
      const result = action();
      recordTiming(labelKey, start, performance.now());
      return result;
    };
    const debugMeta: DebugMeta[] = [];
    if (state.modelLoadMs !== null && Number.isFinite(state.modelLoadMs)) {
      debugMeta.push({
        labelKey: "processing.meta_model_load",
        value: `${state.modelLoadMs.toFixed(0)} ms`,
      });
    }
    const audioDurationSec = duration / 1000;
    debugMeta.push({
      labelKey: "processing.meta_audio_duration",
      value: `${audioDurationSec.toFixed(1)} s`,
    });
    debugMeta.push({
      labelKey: "processing.meta_backend",
      value: state.webgpuBackend || "wasm",
    });

    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        showProcessing(progress);
      }
    }, 100);

    try {
      let actualIPA: string;

      // Check if we can use real-time detector's results
      if (detector && detector.getLastPhonemes()) {
        console.log("Using phonemes from real-time detector");
        actualIPA = detector.getLastPhonemes();
        debugMeta.push({
          labelKey: "processing.meta_realtime",
          value: "Yes (auto-detected)",
        });
        showProcessing(85);
      } else {
        // Process the audio normally
        const audioData = await measureAsync("processing.step_prepare", () =>
          prepareAudioForWhisper(audioBlob),
        );
        showProcessing(30);

        // Extract phonemes directly using phoneme model
        actualIPA = await measureAsync("processing.step_phonemes", () =>
          extractPhonemes(audioData),
        );
        debugMeta.push({
          labelKey: "processing.meta_realtime",
          value: "No (post-processing)",
        });
        showProcessing(85);
      }

      console.log("Extracted IPA phonemes:", actualIPA);

      // Score the pronunciation using PanPhon features
      if (!state.currentPhrase) {
        throw new Error("No current phrase selected");
      }
      const currentPhrase = state.currentPhrase;

      // Add phrase level to debug metadata
      if (currentPhrase.level) {
        const levelText = getLevelText(currentPhrase.level);
        debugMeta.push({
          labelKey: "processing.meta_level",
          value: `${currentPhrase.level}/1000 (${levelText})`,
        });
      }

      // Check if ipas array exists and is not empty
      if (!currentPhrase.ipas || currentPhrase.ipas.length === 0) {
        throw new Error(`No IPA pronunciation data available for phrase: ${currentPhrase.phrase}`);
      }

      // Try all IPAs and use the best score
      const scores = currentPhrase.ipas.map((ipaEntry) =>
        measureSync("processing.step_score", () => scorePronunciation(ipaEntry.ipa, actualIPA)),
      );
      // Use the score with the highest similarity
      const score = scores.reduce(
        (best, current) => (current.similarity > best.similarity ? current : best),
        scores[0] || scorePronunciation("", actualIPA),
      );
      console.log("Score:", score);
      console.log("Target phonemes:", score.targetPhonemes);
      console.log("Actual phonemes:", score.actualPhonemes);
      console.log("Phoneme comparison:", score.phonemeComparison);
      showProcessing(95);

      // Update state
      setState({ score, actualIPA });

      // Play back the recording with score, which will auto-play desired pronunciation if score < 95%
      playRecording(score.similarityPercent);

      // Save result to database (non-blocking, errors won't crash app)
      try {
        await db.savePhraseResult(
          currentPhrase.phrase,
          getLanguage(),
          score.similarity * 100, // Convert 0-1 to 0-100
          actualIPA,
          currentPhrase.ipas[0].ipa,
          duration,
        );

        // Apply level adjustment based on performance
        const phraseLevel = currentPhrase.level || 1;
        const newUserLevel = adjustUserLevel(
          state.userLevel,
          state.actualUserLevel,
          score.similarity * 100,
          phraseLevel,
        );

        if (newUserLevel !== state.userLevel) {
          console.log(
            `Level adjusted: ${state.userLevel} -> ${newUserLevel} (actual: ${state.actualUserLevel}, score: ${(score.similarity * 100).toFixed(0)}%)`,
          );
          setState({ userLevel: newUserLevel });
          updateLevelDisplay(newUserLevel);
          await saveUserLevel(getLanguage(), newUserLevel);
        }

        // Refresh history to show new result and update actual level
        refreshHistory();
        await loadAndUpdateUserLevel(getLanguage());
      } catch (error) {
        console.error("Failed to save result to database:", error);
        // Continue anyway - saving is not critical for app to function
      }

      // Display feedback
      displayFeedback(currentPhrase, actualIPA, score);
      showProcessingDetails({
        steps: timingSteps,
        meta: debugMeta,
        totalMs: performance.now() - timingStart,
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
    console.error("Recording processing error:", error);

    // Show error in UI
    showInlineError(error);

    // Reset states
    setState({ isRecording: false, isProcessing: false });
    resetRecordButton();
  }
}

/**
 * Get phrase from URL query parameter (?phrase=...)
 * @returns {Object|null} Phrase object or null
 */
function getPhraseFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const phraseParam = params.get("phrase");
  if (!phraseParam) return null;
  return findPhraseByName(phraseParam, getLanguage());
}

/**
 * Update URL with current language and phrase
 */
function updateURL() {
  const params = new URLSearchParams();
  params.set("lang", getLanguage());
  if (state.currentPhrase?.phrase) {
    params.set("phrase", state.currentPhrase.phrase);
  }
  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newURL);
}

/**
 * Load initial phrase (from query string or random)
 */
function loadInitialPhrase() {
  const queryPhrase = getPhraseFromQueryString();
  if (queryPhrase) {
    setState({ currentPhrase: queryPhrase });
    displayPhrase(queryPhrase, () => void playDesiredPronunciation(queryPhrase.phrase), false);
    setRecordButtonEnabled(true);
    updateURL();
  } else {
    // On initial load, don't show any phrase - wait for user to click "Next Phrase"
    setRecordButtonEnabled(false);
  }
}

/**
 * Load next random phrase
 */
async function nextPhrase() {
  const language = getLanguage();

  // Use user's current level from state
  const userLevel = state.userLevel || 1;

  const phrase = getRandomPhrase(language, userLevel);
  setState({ currentPhrase: phrase });
  resetFeedback();

  // Display the phrase
  displayPhrase(phrase, () => void playDesiredPronunciation(phrase.phrase), true);

  // Hide feedback
  hideFeedback();

  // Enable record button
  setRecordButtonEnabled(true);

  // Update URL
  updateURL();

  // Play pronunciation automatically (works because of user interaction)
  void playDesiredPronunciation(phrase.phrase);
}

// Initialize the app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
