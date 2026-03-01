# Main Thread Analysis: No Further Blockers Found

## Task

Are there other things that might block the main thread, like recording audio, pre-processing
(WASM), or inference?

## Analysis

### Recording audio (`AudioRecorder`)

`MediaRecorder` is fully event-driven. `ondataavailable` only pushes a Blob into an array — a
trivial operation. No blocking. ✓

### Audio decoding (`prepareAudioForModel`)

All operations are async:

- `audioBlob.arrayBuffer()` — async ✓
- `AudioContext.decodeAudioData()` — async, handled by the browser's audio subsystem off the main
  thread ✓
- `OfflineAudioContext.startRendering()` (resampling, rarely needed) — async ✓
- `getChannelData(0)` — synchronous but O(1) typed-array view, instantaneous ✓

### WASM (Kaldi FBANK, `extractKaldiFbank`)

Already moved off the main thread. `buildPhonemeFeeds` is called inside the phoneme worker
(`doExtractPhonemes` / `doExtractPhonemesWithBlankInfo`), so the synchronous WASM call runs in the
worker. ✓

### ONNX inference (`InferenceSession.run`)

Already in the worker. ✓

### PanPhon scoring (`calculatePanPhonDistance`)

Synchronous string comparison on short IPA strings (typically 5–20 phonemes). Runs in microseconds;
not a measurable main thread blocker. ✓

### PanPhon feature loading (`decodePanphonFeatures`)

Runs once at module initialisation. Decodes ~6 KB of base64 data into a lookup table. Takes < 1 ms.
✓

## Conclusion

No additional fixes required. The web-worker migration from the previous task already addressed all
significant main-thread blockers.
