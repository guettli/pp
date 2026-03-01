# Background Model Loading

## Task

Load zipa model in background. Show some intro text at the beginning (all uiLangs). Allow audio
recording, even if model is not loaded yet. Detect silence, without model. Maybe wasm makes sense
for that? Then wait until model is ready to use. Show a progressbar until model is loaded (if
recording was done). Otherwise do not show a progress bar.

## What was done

### `src/routes/+page.svelte`

**Background model loading:**

- Removed blocking `isLoading` state variable (was `true` until model finished downloading).
- `onMount` no longer awaits `loadPhonemeModel()`. The model loads via a detached `.then()/.catch()`
  chain — the UI is immediately interactive.
- New `isModelLoaded = $state(false)` set to `true` once model is ready.
- `class:model-loaded={isModelLoaded}` added to `#app` div so test fixtures can detect readiness.

**Intro text (all UI languages simultaneously):**

- Card shown when `!studyLangValue` (no study language selected yet).
- Displays welcome text in English, German, and French at the same time — no i18n key needed since
  all three are always shown together.

**Recording before model is ready (silence-only detection):**

- `handleRecordStart()` now has two paths:
  - `isModelLoaded`: creates `RealTimePhonemeDetector` as before (full real-time with model).
  - `!isModelLoaded`: uses a simple inline RMS-energy silence detector — pure JS, no ONNX.
    Accumulates chunks in a local array, computes RMS on the combined audio, triggers
    `actuallyStopRecording()` after 1500 ms of silence (threshold 0.01). No WASM needed since the
    existing `prepareAudioForModel()` (used for decoding) already runs in browser.

**Pending recording queue:**

- `actuallyStopRecording()` detects `!isModelLoaded`: stores the blob + duration in
  `pendingRecordingBlob` / `pendingRecordingDuration` and returns early.
- When model finishes loading, if a pending recording exists, `processRecording()` is called
  automatically with the queued data.
- Record button gains `|| pendingRecordingBlob !== null` in its `disabled` condition.

**Processing extracted to `processRecording()`:**

- All phoneme extraction + scoring logic moved from `actuallyStopRecording()` into a new standalone
  `processRecording(audioBlob, duration, detector)` function. Handles its own errors internally (no
  re-throw), so it can be called safely from both paths.

**Inline model progress bar:**

- Shown only when `pendingRecordingBlob && !isModelLoaded` — exactly as specified.
- Uses existing `loadingProgress` (0–100) driven by `updateLoadingProgressState()`.
- Removed `loadingStatus` state variable (was used only in the old full-page overlay).

**Load error:**

- Replaced full-page blocking overlay with a small inline `alert-danger` card. Page is always
  usable; error is shown if model fails.

**Level control:**

- The `{#if !isLoading}` gate replaced with `{#if studyLangValue}` — level slider only appears when
  a study language is selected.

### `src/i18n.ts`

- Added `"loading.waiting_for_model"` to all three languages (de-DE, en-GB, fr-FR) for the inline
  progress bar label.

### `tests/fixtures.js`

- Updated `modelPage` worker fixture: no longer waits for `#loading-overlay` (removed). Instead:
  1. Waits for `#main-content` to be visible (immediate after page load).
  2. Waits for `#app.model-loaded` to be attached (fires when `isModelLoaded` becomes `true`).
