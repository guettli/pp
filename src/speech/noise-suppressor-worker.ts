/**
 * Web Worker for real-time neural noise suppression using the FastEnhancer model.
 *
 * FastEnhancer is a speed-optimised streaming speech enhancement model that operates
 * directly on raw PCM — no STFT/ISTFT required. It processes 256-sample frames at
 * 16 kHz and keeps internal streaming states between frames.
 *
 * Pipeline per chunk:
 *   raw PCM → split into 256-sample frames → FastEnhancer (frame-by-frame) → denoised PCM
 *   + quality metrics: RMS, SNR, clipping detection
 */

import * as ort from "onnxruntime-web/webgpu";
import { getModelFromCache, saveModelToCache } from "./model-cache.js";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/";
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const FAST_ENHANCER_MODEL_URL =
  "https://github.com/aask1357/fastenhancer/releases/download/onnx-dns-v1.0.0/fastenhancer_b.onnx";

// FastEnhancer base model: 256-sample input → 256-sample output
const HOP_SIZE = 256;

// Cache shapes for the base model (5 streaming states)
const CACHE_SHAPES: number[][] = [
  [1, 256],
  [1, 256],
  [1, 24, 36],
  [1, 24, 36],
  [1, 24, 36],
];

// ── FastEnhancer state ────────────────────────────────────────────────────────

let noiseSession: ort.InferenceSession | null = null;
let caches: ort.Tensor[] = [];
let tailBuffer = new Float32Array(0); // leftover samples from previous chunk

function resetCaches(): void {
  tailBuffer = new Float32Array(0);
  caches = CACHE_SHAPES.map(
    (shape) => new ort.Tensor("float32", new Float32Array(shape.reduce((a, b) => a * b, 1)), shape),
  );
}

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadModel(): Promise<void> {
  let modelBuffer = await getModelFromCache(FAST_ENHANCER_MODEL_URL);

  if (!modelBuffer) {
    const response = await fetch(FAST_ENHANCER_MODEL_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch FastEnhancer model: ${response.status}`);
    }
    modelBuffer = await response.arrayBuffer();
    await saveModelToCache(FAST_ENHANCER_MODEL_URL, modelBuffer);
  }

  noiseSession = await ort.InferenceSession.create(new Uint8Array(modelBuffer).buffer, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });

  resetCaches();
}

// ── Chunk denoising ───────────────────────────────────────────────────────────

async function denoiseChunk(samples: Float32Array): Promise<{
  denoised: Float32Array;
  rms: number;
  snr: number;
  clipping: boolean;
}> {
  if (!noiseSession) {
    throw new Error("FastEnhancer model not loaded");
  }

  // Prepend any leftover samples from the previous call
  let all: Float32Array;
  if (tailBuffer.length > 0) {
    all = new Float32Array(tailBuffer.length + samples.length);
    all.set(tailBuffer);
    all.set(samples, tailBuffer.length);
  } else {
    all = samples;
  }

  const numFrames = Math.floor(all.length / HOP_SIZE);

  if (numFrames === 0) {
    tailBuffer = new Float32Array(all);
    return { denoised: new Float32Array(0), rms: 0, snr: 60, clipping: false };
  }

  const enhanced = new Float32Array(numFrames * HOP_SIZE);

  for (let f = 0; f < numFrames; f++) {
    const frameData = all.subarray(f * HOP_SIZE, (f + 1) * HOP_SIZE);
    const wavIn = new ort.Tensor("float32", new Float32Array(frameData), [1, HOP_SIZE]);

    const inputs: Record<string, ort.Tensor> = { wav_in: wavIn };
    for (let i = 0; i < caches.length; i++) {
      inputs[`cache_in_${i}`] = caches[i];
    }

    const result = await noiseSession.run(inputs);

    const wavOut = result["wav_out"].data as Float32Array;
    enhanced.set(wavOut, f * HOP_SIZE);

    for (let i = 0; i < caches.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      caches[i] = result[`cache_out_${i}`] as ort.Tensor;
    }
  }

  // Save leftover samples for next call
  tailBuffer = new Float32Array(all.slice(numFrames * HOP_SIZE));

  // Compute quality metrics: compare original vs enhanced
  let rmsSum = 0;
  let noiseRmsSum = 0;
  let clipping = false;
  const len = Math.min(samples.length, enhanced.length);

  for (let i = 0; i < len; i++) {
    rmsSum += samples[i] * samples[i];
    const noiseEstimate = samples[i] - enhanced[i];
    noiseRmsSum += noiseEstimate * noiseEstimate;
    if (Math.abs(samples[i]) > 0.99) clipping = true;
  }

  const rms = Math.sqrt(rmsSum / len);
  const noiseRms = Math.sqrt(noiseRmsSum / len);
  // SNR in dB: 60 dB = effectively noise-free
  const snr = noiseRms > 1e-8 ? 20 * Math.log10((rms + 1e-10) / noiseRms) : 60;

  return { denoised: enhanced, rms, snr, clipping };
}

// ── Message handler ───────────────────────────────────────────────────────────

type WorkerMessage =
  | { type: "load" }
  | { type: "processChunk"; id: number; samples: Float32Array }
  | { type: "resetState" };

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "load": {
      try {
        await loadModel();
        self.postMessage({ type: "loaded" });
      } catch (err) {
        self.postMessage({ type: "loadError", message: String(err) });
      }
      break;
    }

    case "processChunk": {
      try {
        const { denoised, rms, snr, clipping } = await denoiseChunk(msg.samples);
        self.postMessage(
          { type: "result", id: msg.id, denoised, rms, snr, clipping },
          { transfer: [denoised.buffer as ArrayBuffer] },
        );
      } catch (err) {
        self.postMessage({ type: "error", id: msg.id, message: String(err) });
      }
      break;
    }

    case "resetState": {
      resetCaches();
      break;
    }
  }
};
