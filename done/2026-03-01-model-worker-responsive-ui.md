# Model Worker: Keep UI Responsive During Model Loading

## Task

The model loads in the background, but `InferenceSession.create()` and SHA-256 verification on the
249 MB ONNX model block the main thread for several seconds, making the UI unresponsive.

## Solution

Moved all ORT work into a **Web Worker**:

- Created `src/speech/phoneme-worker.ts` — the actual worker containing all ONNX Runtime logic
  (model download, cache, SHA-256, `InferenceSession.create()`, inference).
- Rewrote `src/speech/phoneme-extractor.ts` as a thin proxy that spawns the worker and relays
  `loadPhonemeModel`, `extractPhonemes`, `extractPhonemesWithBlankInfo`, and
  `extractPhonemesDetailed` calls via `postMessage`.

No changes needed to callers (`+page.svelte`, `realtime-phoneme-detector.ts`) since the public API
is identical.

## Result

The main thread is no longer blocked during model initialisation. The UI stays interactive while the
249 MB model is being verified and compiled in the worker.
