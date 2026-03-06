# AudioWorklet Streaming Recorder

## Task

Replace `MediaRecorder` with an `AudioWorklet`-based recorder for true real-time audio streaming.

## Problem

`MediaRecorder` produced compressed container format chunks (WebM/MP4) that cannot be decoded
individually — each chunk is a fragment of a streaming container. This meant
`RealTimePhonemeDetector` had to re-combine and re-decode ALL accumulated chunks from scratch on
every callback, which was increasingly expensive as the recording grew.

## Solution

Replaced `MediaRecorder` with `AudioWorklet` + Web Audio API:

- **`src/audio/recorder.ts`**: Complete rewrite using `AudioWorkletNode`. An inline processor
  (loaded via Blob URL, bundler-agnostic) collects 128-sample blocks, assembles them into
  configurable-size batches, and posts raw `Float32Array` PCM data to the main thread. The `stop()`
  method encodes all accumulated samples as a 16-bit WAV Blob (playable by `<audio>` and decodable
  by Web Audio API).

- **`src/types.ts`**: Updated `AudioRecorderInstance` interface — `onDataAvailable` now delivers
  `Float32Array` instead of `Blob`.

- **`src/speech/realtime-phoneme-detector.ts`**: Updated to accumulate `Float32Array` chunks.
  `processAccumulatedAudio()` now simply concatenates typed arrays — no Blob decoding overhead.
  `getAccumulatedAudio()` returns `Float32Array | null`.

- **`src/routes/+page.svelte`**: Updated both the model-loaded path (passes `Float32Array` to
  `realtimeDetector.addChunk()`) and the fallback silence-detection path (computes RMS directly on
  each Float32Array chunk without any blob decoding).

- **`tests/`**: Updated four streaming-related Playwright tests to pass `Float32Array` chunks
  (decoded from the test FLAC file) instead of raw binary blob fragments.

## Benefits

- Each chunk is independently usable raw PCM — zero re-decoding cost per callback
- Silence detection computes RMS directly on Float32 data (O(n) vs previously O(total_n) per call)
- The OS microphone indicator disappears promptly when `stop()` is called (stream tracks stopped
  immediately before waiting for worklet flush)
- No dependency on container format support (WebM/MP4) for intermediate processing
