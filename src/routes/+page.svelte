<script lang="ts">
  import { resolve } from "$app/paths";
  import "bootstrap/dist/js/bootstrap.bundle.min.js";
  import { onMount, tick } from "svelte";
  import "../styles/main.css";

  import { prepareAudioForModel } from "../audio/processor.js";
  import { AudioRecorder } from "../audio/recorder.js";
  import { scorePronunciation } from "../comparison/scorer.js";
  import { db } from "../db.js";
  import { getUiLang, initI18n, isUiLangAuto, onUiLangChange, setUiLang, t } from "../i18n.js";
  import {
    extractPhonemes,
    extractPhonemesDetailed,
    loadPhonemeModel,
    wasWebGpuValidationFailed,
  } from "../speech/phoneme-extractor.js";
  import {
    getAvailableVoices,
    hasPhraseAudio,
    loadPhraseAudioManifest,
    playPhraseAudio,
    ttsPlaybackRate,
    type VoiceOption,
  } from "../speech/phrase-audio.js";
  import { RealTimePhonemeDetector } from "../speech/realtime-phoneme-detector.js";
  import {
    getStudyLang,
    onStudyLangChange,
    setStudyLang,
    studyLangToPhraseLang,
    type StudyLanguage,
  } from "../study-lang.js";
  import { type Phrase, type Score } from "../types.js";
  import { initHistory, refreshHistory } from "../ui/history.js";
  import { generateExplanationsHTML } from "../ui/ipa-helper.js";
  import { generateModelDetailsHTML } from "../ui/model-details-view.js";
  import { generatePhonemeComparisonHTML } from "../ui/phoneme-comparison-view.js";
  import { adjustUserLevel, loadUserLevel, saveUserLevel } from "../utils/level-adjustment.js";
  import { selectNextPhrase } from "../utils/phrase-selector.js";
  import { getPhraseInLang } from "../utils/phrase-xlang";
  import { findPhraseByName } from "../utils/random.js";

  // ── Reactive state ───────────────────────────────────────────────────────────

  let isModelLoaded = $state(false);
  let loadingProgress = $state(0);
  let loadError = $state<Error | null>(null);
  let inlineError = $state<Error | null>(null);
  let pendingRecordingBlob = $state<Blob | null>(null);
  let pendingRecordingDuration = $state<number>(0);

  let currentPhrase = $state<Phrase | null>(null);
  let recentPhrases = $state<string[]>([]);
  let isRecording = $state(false);
  let isProcessing = $state(false);
  let processingProgress = $state(0);
  let lastRecordingBlob = $state<Blob | null>(null);
  let lastRecordingAudioData = $state<Float32Array | null>(null);
  let actualIPA = $state<string | null>(null);
  let score = $state<Score | null>(null);
  let showFeedback = $state(false);

  let userLevel = $state(1);
  let actualUserLevel = $state(1);
  let previousLevel: number | null = null;

  let webgpuAvailable = $state(false);
  let webgpuBackend = $state<string | null>(null);
  let shaderF16 = $state<boolean | null>(null);
  let webgpuValidationFailed = $state(false);
  let webgpuEnabled = $state(false);
  let modelLoadMs = $state<number | null>(null);

  let ipaExplanationsVisible = $state(false);
  let modelDetailsVisible = $state(false);
  let modelDetailsHTML = $state("");
  let modelDetailsLoading = $state(false);

  let studyLangValue = $state(getStudyLang() ?? "");
  let uiLangValue = $state(isUiLangAuto() ? "auto" : getUiLang());
  let uiLang = $state(getUiLang());

  interface TimingStep {
    labelKey: string;
    ms: number;
    isTotal?: boolean;
  }
  interface DebugMeta {
    labelKey: string;
    value: string;
  }
  let processingSteps = $state<TimingStep[]>([]);
  let processingMeta = $state<DebugMeta[]>([]);
  let processingTotalMs = $state<number | null>(null);

  let consoleLog = $state("");
  let consoleExpanded = $state(false);

  // Voice selection: name of the selected pre-generated voice (e.g. "piper-thorsten")
  let selectedVoiceName = $state("");
  let availableVoices = $state<VoiceOption[]>([]);

  // Recorder alerts
  let recorderAlerts = $state<{ id: number; titleKey: string; bodyKey: string; type: string }[]>(
    [],
  );
  let _alertId = 0;

  // Device details
  let deviceDetailsText = $state("Loading...");

  // Derived HTML strings
  let ipaExplanationsHTML = $derived(
    score && currentPhrase && uiLang
      ? (generateExplanationsHTML(currentPhrase.ipas[0]?.ipa ?? "", actualIPA ?? "", uiLang) ?? "")
      : "",
  );

  let phonemeComparisonHTML = $derived(
    score && !score?.notFound && score.phonemeComparison?.length
      ? generatePhonemeComparisonHTML(score.phonemeComparison, t)
      : "",
  );

  // ── Non-reactive runtime objects ─────────────────────────────────────────────
  let recorder: AudioRecorder | null = null;
  let realtimeDetector: RealTimePhonemeDetector | null = null;
  let currentAudio: HTMLAudioElement | null = null;

  // ── Emoji helpers ─────────────────────────────────────────────────────────────
  function emojiToTwemojiUrl(emoji: string): string {
    const codePoints: string[] = [];
    for (let i = 0; i < emoji.length; i++) {
      const cp = emoji.codePointAt(i);
      if (cp === undefined) continue;
      if (cp === 0xfe0f) continue;
      codePoints.push(cp.toString(16));
      if (cp > 0xffff) i++;
    }
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codePoints.join("-")}.svg`;
  }

  // ── Loading progress ──────────────────────────────────────────────────────────
  interface ProgressInfo {
    status?: string;
    progress?: number;
    file?: string;
    name?: string;
    loaded?: number;
    total?: number;
    attempt?: number;
    max?: number;
  }

  let _lastLoggedPercent = -10;

  function updateLoadingProgressState(progress: ProgressInfo): void {
    if (!progress) return;
    const pct = progress.progress ? Math.round(progress.progress) : 0;
    const shouldLog = pct >= _lastLoggedPercent + 10 || progress.status !== "downloading";
    let statusText = "";
    if (progress.status === "initiate") {
      statusText = t("loading.status.initiate", { file: progress.file || "unknown" });
    } else if (progress.status === "download") {
      statusText = t("loading.status.download", { file: progress.file || "model", percent: pct });
    } else if (progress.status === "done") {
      statusText = t("loading.status.done", { file: progress.file || "file" });
    } else if (progress.status === "progress") {
      statusText = t("loading.status.progress", { file: progress.file || "model", percent: pct });
    } else if (progress.status === "downloading") {
      const name =
        (progress.name ?? progress.file ?? "model.onnx").split("/").pop() ?? "model.onnx";
      const size =
        progress.loaded && progress.total && progress.total > 0
          ? `${Math.round(progress.loaded / 1024 / 1024)} MB / ${Math.round(progress.total / 1024 / 1024)} MB`
          : progress.loaded
            ? `${Math.round(progress.loaded / 1024 / 1024)} MB`
            : `${pct}%`;
      statusText = t("loading.status.downloading_model", { name, size });
      if (shouldLog) _lastLoggedPercent = pct;
    } else if (progress.status === "retrying") {
      statusText = t("loading.status.retrying", {
        attempt: progress.attempt ?? 1,
        max: progress.max ?? 5,
      });
    } else if (progress.status === "loading_from_cache") {
      statusText = t("loading.status.loading_from_cache");
    } else if (progress.status === "loading") {
      statusText = t("loading.status.loading_model");
    } else if (progress.status === "ready") {
      statusText = t("loading.status.ready");
    } else {
      statusText = t("loading.status.fallback", {
        status: progress.status || t("loading.initializing"),
      });
    }
    if (shouldLog) console.log(statusText);
    if (progress.progress !== undefined) loadingProgress = Math.round(progress.progress);
  }

  // ── Audio playback ────────────────────────────────────────────────────────────

  /**
   * Auto-play the pre-generated audio for a phrase when it loads.
   */
  function autoPlayPhrase(phrase: string): void {
    const sl = getStudyLang();
    if (!sl || !phrase || !selectedVoiceName) return;
    void playPhraseAudio(phrase, sl, selectedVoiceName, ttsPlaybackRate(userLevel));
  }

  /**
   * Play the desired pronunciation for a phrase on demand.
   */
  async function playDesiredPronunciation(phrase: string): Promise<void> {
    if (!phrase || !selectedVoiceName) return;
    const studyLang = getStudyLang();
    if (!studyLang) return;
    await playPhraseAudio(phrase, studyLang, selectedVoiceName, ttsPlaybackRate(userLevel)).catch(
      (err) => {
        console.error("Audio playback error:", err);
      },
    );
  }

  function downloadRecording() {
    if (!lastRecordingBlob) return;
    const url = URL.createObjectURL(lastRecordingBlob);
    const a = document.createElement("a");
    a.href = url;
    const phrase = currentPhrase?.phrase ?? "recording";
    const studyLang = getStudyLang() ?? "xx";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const phraseSafe = phrase.replace(/\s+/g, "_");
    let filename = `${phraseSafe}_${timestamp}_${studyLang}`;
    if (actualIPA) filename += `_${actualIPA.replace(/\s+/g, "")}`;
    a.download = `${filename}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function longPressDownload(node: HTMLElement) {
    const THRESHOLD = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let triggered = false;

    const start = () => {
      triggered = false;
      timer = setTimeout(() => {
        triggered = true;
        downloadRecording();
      }, THRESHOLD);
    };
    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const end = (e: Event) => {
      cancel();
      if (triggered) e.stopImmediatePropagation();
    };
    const touchEnd = (e: TouchEvent) => {
      cancel();
      if (triggered) {
        // Long press was triggered: prevent the subsequent synthetic click
        // so that onclick (playRecordingAudio) doesn't fire after a download.
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      triggered = false;
    };

    node.addEventListener("mousedown", start);
    node.addEventListener("mouseup", end);
    node.addEventListener("mouseleave", cancel);
    // passive: true → no preventDefault on touchstart → synthetic click still fires on Android
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchend", touchEnd);
    node.addEventListener("touchcancel", cancel);

    return {
      destroy() {
        node.removeEventListener("mousedown", start);
        node.removeEventListener("mouseup", end);
        node.removeEventListener("mouseleave", cancel);
        node.removeEventListener("touchstart", start);
        node.removeEventListener("touchend", touchEnd);
        node.removeEventListener("touchcancel", cancel);
      },
    };
  }

  function playRecordingAudio(scorePercent?: number) {
    console.log(
      "playRecordingAudio called",
      lastRecordingBlob
        ? `blob type=${lastRecordingBlob.type} size=${lastRecordingBlob.size}`
        : "no blob",
    );
    if (!lastRecordingBlob) return;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    const url = URL.createObjectURL(lastRecordingBlob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (scorePercent !== undefined && scorePercent < 95 && currentPhrase?.phrase) {
        void playDesiredPronunciation(currentPhrase.phrase);
      }
    };
    currentAudio.onerror = () => {
      console.error(
        "Playback onerror:",
        currentAudio?.error?.code,
        currentAudio?.error?.message,
        `src=${url}`,
      );
      URL.revokeObjectURL(url);
      currentAudio = null;
    };
    // Call play() synchronously within the user gesture handler.
    // Deferring to oncanplay breaks mobile autoplay: Android requires play() to be
    // called directly inside a gesture handler (tap/click), not in async callbacks.
    console.log("Calling audio.play() now");
    void currentAudio.play().catch((e: unknown) => {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("Playback error:", err.name, err.message, err.stack);
    });
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────
  function scorePronunciationBest(phrase: Phrase, ipa: string): Score {
    if (!phrase.ipas?.length) throw new Error(`No IPA data for: ${phrase.phrase}`);
    const sl = getStudyLang();
    if (!sl) throw new Error("No study language selected");
    const scores = phrase.ipas.map((e) => scorePronunciation(e.ipa, ipa, sl));
    return scores.reduce((best, cur) => (cur.similarity > best.similarity ? cur : best));
  }

  // ── Level helpers ─────────────────────────────────────────────────────────────
  async function loadAndUpdateUserLevel(sl: string) {
    try {
      const stats = await db.getUserStats(sl);
      const saved = await loadUserLevel(sl);
      userLevel = saved !== null ? saved : stats.userLevel;
      actualUserLevel = stats.userLevel;
      previousLevel = userLevel;
    } catch {
      userLevel = 1;
      actualUserLevel = 1;
      previousLevel = 1;
    }
  }

  // ── Recorder alerts ───────────────────────────────────────────────────────────
  function showRecorderAlert(
    titleKey: string,
    bodyKey: string,
    type: "info" | "warning",
    autoDismissMs: number,
  ) {
    const id = ++_alertId;
    recorderAlerts = [...recorderAlerts, { id, titleKey, bodyKey, type }];
    setTimeout(() => {
      recorderAlerts = recorderAlerts.filter((a) => a.id !== id);
    }, autoDismissMs);
  }

  // ── Recording ─────────────────────────────────────────────────────────────────
  async function handleRecordToggle() {
    if (isRecording) {
      await actuallyStopRecording();
    } else {
      await handleRecordStart();
    }
  }

  async function shouldDeferForMicPermission(): Promise<boolean> {
    if (!navigator.permissions?.query) return false;
    let status = null;
    try {
      status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    } catch {
      return false;
    }
    if (status.state === "prompt" && recorder) {
      await recorder.requestPermission();
      showRecorderAlert("record.permission_title", "record.permission_body", "warning", 7000);
      return true;
    }
    return false;
  }

  async function handleRecordStart() {
    if (isRecording || isProcessing) return;
    if (await shouldDeferForMicPermission()) return;
    if (!currentPhrase?.ipas?.length) {
      inlineError = new Error("No target phrase available");
      showFeedback = true;
      return;
    }
    const sl = getStudyLang();
    if (!sl) {
      inlineError = new Error("No study language selected");
      showFeedback = true;
      return;
    }
    if (!recorder) {
      inlineError = new Error("Audio recorder not initialized");
      showFeedback = true;
      return;
    }

    if (isModelLoaded) {
      // Full real-time detection with model
      realtimeDetector = new RealTimePhonemeDetector(
        {
          targetIPA: currentPhrase.ipas[0].ipa,
          studyLang: sl,
          threshold: 1.0,
          minChunksBeforeCheck: 3,
          silenceThreshold: 0.01,
          silenceDuration: 1500,
        },
        {
          onPhonemeUpdate: () => {},
          onTargetMatched: () => void actuallyStopRecording(),
          onSilenceDetected: () => void actuallyStopRecording(),
          onBlankTrailDetected: () => void actuallyStopRecording(),
        },
      );

      try {
        await recorder.start(
          () => void actuallyStopRecording(),
          (chunk: Blob) => {
            if (realtimeDetector) void realtimeDetector.addChunk(chunk);
          },
          500,
        );
        isRecording = true;
      } catch (error) {
        console.error("Record start error:", error);
        inlineError = error instanceof Error ? error : new Error(String(error));
        showFeedback = true;
        isRecording = false;
        realtimeDetector = null;
      }
    } else {
      // Model still loading — use RMS silence detection only (no ONNX)
      const SILENCE_THRESHOLD = 0.01;
      const SILENCE_DURATION_MS = 1500;
      let silenceStartTime: number | null = null;
      let silenceTriggered = false;
      const accChunks: Blob[] = [];
      let chunkCount = 0;

      try {
        await recorder.start(
          () => void actuallyStopRecording(),
          async (chunk: Blob) => {
            if (silenceTriggered || chunk.size === 0) return;
            accChunks.push(chunk);
            chunkCount++;
            if (chunkCount < 3) return;
            try {
              const combined = new Blob(accChunks, { type: chunk.type });
              const audioData = await prepareAudioForModel(combined);
              let sum = 0;
              for (let i = 0; i < audioData.length; i++) sum += audioData[i] * audioData[i];
              const rms = Math.sqrt(sum / audioData.length);
              const now = Date.now();
              if (rms < SILENCE_THRESHOLD) {
                if (silenceStartTime === null) {
                  silenceStartTime = now;
                } else if (now - silenceStartTime >= SILENCE_DURATION_MS) {
                  silenceTriggered = true;
                  void actuallyStopRecording();
                }
              } else {
                silenceStartTime = null;
              }
            } catch {
              /* ignore decode errors during silence detection */
            }
          },
          500,
        );
        isRecording = true;
      } catch (error) {
        console.error("Record start error:", error);
        inlineError = error instanceof Error ? error : new Error(String(error));
        showFeedback = true;
        isRecording = false;
      }
    }
  }

  async function actuallyStopRecording() {
    if (!isRecording || !recorder) return;
    try {
      const { blob: audioBlob, duration } = await recorder.stop();
      isRecording = false;
      lastRecordingBlob = audioBlob;

      const detector = realtimeDetector;
      realtimeDetector = null;

      if (duration < recorder.minDuration) {
        showRecorderAlert("record.too_short_title", "record.too_short_body", "info", 5000);
        return;
      }

      if (!isModelLoaded) {
        // Model still loading — queue the recording for processing once model is ready
        pendingRecordingBlob = audioBlob;
        pendingRecordingDuration = duration;
        return;
      }

      await processRecording(audioBlob, duration, detector);
    } catch (error) {
      console.error("Recording error:", error);
      inlineError = error instanceof Error ? error : new Error(String(error));
      showFeedback = true;
      isRecording = false;
      isProcessing = false;
      processingProgress = 0;
    }
  }

  async function processRecording(
    audioBlob: Blob,
    duration: number,
    detector: RealTimePhonemeDetector | null,
  ) {
    isProcessing = true;
    processingProgress = 0;
    processingSteps = [];
    processingMeta = [];
    processingTotalMs = null;

    const timingStart = performance.now();
    const timingSteps: TimingStep[] = [];
    const recordTiming = (lk: string, s: number, e: number) => {
      timingSteps.push({ labelKey: lk, ms: e - s });
    };
    async function measureAsync<T>(lk: string, fn: () => Promise<T>): Promise<T> {
      const s = performance.now();
      const r = await fn();
      recordTiming(lk, s, performance.now());
      return r;
    }

    const debugMeta: DebugMeta[] = [];
    if (modelLoadMs !== null && Number.isFinite(modelLoadMs))
      debugMeta.push({
        labelKey: "processing.meta_model_load",
        value: `${modelLoadMs.toFixed(0)} ms`,
      });
    debugMeta.push({
      labelKey: "processing.meta_audio_duration",
      value: `${(duration / 1000).toFixed(1)} s`,
    });
    debugMeta.push({
      labelKey: "processing.meta_backend",
      value: webgpuBackend || "wasm",
    });

    const progressInterval = setInterval(() => {
      processingProgress = Math.min(processingProgress + 5, 95);
    }, 100);

    try {
      const audioData = await measureAsync("processing.step_prepare", () =>
        prepareAudioForModel(audioBlob),
      );
      lastRecordingAudioData = audioData;
      processingProgress = 30;

      let resultIPA: string;
      if (detector) {
        const fs = performance.now();
        await detector.finalize();
        recordTiming("processing.step_finalize", fs, performance.now());
        const rtIPA = detector.getLastPhonemes();
        if (rtIPA) {
          resultIPA = rtIPA;
          debugMeta.push({ labelKey: "processing.meta_realtime", value: "Yes (continuous)" });
        } else {
          resultIPA = await measureAsync("processing.step_phonemes", () =>
            extractPhonemes(audioData),
          );
          debugMeta.push({
            labelKey: "processing.meta_realtime",
            value: "No (fallback post-processing)",
          });
        }
      } else {
        resultIPA = await measureAsync("processing.step_phonemes", () =>
          extractPhonemes(audioData),
        );
        debugMeta.push({ labelKey: "processing.meta_realtime", value: "No real-time" });
      }
      processingProgress = 85;

      if (!currentPhrase) throw new Error("No current phrase");
      const phrase = currentPhrase;
      if (phrase.level)
        debugMeta.push({
          labelKey: "processing.meta_level",
          value: `${phrase.level}/1000`,
        });

      const scoreResult = scorePronunciationBest(phrase, resultIPA);
      processingProgress = 95;

      actualIPA = resultIPA;
      score = scoreResult;
      showFeedback = true;
      inlineError = null;

      playRecordingAudio(scoreResult.similarityPercent);

      try {
        const sl = getStudyLang();
        if (!sl) throw new Error("No study language");
        await db.savePhraseResult(
          phrase.phrase,
          sl,
          scoreResult.similarity * 100,
          resultIPA,
          phrase.ipas[0].ipa,
          duration,
        );
        const newLevel = adjustUserLevel(
          userLevel,
          actualUserLevel,
          scoreResult.similarity * 100,
          phrase.level || 1,
        );
        if (newLevel !== userLevel) {
          userLevel = newLevel;
          await saveUserLevel(sl, newLevel);
        }
        refreshHistory();
        await loadAndUpdateUserLevel(sl);
      } catch (error) {
        console.error("Failed to save result:", error);
      }

      const totalMs = performance.now() - timingStart;
      processingTotalMs = totalMs;
      processingSteps = [
        ...timingSteps,
        { labelKey: "processing.step_total", ms: totalMs, isTotal: true },
      ];
      processingMeta = debugMeta;
      processingProgress = 100;
      clearInterval(progressInterval);
      setTimeout(() => {
        isProcessing = false;
        processingProgress = 0;
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Processing error:", error);
      inlineError = error instanceof Error ? error : new Error(String(error));
      showFeedback = true;
      isProcessing = false;
      processingProgress = 0;
    }
  }

  async function reprocessRecording() {
    if (!lastRecordingAudioData || !currentPhrase) return;
    try {
      isProcessing = true;
      processingProgress = 0;
      const progressInterval = setInterval(() => {
        processingProgress = Math.min(processingProgress + 5, 95);
      }, 100);
      try {
        processingProgress = 30;
        const resultIPA = await extractPhonemes(lastRecordingAudioData);
        processingProgress = 85;
        const scoreResult = scorePronunciationBest(currentPhrase, resultIPA);
        processingProgress = 95;
        actualIPA = resultIPA;
        score = scoreResult;
        showFeedback = true;
        inlineError = null;
        processingProgress = 100;
        clearInterval(progressInterval);
        setTimeout(() => {
          isProcessing = false;
          processingProgress = 0;
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      inlineError = error instanceof Error ? error : new Error(String(error));
      showFeedback = true;
      isProcessing = false;
      processingProgress = 0;
    }
  }

  async function showModelDetailsPanel() {
    if (!lastRecordingAudioData) return;
    modelDetailsLoading = true;
    modelDetailsVisible = true;
    try {
      const detailed = await extractPhonemesDetailed(lastRecordingAudioData);
      modelDetailsHTML = generateModelDetailsHTML(detailed);
    } catch (error) {
      modelDetailsHTML = `<div class="alert alert-danger small">Error: ${(error as Error).message}</div>`;
    }
    modelDetailsLoading = false;
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  function getPhraseFromQueryString(): Phrase | null {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("phrase");
    if (!p) return null;
    const sl = getStudyLang();
    if (!sl) return null;
    return findPhraseByName(p, studyLangToPhraseLang(sl));
  }

  function updateURL() {
    const params = new URLSearchParams();
    const sl = getStudyLang();
    if (sl) params.set("lang", sl);
    if (currentPhrase?.phrase) params.set("phrase", currentPhrase.phrase);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  async function nextPhrase() {
    const sl = getStudyLang();
    if (!sl) return;
    const audioFilter = selectedVoiceName
      ? (phraseText: string) => hasPhraseAudio(phraseText, sl, selectedVoiceName)
      : null;
    const phrase = await selectNextPhrase(
      studyLangToPhraseLang(sl),
      userLevel,
      sl,
      recentPhrases,
      Date.now(),
      audioFilter,
    );
    currentPhrase = phrase;
    const RECENT_HISTORY_SIZE = 5;
    recentPhrases = [...recentPhrases, phrase.phrase].slice(-RECENT_HISTORY_SIZE);
    score = null;
    actualIPA = null;
    showFeedback = false;
    ipaExplanationsVisible = false;
    modelDetailsVisible = false;
    updateURL();
    autoPlayPhrase(phrase.phrase);
  }

  async function handleLevelChange(newLevel: number) {
    if (previousLevel === newLevel) return;
    const confirmed = window.confirm(
      t("level.change_confirm", {
        oldLevel: previousLevel?.toString() || "1",
        newLevel: newLevel.toString(),
      }),
    );
    if (confirmed) {
      const sl = getStudyLang();
      if (sl) await saveUserLevel(sl, newLevel);
      previousLevel = newLevel;
      await nextPhrase();
    } else {
      userLevel = previousLevel || 1;
    }
  }

  // ── IPA click handler ─────────────────────────────────────────────────────────
  function handlePhonemeClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const symbolEl = target.closest("[data-ipa-symbol]") as HTMLElement | null;
    if (!symbolEl) return;
    const symbol = symbolEl.getAttribute("data-ipa-symbol");
    if (!symbol) return;
    ipaExplanationsVisible = true;
    setTimeout(() => {
      const content = document.getElementById("ipa-explanations-content");
      if (!content) return;
      content
        .querySelectorAll(".ipa-highlight")
        .forEach((el) => el.classList.remove("ipa-highlight"));
      for (const el of content.querySelectorAll("[data-ipa-symbol]")) {
        if (el.getAttribute("data-ipa-symbol") === symbol) {
          el.classList.add("ipa-highlight");
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          break;
        }
      }
    }, 50);
  }

  // ── Device details ─────────────────────────────────────────────────────────────
  async function collectDeviceDetails(): Promise<string> {
    const lines: string[] = [];
    lines.push("=== Browser ===");
    lines.push(`User-Agent: ${navigator.userAgent}`);
    lines.push(`Language: ${navigator.language}`);
    lines.push(`HW Concurrency: ${navigator.hardwareConcurrency}`);
    lines.push(`Cross-Origin Isolated: ${self.crossOriginIsolated}`);
    lines.push("\n=== WebGPU ===");
    lines.push(`navigator.gpu available: ${!!navigator.gpu}`);
    try {
      const canvas = document.createElement("canvas");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gl: any = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          lines.push(`WebGL Vendor: ${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)}`);
          lines.push(`WebGL Renderer: ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`);
        }
      }
    } catch {
      /* WebGL info unavailable */
    }
    if (navigator.gpu) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator.gpu as any).requestAdapter();
        if (adapter) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info: any = adapter.info ?? (await adapter.requestAdapterInfo?.());
          if (info) {
            lines.push(`GPU Vendor: ${info.vendor || "unknown"}`);
            lines.push(`GPU Architecture: ${info.architecture || "unknown"}`);
          }
          lines.push(`GPU Features: ${[...adapter.features].sort().join(", ") || "none"}`);
          lines.push(`shader-f16: ${adapter.features.has("shader-f16")}`);
        }
      } catch (e) {
        lines.push(`requestAdapter() error: ${e}`);
      }
    }
    lines.push("\n=== Model ===");
    lines.push(`Backend: ${webgpuBackend || "wasm"}`);
    if (webgpuValidationFailed) lines.push("WebGPU validation: FAILED");
    lines.push(`Model load: ${modelLoadMs ? `${Math.round(modelLoadMs)} ms` : "unknown"}`);
    lines.push("onnxruntime-web: 1.24.2");
    lines.push("\n=== Current Phrase ===");
    if (currentPhrase) {
      lines.push(`Phrase: ${currentPhrase.phrase}`);
      lines.push(`URL: ${window.location.href}`);
      lines.push(`IPA: ${currentPhrase.ipas?.map((i) => i.ipa).join(", ")}`);
    } else {
      lines.push("No phrase loaded");
    }
    if (actualIPA) lines.push(`Actual IPA: ${actualIPA}`);
    return lines.join("\n");
  }

  // ── Console interceptor ───────────────────────────────────────────────────────
  function setupConsoleInterceptor() {
    const origLog = console.log;
    const origErr = console.error;
    const origWarn = console.warn;
    const origInfo = console.info;

    function addLine(type: string, args: unknown[]) {
      const ts = new Date().toLocaleTimeString();
      const msg = args
        .map((a) => {
          if (typeof a === "object") {
            try {
              return JSON.stringify(a, null, 2);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(" ");
      const prefix =
        type === "error" ? "❌ " : type === "warn" ? "⚠️ " : type === "info" ? "ℹ️ " : "▶️ ";
      consoleLog += `${ts} ${prefix}${msg}\n`;
    }

    console.log = (...args) => {
      origLog.apply(console, args);
      addLine("log", args);
    };
    console.error = (...args) => {
      origErr.apply(console, args);
      addLine("error", args);
    };
    console.warn = (...args) => {
      const msg = args.map(String).join(" ");
      if (msg.includes("constant fold") && msg.includes("Exp")) return;
      origWarn.apply(console, args);
      addLine("warn", args);
    };
    console.info = (...args) => {
      origInfo.apply(console, args);
      addLine("info", args);
    };
  }

  // ── onMount ───────────────────────────────────────────────────────────────────
  onMount(async () => {
    setupConsoleInterceptor();
    initI18n();

    webgpuAvailable = typeof navigator !== "undefined" && !!navigator.gpu;
    webgpuEnabled = localStorage.getItem("webgpu-enabled") === "true";

    if (!self.crossOriginIsolated) {
      const el = document.getElementById("coi-warning");
      if (el) el.style.display = "";
    }

    recorder = new AudioRecorder();

    // Non-model initialization runs immediately (no waiting for model)
    try {
      const queryPhrase = getPhraseFromQueryString();
      if (queryPhrase) {
        currentPhrase = queryPhrase;
        recentPhrases = [queryPhrase.phrase];
        updateURL();
      }

      const sl = getStudyLang();
      studyLangValue = sl ?? "";
      if (sl) await loadAndUpdateUserLevel(sl);

      // Load pre-generated audio manifest and restore preferred voice
      await loadPhraseAudioManifest();
      if (sl) {
        availableVoices = getAvailableVoices(sl);
        const savedVoice = await db.getPreferredVoice(sl);
        const firstVoice = availableVoices[0]?.name ?? "";
        selectedVoiceName =
          savedVoice && availableVoices.some((v) => v.name === savedVoice)
            ? savedVoice
            : firstVoice;
      }

      // Auto-play audio for the initial phrase (if any)
      if (currentPhrase) {
        autoPlayPhrase(currentPhrase.phrase);
      }

      await tick();
      initHistory();

      onStudyLangChange(() => {
        studyLangValue = getStudyLang() ?? "";
        void nextPhrase();
        refreshHistory();
        const newSl = getStudyLang();
        if (newSl) {
          void loadAndUpdateUserLevel(newSl);
          // Update available voices for the new language
          availableVoices = getAvailableVoices(newSl);
          void db.getPreferredVoice(newSl).then((saved) => {
            const first = availableVoices[0]?.name ?? "";
            selectedVoiceName =
              saved && availableVoices.some((v) => v.name === saved) ? saved : first;
          });
        }
      });

      onUiLangChange(() => {
        uiLang = getUiLang();
        uiLangValue = isUiLangAuto() ? "auto" : getUiLang();
      });

      if (import.meta.env.DEV) {
        (window as Window & { __test_api?: unknown }).__test_api = {
          extractPhonemes,
          triggerReprocess: () => void reprocessRecording(),
          getState: () => ({
            currentPhrase,
            isRecording,
            isProcessing,
            score,
            actualIPA,
            userLevel,
          }),
          setState: (newState: {
            lastRecordingAudioData?: Float32Array | null;
            lastRecordingBlob?: Blob | null;
            currentPhrase?: Phrase | null;
            isProcessing?: boolean;
          }) => {
            if (newState.lastRecordingAudioData !== undefined)
              lastRecordingAudioData = newState.lastRecordingAudioData;
            if (newState.lastRecordingBlob !== undefined)
              lastRecordingBlob = newState.lastRecordingBlob;
            if (newState.currentPhrase !== undefined) currentPhrase = newState.currentPhrase;
            if (newState.isProcessing !== undefined) isProcessing = newState.isProcessing;
          },
        };
      }
    } catch (error) {
      console.error("Initialization error:", error);
      inlineError = error instanceof Error ? error : new Error(String(error));
    }

    // Load model in background (non-blocking — UI is already interactive)
    const loadStart = performance.now();
    updateLoadingProgressState({ status: "downloading", progress: 0 });
    loadPhonemeModel((p: { status: string; progress: number }) => {
      updateLoadingProgressState(p);
    })
      .then(async () => {
        modelLoadMs = performance.now() - loadStart;

        let sf16 = false;
        let backend = "wasm";
        if (webgpuAvailable) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adapter = await (navigator.gpu as any).requestAdapter();
            sf16 = !!adapter?.features.has("shader-f16");
          } catch {
            /* WebGPU adapter request may fail */
          }
          if (!webgpuEnabled) {
            backend = "wasm";
          } else if (wasWebGpuValidationFailed()) {
            backend = "wasm";
          } else {
            backend = sf16 ? "webgpu" : "wasm";
          }
        }
        shaderF16 = sf16;
        webgpuBackend = backend;
        webgpuValidationFailed = wasWebGpuValidationFailed();
        loadError = null;
        isModelLoaded = true;

        // Process any recording that was captured before model was ready
        if (pendingRecordingBlob && pendingRecordingDuration > 0) {
          const blob = pendingRecordingBlob;
          const dur = pendingRecordingDuration;
          pendingRecordingBlob = null;
          pendingRecordingDuration = 0;
          await processRecording(blob, dur, null);
        }
      })
      .catch((error) => {
        console.error("Model load error:", error);
        loadError = error instanceof Error ? error : new Error(String(error));
      });
  });
</script>

<div id="app" class="container py-5" class:model-loaded={isModelLoaded}>
  <!-- Header -->
  <header class="text-center mb-5">
    <h1 class="display-4 fw-bold">{t("header.title")}</h1>
    <p class="lead text-muted">{t("header.subtitle")}</p>
    <div class="d-flex justify-content-center align-items-center gap-3 mt-3 flex-wrap">
      <div class="d-flex align-items-center gap-2">
        <label for="study-lang-select" class="form-label mb-0">{t("study-lang.label")}</label>
        <select
          id="study-lang-select"
          class="form-select form-select-sm w-auto"
          value={studyLangValue}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) setStudyLang(val as StudyLanguage);
          }}
        >
          <option value="">{t("study-lang.choose")}</option>
          <option value="en-GB">{t("study-lang.en-GB")}</option>
          <option value="de-DE">{t("study-lang.de")}</option>
          <option value="fr-FR">{t("study-lang.fr-FR")}</option>
        </select>
      </div>
      <div class="d-flex align-items-center gap-2">
        <label for="ui-lang-select" class="form-label mb-0">{t("ui-lang.label")}</label>
        <select
          id="ui-lang-select"
          class="form-select form-select-sm w-auto"
          value={uiLangValue}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            setUiLang(val as "auto" | "de-DE" | "en-GB" | "fr-FR");
          }}
        >
          <option value="auto">{t("ui-lang.auto")}</option>
          <option value="de-DE">{t("language.de")}</option>
          <option value="en-GB">{t("language.en")}</option>
          <option value="fr-FR">{t("language.fr")}</option>
        </select>
      </div>
      {#if availableVoices.length > 0}
        <div class="d-flex align-items-center gap-2">
          <label for="voice-select" class="form-label mb-0">{t("voice.label")}</label>
          <select
            id="voice-select"
            class="form-select form-select-sm w-auto"
            value={selectedVoiceName}
            onchange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              selectedVoiceName = val;
              const sl = getStudyLang();
              if (sl) void db.savePreferredVoice(sl, val);
              // Play the current phrase with the newly selected voice
              if (currentPhrase) autoPlayPhrase(currentPhrase.phrase);
            }}
          >
            {#each availableVoices as voice (voice.name)}
              <option value={voice.name}>{voice.label}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Level Control -->
    {#if studyLangValue}
      <div
        class="card mt-3 shadow-sm"
        style="max-width: 600px; margin-left: auto; margin-right: auto"
      >
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <label for="level-slider" class="form-label mb-0 fw-bold">{t("level.title")}</label>
            <span class="badge bg-primary">{userLevel}</span>
          </div>
          <input
            type="range"
            class="form-range"
            id="level-slider"
            min="1"
            max="1000"
            step="1"
            value={userLevel}
            oninput={(e) => {
              userLevel = parseInt((e.target as HTMLInputElement).value, 10);
            }}
            onchange={(e) => {
              void handleLevelChange(parseInt((e.target as HTMLInputElement).value, 10));
            }}
          />
          <div class="d-flex justify-content-between text-muted small">
            <span>1</span>
            <span>{userLevel}</span>
            <!-- Removed getLevelText (undefined) -->
            <span>1000</span>
          </div>
          <p class="text-muted small mb-0 mt-2">{t("level.description")}</p>
        </div>
      </div>
    {/if}
  </header>

  <!-- Load Error -->
  {#if loadError}
    <div class="alert alert-danger mb-4" role="alert">
      <h5 class="alert-heading">{t("errors.title")}</h5>
      <p><strong>{t("errors.message_label")}</strong> {loadError.message}</p>
      <details class="mb-3">
        <summary class="btn btn-sm btn-outline-danger">{t("errors.show_details")}</summary>
        <pre
          class="mt-2 p-3 bg-light border rounded text-start"
          style="overflow-x:auto;font-size:.85rem">{loadError.stack}</pre>
      </details>
      <button class="btn btn-primary" onclick={() => location.reload()}>
        {t("errors.reload")}
      </button>
    </div>
  {/if}

  <!-- Main Content -->
  <main id="main-content">
    <!-- Intro text (shown when no study language is selected yet) -->
    {#if !studyLangValue}
      <div class="card shadow-sm mb-4">
        <div class="card-body text-center py-4">
          <p class="lead mb-1">Welcome to Phoneme Party! Choose a study language above to start.</p>
          <p class="lead mb-1">Willkommen bei Phoneme Party! Wähle eine Lernsprache oben aus.</p>
          <p class="lead mb-0">
            Bienvenue sur Phonème Party ! Choisissez une langue à apprendre ci-dessus.
          </p>
        </div>
      </div>
    {/if}

    <!-- Phrase Display Card -->
    <div class="card shadow-lg mb-4">
      <div class="card-body text-center py-5">
        {#if currentPhrase}
          <div class="emoji-display mb-3">
            <img
              src={emojiToTwemojiUrl(currentPhrase.emoji)}
              alt={currentPhrase.emoji}
              draggable="false"
              style="height: 1em; width: auto"
            />
          </div>
          <div class="d-flex justify-content-center align-items-center gap-2">
            <h2 id="phrase-text" class="display-5 fw-bold mb-0">{currentPhrase.phrase}</h2>
            <button
              id="replay-phrase-btn"
              class="btn btn-sm btn-outline-secondary"
              title="Play phrase again"
              onclick={() => void playDesiredPronunciation(currentPhrase?.phrase ?? "")}
            >
              <i class="bi bi-volume-up-fill"></i>
            </button>
          </div>
          {@const xlangPhrase = getPhraseInLang(currentPhrase, uiLang)}
          {#if xlangPhrase !== currentPhrase.phrase}
            <p class="text-muted fs-5 mb-0" data-testid="ui-lang-phrase">{xlangPhrase}</p>
          {/if}
        {:else}
          <div class="emoji-display mb-3">🎉</div>
          <button class="btn btn-primary btn-lg mt-2" onclick={() => void nextPhrase()}
            >{t("buttons.press_to_play")}</button
          >
        {/if}
      </div>
    </div>

    <!-- Recorder alerts -->
    {#each recorderAlerts as alert (alert.id)}
      <div class="alert alert-{alert.type} alert-dismissible fade show mt-2">
        <strong>{t(alert.titleKey)}</strong>
        <p class="mb-0 mt-1">{t(alert.bodyKey)}</p>
        <button
          type="button"
          class="btn-close"
          onclick={() => {
            recorderAlerts = recorderAlerts.filter((a) => a.id !== alert.id);
          }}
          aria-label={t("buttons.close")}
        ></button>
      </div>
    {/each}

    <!-- Controls -->
    {#if currentPhrase}
      <div class="d-flex gap-3 mb-3">
        <button
          id="record-btn"
          class="btn btn-lg flex-grow-1"
          class:btn-danger={!isRecording && !isProcessing}
          class:btn-warning={isRecording}
          class:pulse={isRecording}
          disabled={isProcessing || !currentPhrase || pendingRecordingBlob !== null}
          onclick={() => void handleRecordToggle()}
        >
          <span>🎤</span>
          {#if isProcessing}
            {t("record.processing", { percent: Math.round(processingProgress) })}
          {:else if isRecording}
            {t("record.recording")}
          {:else}
            {t("record.hold")}
          {/if}
        </button>
        <button
          id="next-phrase-btn"
          class="btn btn-lg btn-outline-primary flex-grow-1"
          onclick={() => void nextPhrase()}
        >
          {t("buttons.next_phrase")}
        </button>
      </div>
    {/if}

    <!-- Model loading progress (only shown when a recording is pending and model is still loading) -->
    {#if pendingRecordingBlob && !isModelLoaded}
      <div class="mb-4">
        <p class="text-muted small text-center mb-2">{t("loading.waiting_for_model")}</p>
        <div class="progress" style="height: 20px">
          <div
            class="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style="width: {loadingProgress}%"
            aria-valuenow={loadingProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {loadingProgress}%
          </div>
        </div>
      </div>
    {/if}

    <!-- Processing Progress Bar -->
    {#if isProcessing}
      <div id="processing-progress" class="mb-4">
        <div class="progress" style="height: 30px">
          <div
            id="processing-progress-bar"
            class="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style="width: {processingProgress}%"
            aria-valuenow={processingProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {t("processing.label")}
          </div>
        </div>
      </div>
    {/if}

    <!-- Feedback Section -->
    <div id="feedback-section" style={showFeedback ? "" : "display: none"}>
      {#if inlineError}
        <div class="alert alert-danger" role="alert">
          <h5 class="alert-heading">
            <i class="bi bi-exclamation-circle-fill me-2"></i>{t("errors.title")}
          </h5>
          <p><strong>{t("errors.message_label")}</strong> {inlineError.message}</p>
          <details>
            <summary class="btn btn-sm btn-outline-danger">{t("errors.show_details")}</summary>
            <pre
              class="mt-2 p-2 bg-light border rounded"
              style="overflow-x:auto;font-size:.8rem;max-height:300px">{inlineError.stack}</pre>
          </details>
        </div>
      {:else}
        <div class="card shadow-sm" style={score && currentPhrase ? "" : "display: none"}>
          <div class="card-header">
            <h5 class="mb-0">{t("feedback.title")}</h5>
          </div>
          <div class="card-body">
            <div class="alert {score?.bootstrapClass} mb-3" role="alert">
              <h4 class="alert-heading">{score?.grade}</h4>
              {#if !score?.notFound}
                <p class="mb-0">
                  {t("feedback.phoneme_similarity")}
                  <strong>{score?.similarityPercent}%</strong>
                </p>
              {/if}
            </div>

            <div class="text-center mb-3">
              <strong>{t("feedback.target_phrase_label")}</strong>
              <p class="mb-0">{currentPhrase?.phrase}</p>
            </div>

            <div class="mb-3">
              <div class="d-flex justify-content-center align-items-start gap-2 flex-wrap">
                <div class="d-flex align-items-center">
                  <strong class="me-2">{t("feedback.target_ipa_label")}</strong>
                  <button
                    id="play-target-btn"
                    class="btn btn-sm btn-outline-secondary"
                    title={t("feedback.play_target")}
                    onclick={() => void playDesiredPronunciation(currentPhrase?.phrase ?? "")}
                  >
                    <i class="bi bi-volume-up-fill"></i>
                  </button>
                </div>
                <div class="d-flex align-items-center">
                  <strong class="me-2">{t("feedback.your_ipa_label")}</strong>
                  {#if lastRecordingBlob}
                    <button
                      id="play-recording-btn"
                      class="btn btn-sm btn-outline-secondary"
                      title="Play your recording (long press to download)"
                      use:longPressDownload
                      onclick={() => playRecordingAudio()}
                    >
                      <i class="bi bi-play-fill"></i>
                    </button>
                  {/if}
                  {#if lastRecordingAudioData}
                    <button
                      id="reprocess-recording-btn"
                      class="btn btn-sm btn-outline-primary ms-2"
                      title="Re-run IPA detection"
                      onclick={() => void reprocessRecording()}
                    >
                      <i class="bi bi-arrow-clockwise"></i>
                    </button>
                  {/if}
                </div>
              </div>

              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                id="phoneme-comparison-grid"
                role="group"
                class="mt-3 d-flex justify-content-center flex-wrap gap-1"
                onclick={handlePhonemeClick}
                onkeydown={() => {}}
              >
                {#if score?.notFound}
                  <span class="text-muted">{t("feedback.phrase_not_in_vocab")}</span>
                {:else}
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html phonemeComparisonHTML}
                {/if}
              </div>

              <span id="feedback-target-ipa" style="display:none"
                >{currentPhrase?.ipas[0]?.ipa}</span
              >
              <span id="feedback-actual-ipa" style="display:none">{actualIPA}</span>
            </div>

            <!-- IPA Explanations -->
            <div class="mt-3">
              <button
                type="button"
                class="text-decoration-none small btn btn-link p-0"
                aria-expanded={ipaExplanationsVisible}
                onclick={() => {
                  ipaExplanationsVisible = !ipaExplanationsVisible;
                }}
              >
                <i class="bi bi-info-circle me-1"></i>
                {t("feedback.ipa_help")}
                <i class="bi {ipaExplanationsVisible ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1"
                ></i>
              </button>
              {#if ipaExplanationsVisible}
                <div class="mt-2">
                  <div class="card card-body bg-light small" id="ipa-explanations-content">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html ipaExplanationsHTML || t("feedback.no_ipa_help")}
                  </div>
                  <div class="mt-2 text-end">
                    <a
                      href={resolve("/ipa-symbols", {})}
                      class="small text-muted"
                      rel="noopener noreferrer"
                    >
                      <!-- Replaced ipaSymbolsHref with static path -->
                      <i class="bi bi-list-ul me-1"></i>{t("buttons.see_all_ipa")}
                    </a>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Model Details -->
            {#if lastRecordingAudioData}
              <div class="mt-3 text-center">
                <button
                  id="show-model-details-btn"
                  class="btn btn-sm btn-outline-info"
                  onclick={() => void showModelDetailsPanel()}
                >
                  <i class="bi bi-graph-up me-1"></i>
                  Show Model Details
                </button>
              </div>
            {/if}

            {#if modelDetailsVisible}
              <div id="model-details" class="mt-3">
                <div class="card card-body bg-light">
                  <h6 class="fw-bold mb-3">
                    <i class="bi bi-cpu me-1"></i>
                    Model Output Visualization
                  </h6>
                  {#if modelDetailsLoading}
                    <div class="text-center">
                      <div class="spinner-border spinner-border-sm"></div>
                      {t("processing.analyzing")}
                    </div>
                  {:else}
                    <div id="model-details-content">
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      {@html modelDetailsHTML}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <div class="text-center mt-4">
              <h4 class="mb-3">{score?.grade}</h4>
              <p class="lead">{score?.message}</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Processing Debug -->
    {#if processingSteps.length > 0}
      <div class="processing-debug mt-4">
        <div class="processing-debug-title">{t("processing.debug_title")}</div>
        {#if processingMeta.length > 0}
          <ul class="processing-debug-list processing-debug-meta">
            {#each processingMeta as item (item.labelKey)}
              <li class="processing-debug-item">
                <span class="processing-debug-label">{t(item.labelKey)}</span>
                <span class="processing-debug-value">{item.value}</span>
              </li>
            {/each}
          </ul>
        {/if}
        <ul class="processing-debug-list">
          {#each processingSteps as step (step.labelKey)}
            <li class="processing-debug-item" class:total={step.isTotal}>
              <span class="processing-debug-label">{t(step.labelKey)}</span>
              <span class="processing-debug-value">
                {step.isTotal
                  ? `${step.ms.toFixed(0)} ms`
                  : `${step.ms.toFixed(0)} ms (${processingTotalMs && processingTotalMs > 0 ? Math.round((step.ms / processingTotalMs) * 100) : 0}%)`}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- History Section (managed by history.ts) -->
    <div class="card shadow-sm mt-4">
      <div class="card-header">
        <h5 class="mb-0">{t("history.title")}</h5>
      </div>
      <div class="card-body">
        <div id="history-container" style="max-height: 500px; overflow-y: auto">
          <div id="history-empty" class="text-center py-4 text-muted" style="display: none">
            <i class="bi bi-inbox fs-1"></i>
            <p class="mt-2">{t("history.empty")}</p>
          </div>
          <div id="history-list"></div>
          <div id="history-loading" class="text-center py-3" style="display: none">
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">{t("loading.hidden_label")}</span>
            </div>
            <span class="ms-2 small text-muted">{t("history.loading")}</span>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Console Output -->
  <div class="card mb-4 bg-dark text-light mt-4">
    <div
      class="card-header d-flex justify-content-between align-items-center"
      style="cursor: pointer"
      role="button"
      tabindex="0"
      onclick={() => {
        consoleExpanded = !consoleExpanded;
      }}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") consoleExpanded = !consoleExpanded;
      }}
      aria-expanded={consoleExpanded}
    >
      <div>
        <strong>{t("console.title")}</strong>
        <i class="bi {consoleExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} ms-2"></i>
      </div>
      <div class="btn-group btn-group-sm">
        <button
          class="btn btn-outline-light"
          title={t("console.copy_title")}
          onclick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(consoleLog).catch(console.error);
          }}
        >
          {t("console.copy")}
        </button>
        <button
          class="btn btn-outline-light"
          title={t("console.clear_title")}
          onclick={(e) => {
            e.stopPropagation();
            consoleLog = "";
          }}
        >
          {t("console.clear")}
        </button>
      </div>
    </div>
    {#if consoleExpanded}
      <div class="card-body">
        <pre
          style="max-height:300px;overflow-y:auto;margin:0;font-size:.85rem;white-space:pre-wrap">{consoleLog}</pre>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <footer class="text-center mt-5 text-muted">
    <small>
      {t("footer.powered_by")}
      <a href="https://github.com/lingjzhu/zipa" target="_blank">ZIPA</a>
      |
      {t("footer.local_processing")}
      |
      <span
        class={!webgpuAvailable ||
        !webgpuEnabled ||
        webgpuValidationFailed ||
        shaderF16 === null ||
        !shaderF16
          ? "text-warning"
          : "text-success"}
      >
        {#if shaderF16 === null}
          {t("footer.webgpu_status_checking")}
        {:else if !webgpuAvailable}
          {t("footer.webgpu_status_unavailable")}
        {:else if !webgpuEnabled}
          {t("footer.webgpu_status_disabled_manual")}
        {:else if webgpuValidationFailed}
          {t("footer.webgpu_status_validation_failed")}
        {:else if shaderF16}
          {t("footer.webgpu_status_active")}
        {:else}
          {t("footer.webgpu_status_no_shader_f16")}
        {/if}
      </span>
      |
      <label class="d-inline user-select-none" style="cursor: pointer">
        <input
          type="checkbox"
          class="me-1"
          checked={webgpuEnabled}
          onchange={(e) => {
            const checked = (e.target as HTMLInputElement).checked;
            localStorage.setItem("webgpu-enabled", checked ? "true" : "false");
            window.location.reload();
          }}
        />
        {t("footer.enable_webgpu")}
      </label>
      <span id="coi-warning" style="display: none">
        | <span class="text-warning">Multi-threading disabled (no cross-origin isolation)</span>
      </span>
      |
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static file not managed by SvelteKit router -->
      <a href="attribution.html">{t("footer.attribution")}</a>
      |
      <button
        class="btn btn-sm btn-link p-0 text-muted"
        data-bs-toggle="modal"
        data-bs-target="#device-details-modal"
        onclick={() =>
          void collectDeviceDetails().then((text) => {
            deviceDetailsText = text;
          })}
      >
        {t("footer.device_details")}
      </button>
    </small>
  </footer>
</div>

<!-- Device Details Modal -->
<div class="modal fade" id="device-details-modal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t("footer.device_details_title")}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small">{t("footer.device_details_help")}</p>
        <pre
          class="bg-light border rounded p-3 small"
          style="white-space: pre-wrap; word-break: break-all">{deviceDetailsText}</pre>
        <button
          class="btn btn-sm btn-outline-secondary mt-2"
          onclick={() => void navigator.clipboard.writeText(deviceDetailsText)}
        >
          {t("footer.copy")}
        </button>
      </div>
    </div>
  </div>
</div>
