/**
 * Phoneme Party - Main Application
 * German pronunciation practice with AI
 */

// Import styles
import "./styles/main.css";

// Import Bootstrap JavaScript for interactive components (collapse, modals, etc.)
// Using side-effect import to initialize Bootstrap's data-bs-* attributes
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import { getUiLang, initI18n, isUiLangAuto, onUiLangChange, setUiLang, t } from "./i18n.js";
import {
  getStudyLang,
  onStudyLangChange,
  setStudyLang,
  studyLangToPhraseLang,
  type StudyLanguage,
} from "./study-lang.js";

// Import types
import { getLevelText, type Phrase, type Score } from "./types.js";

// Import state management
import { resetFeedback, setState, state } from "./state.js";

// Import database
import { db } from "./db.js";

// Import history UI
import { initHistory, refreshHistory } from "./ui/history.js";

// Import utilities
import { adjustUserLevel, loadUserLevel, saveUserLevel } from "./utils/level-adjustment.js";
import { findPhraseByName, getRandomPhrase } from "./utils/random.js";

// Import audio modules
import { prepareAudioForModel } from "./audio/processor.js";
import { AudioRecorder } from "./audio/recorder.js";

// Import phoneme extraction (direct IPA output)
import {
  extractPhonemes,
  extractPhonemesDetailed,
  loadPhonemeModel,
  wasWebGpuValidationFailed,
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
  refreshIpaExplanations,
  setupVoiceSelectionButton,
} from "./ui/feedback.js";
import {
  hideLoading,
  showError,
  showInlineError,
  showLoading,
  updateLoadingProgress,
} from "./ui/loading.js";
import { generateModelDetailsHTML } from "./ui/model-details-view.js";
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
 * Helper to score pronunciation against all available IPAs and return the best score
 */
function scorePronunciationBest(phrase: Phrase, ipa: string): Score {
  if (!phrase.ipas || phrase.ipas.length === 0) {
    throw new Error(`No IPA pronunciation data available for phrase: ${phrase.phrase}`);
  }

  const studyLang = getStudyLang();
  if (!studyLang) throw new Error("No study language selected");
  const scores = phrase.ipas.map((ipaEntry) => scorePronunciation(ipaEntry.ipa, ipa, studyLang));

  // Return best score (scores array is guaranteed non-empty due to check above)
  return scores.reduce((best, current) => (current.similarity > best.similarity ? current : best));
}

/**
 * Initialize the application
 */
async function init() {
  try {
    initI18n();
    setState({
      webgpuAvailable: typeof navigator !== "undefined" && !!navigator.gpu,
    });
    setupWebGpuToggle();
    updateWebGpuStatus();
    if (!self.crossOriginIsolated) {
      const el = document.getElementById("coi-warning");
      if (el) el.style.display = "";
    }

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

    // Detect actual execution provider: shader-f16 required for WebGPU with fp16 model
    let shaderF16 = false;
    let webgpuBackend = "wasm";
    if (state.webgpuAvailable) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator.gpu as any).requestAdapter();
        shaderF16 = !!adapter?.features.has("shader-f16");
      } catch {
        // adapter request failed
      }
      if (localStorage.getItem("webgpu-enabled") !== "true") {
        webgpuBackend = "wasm";
      } else if (wasWebGpuValidationFailed()) {
        webgpuBackend = "wasm";
      } else {
        webgpuBackend = shaderF16 ? "webgpu" : "wasm";
      }
    }
    setState({
      isModelLoaded: true,
      modelLoadMs,
      webgpuBackend,
      shaderF16,
      webgpuValidationFailed: wasWebGpuValidationFailed(),
    });
    updateWebGpuStatus();

    // Expose API for testing (only in non-production builds)
    if (import.meta.env.DEV) {
      // env.DEV is set by vite.
      (
        window as Window & {
          __test_api?: {
            extractPhonemes: typeof extractPhonemes;
            triggerReprocess: () => void;
            setState: typeof setState;
            getState: () => typeof state;
          };
        }
      ).__test_api = {
        extractPhonemes,
        triggerReprocess: () => void reprocessRecording(),
        setState,
        getState: () => state,
      };
    }

    // Hide loading, show main content
    hideLoading();

    // Load first phrase (from query string or random)
    loadInitialPhrase();

    // Set up event listeners
    setupEventListeners();
    setupDeviceDetailsModal();

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
      const sl = getStudyLang();
      if (sl) await loadAndUpdateUserLevel(sl);
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
  const studyLangSelect = document.getElementById("study-lang-select");
  const uiLangSelect = document.getElementById("ui-lang-select");
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

  if (studyLangSelect && studyLangSelect instanceof HTMLSelectElement) {
    studyLangSelect.value = getStudyLang() ?? "";
    studyLangSelect.addEventListener("change", (event) => {
      const val = (event.target as HTMLSelectElement).value;
      if (val) setStudyLang(val as StudyLanguage);
    });
    onStudyLangChange(() => {
      studyLangSelect.value = getStudyLang() ?? "";
      resetRecordButton();
      void nextPhrase();
      refreshHistory();
      const sl = getStudyLang();
      if (sl) void loadAndUpdateUserLevel(sl);
    });
  }

  if (uiLangSelect && uiLangSelect instanceof HTMLSelectElement) {
    uiLangSelect.value = isUiLangAuto() ? "auto" : getUiLang();
    uiLangSelect.addEventListener("change", (event) => {
      const val = (event.target as HTMLSelectElement).value;
      setUiLang(val as "auto" | "de" | "en");
    });
    onUiLangChange(() => {
      uiLangSelect.value = isUiLangAuto() ? "auto" : getUiLang();
      updateWebGpuStatus();
      if (state.currentPhrase && state.actualIPA) {
        refreshIpaExplanations(state.currentPhrase.ipas[0]?.ipa ?? "", state.actualIPA);
      }
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
        const studyLang = getStudyLang();
        if (studyLang) await saveUserLevel(studyLang, newLevel);
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

async function collectDeviceDetails(): Promise<string> {
  const lines: string[] = [];

  lines.push("=== Browser ===");
  lines.push(`User-Agent: ${navigator.userAgent}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lines.push(`Platform: ${(navigator as any).userAgentData?.platform ?? "unknown"}`);
  lines.push(`Language: ${navigator.language}`);
  lines.push(`HW Concurrency: ${navigator.hardwareConcurrency}`);
  lines.push(`Cross-Origin Isolated: ${self.crossOriginIsolated}`);

  lines.push("\n=== WebGPU ===");
  lines.push(`navigator.gpu available: ${!!navigator.gpu}`);
  lines.push(`WebGPU manually disabled: ${localStorage.getItem("webgpu-disabled") === "true"}`);

  // WebGL renderer — available on nearly all devices and gives specific GPU names
  // e.g. "Mali-G77 MC9 r1p0" or "Adreno (TM) 650"
  try {
    const canvas = document.createElement("canvas");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gl: any = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        lines.push(`WebGL Vendor: ${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)}`);
        lines.push(`WebGL Renderer: ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`);
      } else {
        lines.push(`WebGL Vendor: ${gl.getParameter(gl.VENDOR)} (unmasked ext unavailable)`);
        lines.push(`WebGL Renderer: ${gl.getParameter(gl.RENDERER)} (unmasked ext unavailable)`);
      }
    }
  } catch {
    lines.push("WebGL: unavailable");
  }

  if (navigator.gpu) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = await (navigator.gpu as any).requestAdapter();
      if (adapter) {
        // adapter.info is the newer synchronous API (Chrome 121+)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const syncInfo: any = adapter.info;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asyncInfo: any = await adapter.requestAdapterInfo?.();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info: any = syncInfo ?? asyncInfo;
        if (info) {
          lines.push(`GPU Vendor: ${info.vendor || "unknown"}`);
          lines.push(`GPU Architecture: ${info.architecture || "unknown"}`);
          lines.push(`GPU Device: ${info.device || "unknown"}`);
          lines.push(`GPU Description: ${info.description || "unknown"}`);
        }
        const features = [...adapter.features].sort().join(", ");
        lines.push(`GPU Features: ${features || "none"}`);
        lines.push(`shader-f16 supported: ${adapter.features.has("shader-f16")}`);
        const limits = adapter.limits;
        if (limits) {
          lines.push(`maxBufferSize: ${limits.maxBufferSize}`);
          lines.push(`maxComputeWorkgroupStorageSize: ${limits.maxComputeWorkgroupStorageSize}`);
        }
      } else {
        lines.push("requestAdapter() returned null");
      }
    } catch (e) {
      lines.push(`requestAdapter() error: ${e}`);
    }
  }

  lines.push("\n=== Model ===");
  lines.push(`Execution backend: ${state.webgpuBackend || "wasm"}`);
  if (state.webgpuValidationFailed) {
    lines.push(`WebGPU validation: FAILED (NaN detected, fell back to WASM)`);
  }
  lines.push(
    `Model load time: ${state.modelLoadMs ? `${Math.round(state.modelLoadMs)} ms` : "unknown"}`,
  );
  lines.push(`onnxruntime-web: 1.24.2`);
  lines.push(`Model file: model.fp16.onnx`);

  lines.push("\n=== Current Phrase ===");
  if (state.currentPhrase) {
    lines.push(`Phrase: ${state.currentPhrase.phrase}`);
    lines.push(`URL: ${window.location.href}`);
    const ipas = state.currentPhrase.ipas?.map((i) => i.ipa).join(", ") || "unknown";
    lines.push(`Expected IPA: ${ipas}`);
  } else {
    lines.push("No phrase loaded");
  }

  if (state.actualIPA) {
    lines.push(`Actual IPA (last result): ${state.actualIPA}`);
  }

  return lines.join("\n");
}

function setupDeviceDetailsModal() {
  const modal = document.getElementById("device-details-modal");
  if (!modal) return;

  modal.addEventListener("show.bs.modal", () => {
    const pre = document.getElementById("device-details-text");
    if (pre) {
      pre.textContent = t("loading.initializing");
      void collectDeviceDetails().then((text) => {
        pre.textContent = text;
      });
    }
  });

  const copyBtn = document.getElementById("device-details-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const pre = document.getElementById("device-details-text");
      if (pre) {
        void navigator.clipboard.writeText(pre.textContent || "").then(() => {
          copyBtn.textContent = t("console.copy_success");
          setTimeout(() => {
            copyBtn.textContent = t("footer.copy");
          }, 2000);
        });
      }
    });
  }
}

function setupWebGpuToggle() {
  const toggle = document.getElementById("webgpu-enable-toggle") as HTMLInputElement | null;
  if (!toggle) return;
  toggle.checked = localStorage.getItem("webgpu-enabled") === "true";
  toggle.addEventListener("change", () => {
    localStorage.setItem("webgpu-enabled", toggle.checked ? "true" : "false");
    window.location.reload();
  });
}

function updateWebGpuStatus() {
  const status = document.getElementById("webgpu-status");
  if (!status) return;

  if (state.shaderF16 === null) {
    // Still checking (before model load)
    status.textContent = t("footer.webgpu_status_checking");
    status.classList.remove("text-warning", "text-success");
    return;
  }

  if (!state.webgpuAvailable) {
    status.textContent = t("footer.webgpu_status_unavailable");
    status.classList.add("text-warning");
    status.classList.remove("text-success");
    return;
  }

  if (localStorage.getItem("webgpu-enabled") !== "true") {
    status.textContent = t("footer.webgpu_status_disabled_manual");
    status.classList.add("text-warning");
    status.classList.remove("text-success");
  } else if (state.webgpuValidationFailed) {
    status.textContent = t("footer.webgpu_status_validation_failed");
    status.classList.add("text-warning");
    status.classList.remove("text-success");
  } else if (state.shaderF16) {
    status.textContent = t("footer.webgpu_status_active");
    status.classList.add("text-success");
    status.classList.remove("text-warning");
  } else {
    status.textContent = t("footer.webgpu_status_no_shader_f16");
    status.classList.add("text-warning");
    status.classList.remove("text-success");
  }
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
async function loadAndUpdateUserLevel(studyLang: string) {
  try {
    // Get actual user level from performance stats
    const stats = await db.getUserStats(studyLang);
    const actualLevel = stats.userLevel;

    // Get user's manual level preference (or use actual level if not set)
    const savedLevel = await loadUserLevel(studyLang);
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
    const studyLang = getStudyLang();
    if (!studyLang) throw new Error("No study language selected");
    const targetIPA = state.currentPhrase.ipas[0].ipa;

    // Create real-time phoneme detector
    realtimeDetector = new RealTimePhonemeDetector(
      {
        targetIPA,
        studyLang,
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
        onBlankTrailDetected: () => {
          // Auto-stop recording after chars detected + blank trail
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
      // Always process and cache the audio data for deterministic reprocessing
      const audioData = await measureAsync("processing.step_prepare", () =>
        prepareAudioForModel(audioBlob),
      );
      setState({ lastRecordingAudioData: audioData });
      showProcessing(30);

      let actualIPA: string;

      // If we have a real-time detector, finalize it to ensure complete processing
      if (detector) {
        // Finalize real-time detector to process any remaining chunks
        const finalizeStart = performance.now();
        await detector.finalize();
        recordTiming("processing.step_finalize", finalizeStart, performance.now());

        const realtimeIPA = detector.getLastPhonemes();

        if (realtimeIPA) {
          // Use real-time results if available
          actualIPA = realtimeIPA;
          debugMeta.push({
            labelKey: "processing.meta_realtime",
            value: "Yes (continuous processing)",
          });
          showProcessing(85);
        } else {
          // Fallback to whole-blob processing if real-time failed
          const ipa = await measureAsync("processing.step_phonemes", () =>
            extractPhonemes(audioData),
          );
          debugMeta.push({
            labelKey: "processing.meta_realtime",
            value: "No (fallback to post-processing)",
          });
          showProcessing(85);
          actualIPA = ipa;
        }
      } else {
        // No real-time detector, extract phonemes from processed audio
        const ipa = await measureAsync("processing.step_phonemes", () =>
          extractPhonemes(audioData),
        );
        debugMeta.push({
          labelKey: "processing.meta_realtime",
          value: "No real-time detection",
        });
        showProcessing(85);
        actualIPA = ipa;
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

      // Score pronunciation against all available IPAs
      const score = scorePronunciationBest(currentPhrase, actualIPA);
      showProcessing(95);

      // Update state
      setState({ score, actualIPA });

      // Play back the recording with score, which will auto-play desired pronunciation if score < 95%
      playRecording(score.similarityPercent);

      // Save result to database (non-blocking, errors won't crash app)
      try {
        const studyLang = getStudyLang();
        if (!studyLang) throw new Error("No study language selected");
        await db.savePhraseResult(
          currentPhrase.phrase,
          studyLang,
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
          await saveUserLevel(studyLang, newUserLevel);
        }

        // Refresh history to show new result and update actual level
        refreshHistory();
        await loadAndUpdateUserLevel(studyLang);
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
  if (!state.lastRecordingAudioData) {
    console.warn("No processed audio data available to reprocess");
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
      // Use cached processed audio data for deterministic reprocessing
      const audioData = state.lastRecordingAudioData;
      showProcessing(30);

      const actualIPA = await extractPhonemes(audioData);
      showProcessing(85);

      // Score the pronunciation
      const currentPhrase = state.currentPhrase;
      const score = scorePronunciationBest(currentPhrase, actualIPA);
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
        resetRecordButton();
        setState({ isProcessing: false });
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  } catch (error) {
    console.error("Reprocessing error:", error);
    showInlineError(error);
    resetRecordButton();
    setState({ isProcessing: false });
  }
}

/**
 * Show detailed model output for visualization
 */
async function showModelDetails() {
  if (!state.lastRecordingAudioData) {
    console.warn("No processed audio data available to analyze");
    return;
  }

  try {
    // Show loading state
    const detailsContent = document.getElementById("model-details-content");
    const detailsSection = document.getElementById("model-details");
    if (!detailsContent || !detailsSection) return;

    detailsContent.innerHTML = `<div class="text-center"><div class="spinner-border spinner-border-sm"></div> ${t("processing.analyzing")}</div>`;
    detailsSection.style.display = "block";

    // Use cached processed audio data for deterministic analysis
    const audioData = state.lastRecordingAudioData;
    const detailed = await extractPhonemesDetailed(audioData);

    // Generate visualization HTML using shared function
    const html = generateModelDetailsHTML(detailed);

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
  const sl = getStudyLang();
  if (!sl) return null;
  return findPhraseByName(phraseParam, studyLangToPhraseLang(sl));
}

/**
 * Update URL with current language and phrase
 */
function updateURL() {
  const params = new URLSearchParams();
  const sl = getStudyLang();
  if (sl) params.set("lang", sl);
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
  const sl = getStudyLang();
  if (!sl) return;

  // Use user's current level from state
  const userLevel = state.userLevel || 1;

  const phrase = getRandomPhrase(studyLangToPhraseLang(sl), userLevel);
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
