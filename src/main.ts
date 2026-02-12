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
import { prepareAudioForModel } from "./audio/processor.js";
import { AudioRecorder } from "./audio/recorder.js";

// Import phoneme extraction (direct IPA output)
import {
  extractPhonemes,
  extractPhonemesDetailed,
  loadPhonemeModel,
} from "./speech/phoneme-extractor.js";
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
let realtimeDetector: RealTimePhonemeDetector | null = null;

// Track previous level for confirmation dialog
let previousLevel: number | null = null;

/**
 * Initialize the application
 */
async function init() {
  try {
    initI18n();
    setState({
      webgpuAvailable: typeof navigator !== "undefined" && !!navigator.gpu,
    });
    updateWebGpuStatus();

    // Show loading overlay
    showLoading();

    // Initialize audio recorder
    setState({ recorder: new AudioRecorder() });

    // Load phoneme extraction model
    updateLoadingProgress({ status: "downloading", progress: 0 });

    const loadStart = performance.now();
    await loadPhonemeModel((progress: { status: string; progress: number }) => {
      updateLoadingProgress(progress);
    });
    const modelLoadMs = performance.now() - loadStart;

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
      (window as Window & { __test_api?: { extractPhonemes: typeof extractPhonemes } }).__test_api =
        {
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
    // Use click for toggle recording (click to start, click to stop)
    recordBtn.addEventListener("click", handleRecordToggle);
  }

  if (nextPhraseBtn) {
    nextPhraseBtn.addEventListener("click", () => void nextPhrase());
  }

  const reprocessBtn = document.getElementById("reprocess-recording-btn");
  if (reprocessBtn) {
    reprocessBtn.addEventListener("click", () => void reprocessRecording());
  }

  const showModelDetailsBtn = document.getElementById("show-model-details-btn");
  if (showModelDetailsBtn) {
    showModelDetailsBtn.addEventListener("click", () => void showModelDetails());
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
    // Store initial level
    previousLevel = state.userLevel;

    levelSlider.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      const level = parseInt(target.value, 10);
      setState({ userLevel: level });
      updateLevelDisplay(level);
    });

    levelSlider.addEventListener("change", async (event) => {
      const target = event.target as HTMLInputElement;
      const newLevel = parseInt(target.value, 10);

      // Check if level actually changed
      if (previousLevel === newLevel) {
        return;
      }

      // Show confirmation dialog
      const confirmed = window.confirm(
        t("level.change_confirm", {
          oldLevel: previousLevel?.toString() || "1",
          newLevel: newLevel.toString(),
        }),
      );

      if (confirmed) {
        // Save the new level
        await saveUserLevel(getLanguage(), newLevel);
        previousLevel = newLevel;

        // Load next phrase with new level
        await nextPhrase();
      } else {
        // Revert to previous level
        setState({ userLevel: previousLevel || 1 });
        updateLevelDisplay(previousLevel || 1);
        target.value = (previousLevel || 1).toString();
      }
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

    // Update previous level for confirmation dialog
    previousLevel = userLevel;
  } catch (error) {
    console.warn("Could not load user level, using default:", error);
    setState({ userLevel: 1, actualUserLevel: 1 });
    updateLevelDisplay(1);
    previousLevel = 1;
  }
}

/**
 * Handle record button click (toggle recording on/off)
 */
async function handleRecordToggle() {
  // If recording, stop it
  if (state.isRecording) {
    await actuallyStopRecording();
    return;
  }

  // Otherwise, start recording
  await handleRecordStart();
}

/**
 * Start recording
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

    // Get target IPA for real-time detection
    if (!state.currentPhrase?.ipas || state.currentPhrase.ipas.length === 0) {
      throw new Error("No target phrase available for recording");
    }
    const targetIPA = state.currentPhrase.ipas[0].ipa;

    // Create real-time phoneme detector
    realtimeDetector = new RealTimePhonemeDetector(
      {
        targetIPA,
        lang: getLanguage(),
        threshold: 1.0, // 100% similarity threshold for auto-stop
        minChunksBeforeCheck: 3, // Wait for at least 3 chunks (1.5s) before first check
        silenceThreshold: 0.01, // RMS volume threshold for silence
        silenceDuration: 1500, // Stop after 1.5 seconds of silence
      },
      {
        onPhonemeUpdate: () => {
          // Real-time phoneme updates
        },
        onTargetMatched: () => {
          // Auto-stop recording when target is matched
          void actuallyStopRecording();
        },
        onSilenceDetected: () => {
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
    updateRecordButton(true);
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
 * Actually stop recording and process the audio
 */
async function actuallyStopRecording() {
  try {
    // Only process if actually recording
    if (!state.isRecording) {
      return;
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
        actualIPA = detector.getLastPhonemes();
        debugMeta.push({
          labelKey: "processing.meta_realtime",
          value: "Yes (auto-detected)",
        });
        showProcessing(85);
      } else {
        // Process the audio normally
        const audioData = await measureAsync("processing.step_prepare", () =>
          prepareAudioForModel(audioBlob),
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
      const lang = getLanguage();
      const scores = currentPhrase.ipas.map((ipaEntry) =>
        measureSync("processing.step_score", () =>
          scorePronunciation(ipaEntry.ipa, actualIPA, lang),
        ),
      );
      // Use the score with the highest similarity
      const score = scores.reduce(
        (best, current) => (current.similarity > best.similarity ? current : best),
        scores[0] || scorePronunciation("", actualIPA, lang),
      );
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
 * Reprocess the last recording with fresh IPA detection
 */
async function reprocessRecording() {
  if (!state.lastRecordingBlob) {
    console.warn("No recording available to reprocess");
    return;
  }

  if (!state.currentPhrase) {
    console.warn("No current phrase to score against");
    return;
  }

  try {
    setState({ isProcessing: true });

    // Show processing
    let progress = 0;
    showProcessing(progress);

    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        showProcessing(progress);
      }
    }, 100);

    try {
      // Extract phonemes from the stored recording
      const audioData = await prepareAudioForModel(state.lastRecordingBlob);
      showProcessing(30);

      const actualIPA = await extractPhonemes(audioData);
      showProcessing(85);

      // Score the pronunciation
      const currentPhrase = state.currentPhrase;
      if (!currentPhrase.ipas || currentPhrase.ipas.length === 0) {
        throw new Error(`No IPA pronunciation data available for phrase: ${currentPhrase.phrase}`);
      }

      // Try all IPAs and use the best score
      const lang = getLanguage();
      const scores = currentPhrase.ipas.map((ipaEntry) =>
        scorePronunciation(ipaEntry.ipa, actualIPA, lang),
      );
      const score = scores.reduce(
        (best, current) => (current.similarity > best.similarity ? current : best),
        scores[0] || scorePronunciation("", actualIPA, lang),
      );
      showProcessing(95);

      // Update state
      setState({ score, actualIPA });

      // Display updated feedback
      displayFeedback(currentPhrase, actualIPA, score);
      showProcessing(100);

      // Clear progress interval
      clearInterval(progressInterval);

      // Reset processing state
      setTimeout(() => {
        setState({ isProcessing: false });
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  } catch (error) {
    console.error("Reprocessing error:", error);
    showInlineError(error);
    setState({ isProcessing: false });
  }
}

/**
 * Show detailed model output for visualization
 */
async function showModelDetails() {
  if (!state.lastRecordingBlob) {
    console.warn("No recording available to analyze");
    return;
  }

  try {
    // Show loading state
    const detailsContent = document.getElementById("model-details-content");
    const detailsSection = document.getElementById("model-details");
    if (!detailsContent || !detailsSection) return;

    detailsContent.innerHTML =
      '<div class="text-center"><div class="spinner-border spinner-border-sm"></div> Analyzing...</div>';
    detailsSection.style.display = "block";

    // Extract detailed phoneme information
    const audioData = await prepareAudioForModel(state.lastRecordingBlob);
    const detailed = await extractPhonemesDetailed(audioData);

    // Build visualization HTML
    let html = "";

    // Summary
    html += '<div class="mb-4">';
    html += '<h6 class="fw-bold text-primary">Summary</h6>';
    html += `<div class="small"><strong>Detected IPA:</strong> <code class="fs-6">${detailed.phonemes}</code></div>`;
    html += `<div class="small"><strong>Total Frames:</strong> ${detailed.raw.frames}</div>`;
    html += `<div class="small"><strong>Vocabulary Size:</strong> ${detailed.raw.vocabSize}</div>`;
    html += `<div class="small"><strong>Phonemes Detected:</strong> ${detailed.details.length}</div>`;
    html += "</div>";

    // Phoneme details with confidence and duration
    html += '<div class="mb-4">';
    html +=
      '<h6 class="fw-bold text-primary">Phoneme Details (After CTC Decoding & Filtering)</h6>';
    html += '<div class="table-responsive">';
    html += '<table class="table table-sm table-striped">';
    html +=
      "<thead><tr><th>Symbol</th><th>Confidence</th><th>Duration (frames)</th><th>Confidence Bar</th></tr></thead>";
    html += "<tbody>";

    for (const phoneme of detailed.details) {
      const confidencePercent = Math.min(100, (phoneme.confidence / 10) * 100); // Normalize exp(logit)
      const confidenceColor =
        confidencePercent > 80 ? "success" : confidencePercent > 50 ? "warning" : "danger";

      html += "<tr>";
      html += `<td><code class="fs-6 fw-bold">${phoneme.symbol}</code></td>`;
      html += `<td>${phoneme.confidence.toFixed(3)}</td>`;
      html += `<td>${phoneme.duration}</td>`;
      html += `<td><div class="progress" style="height: 20px;"><div class="progress-bar bg-${confidenceColor}" style="width: ${confidencePercent}%">${confidencePercent.toFixed(0)}%</div></div></td>`;
      html += "</tr>";
    }

    html += "</tbody></table>";
    html += "</div>";
    html += "</div>";

    // Frame-by-frame top predictions (sampled)
    html += '<div class="mb-3">';
    html += '<h6 class="fw-bold text-primary">Frame-by-Frame Top Predictions (Sampled)</h6>';
    html += '<p class="small text-muted">Showing top 5 predictions for every 10th frame</p>';
    html += '<div class="accordion" id="frameAccordion">';

    for (let i = 0; i < Math.min(20, detailed.raw.frameData.length); i++) {
      const frame = detailed.raw.frameData[i];
      const collapseId = `frame-${i}`;

      html += '<div class="accordion-item">';
      html += '<h2 class="accordion-header">';
      html += `<button class="accordion-button collapsed small" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">`;
      html += `Frame ${frame.frameIndex} - Top: <code class="ms-2">${frame.topPredictions[0].symbol}</code> (${frame.topPredictions[0].probability.toFixed(2)})`;
      html += "</button>";
      html += "</h2>";
      html += `<div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#frameAccordion">`;
      html += '<div class="accordion-body p-2">';
      html += '<table class="table table-sm table-bordered mb-0">';
      html +=
        "<thead><tr><th>Rank</th><th>Symbol</th><th>Token ID</th><th>Logit</th><th>Probability</th></tr></thead>";
      html += "<tbody>";

      frame.topPredictions.forEach((pred, rank: number) => {
        html += "<tr>";
        html += `<td>${(rank + 1).toString()}</td>`;
        html += `<td><code>${pred.symbol}</code></td>`;
        html += `<td>${pred.tokenId}</td>`;
        html += `<td>${pred.logit.toFixed(3)}</td>`;
        html += `<td>${pred.probability.toFixed(3)}</td>`;
        html += "</tr>";
      });

      html += "</tbody></table>";
      html += "</div>";
      html += "</div>";
      html += "</div>";
    }

    if (detailed.raw.frameData.length > 20) {
      html += `<div class="text-muted small mt-2">... and ${detailed.raw.frameData.length - 20} more frames (showing first 20 of ${detailed.raw.frameData.length})</div>`;
    }

    html += "</div>";
    html += "</div>";

    detailsContent.innerHTML = html;
  } catch (error) {
    console.error("Error showing model details:", error);
    const detailsContent = document.getElementById("model-details-content");
    if (detailsContent) {
      detailsContent.innerHTML = `<div class="alert alert-danger small">Error: ${(error as Error).message}</div>`;
    }
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
