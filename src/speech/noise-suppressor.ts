/**
 * Noise suppressor — proxy to noise-suppressor-worker.ts.
 * Runs FastEnhancer model inference in a Web Worker to keep the main thread responsive.
 *
 * Usage:
 *   await initNoiseSuppressor();           // start worker + load model (non-blocking)
 *   resetNoiseSuppressorState();            // reset before each new recording
 *   const result = await processChunk(samples); // denoise + get quality metrics
 */

export interface AudioQuality {
  /** RMS amplitude of the original audio (0–1) */
  rms: number;
  /** Signal-to-Noise Ratio in dB (higher = cleaner) */
  snr: number;
  /** Whether any sample was clipping (> 0.99) */
  clipping: boolean;
}

export interface ChunkResult {
  denoised: Float32Array;
  quality: AudioQuality;
}

type PendingRequest = { resolve: (v: ChunkResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let _modelLoaded = false;
const pending = new Map<number, PendingRequest>();
let nextId = 0;

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./noise-suppressor-worker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      type: string;
      id?: number;
      message?: string;
      denoised?: Float32Array;
      rms?: number;
      snr?: number;
      clipping?: boolean;
    };

    if (msg.type === "loaded") {
      _modelLoaded = true;
    } else if (msg.type === "loadError") {
      console.warn("FastEnhancer noise suppressor failed to load:", msg.message);
    } else if (msg.type === "result" && msg.id !== undefined) {
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        req.resolve({
          denoised: msg.denoised ?? new Float32Array(0),
          quality: {
            rms: msg.rms ?? 0,
            snr: msg.snr ?? 60,
            clipping: msg.clipping ?? false,
          },
        });
      }
    } else if (msg.type === "error" && msg.id !== undefined) {
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        req.reject(new Error(msg.message));
      }
    }
  };

  worker.onerror = (event) => {
    console.error("Noise suppressor worker error:", event);
  };

  return worker;
}

/**
 * Start the noise suppressor worker and begin loading the GTCRN model.
 * Non-blocking — model loads in the background.
 */
export function initNoiseSuppressor(): void {
  const w = getWorker();
  w.postMessage({ type: "load" });
}

/**
 * Whether the FastEnhancer model has finished loading.
 */
export function isNoiseSuppressorReady(): boolean {
  return _modelLoaded;
}

/**
 * Reset FastEnhancer streaming cache state. Call this before each new recording
 * so the model starts with a clean context.
 */
export function resetNoiseSuppressorState(): void {
  if (worker) worker.postMessage({ type: "resetState" });
}

/**
 * Denoise a PCM chunk (16 kHz mono Float32) and return quality metrics.
 *
 * If the model is not yet loaded, returns the original samples unchanged
 * and computes basic quality metrics (RMS + clipping) without SNR. FastEnhancer
 * processes 256-sample frames; output may be slightly shorter than input if
 * the chunk length is not a multiple of 256.
 */
export async function processChunk(samples: Float32Array): Promise<ChunkResult> {
  if (!_modelLoaded) {
    // Passthrough: compute basic metrics without FastEnhancer
    let rmsSum = 0;
    let clipping = false;
    for (let i = 0; i < samples.length; i++) {
      rmsSum += samples[i] * samples[i];
      if (Math.abs(samples[i]) > 0.99) clipping = true;
    }
    const rms = Math.sqrt(rmsSum / samples.length);
    return { denoised: samples, quality: { rms, snr: 60, clipping } };
  }

  const id = nextId++;
  const w = getWorker();

  // Transfer ownership of a copy to avoid detached buffer issues
  const samplesCopy = new Float32Array(samples);

  return new Promise<ChunkResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "processChunk", id, samples: samplesCopy }, [samplesCopy.buffer]);
  });
}
