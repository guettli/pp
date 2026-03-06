# GTCRN Neural Noise Reduction + Audio Quality Metrics

## Task

Noise reduction:

This could be used:

Xiaobin-Rong/gtcrn: The official implementation of GTCRN, an ultra-lightweight SE model.

Think about alternatives.

What is better: a model or wasm for noise reduction?

If model: Cache it, similar to the zipa model.

The implementation should work in streaming mode (chunk after chunk).

## Summary

Implemented streaming neural noise reduction using the GTCRN (Grouped Temporal Convolutional
Recurrent Network) model, plus real-time audio quality feedback.

**Why GTCRN over RNNoise WASM:**

- Native 16 kHz (same as our pipeline — no resampling)
- Only 524 KB ONNX model
- Already uses `onnxruntime-web` (no new dependency)
- Streaming-native with rolling cache states (RTF = 0.07)
- Free SNR metric: `noise_estimate = original − enhanced`

**New files:**

- `src/speech/noise-suppressor-worker.ts` — Web Worker with pure-TypeScript FFT/STFT/ISTFT, GTCRN
  inference, IndexedDB model caching via existing `model-cache.ts`
- `src/speech/noise-suppressor.ts` — main-thread proxy (mirrors phoneme-extractor.ts pattern)

**Modified:** `src/routes/+page.svelte` — integrates noise suppression per chunk and shows real-time
audio quality indicator during recording:

- Volume bar (RMS → visual level)
- "Too quiet" warning (rms < 0.01)
- "Too loud / clipping" warning
- "Noisy" warning (SNR < 10 dB)

**Deleted:** `scripts/inspect-gtcrn.ts` (temporary research script)
