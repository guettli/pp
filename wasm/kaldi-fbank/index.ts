/**
 * Kaldi Fbank WASM Wrapper
 * Provides exact feature parity with ZIPA's Python/Lhotse/Kaldi inference.
 * Loads the raw WASM produced by `zig build` (no Emscripten JS glue needed).
 */

interface WasmExports {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  extract_fbank: (audioPtr: number, numSamples: number, outNumFramesPtr: number) => number;
  free_features: (ptr: number) => void;
}

let wasmInstance: WebAssembly.Instance | null = null;

async function loadWasmBytes(): Promise<ArrayBuffer> {
  if (typeof process !== "undefined" && process.versions?.node) {
    // Node.js / tsx environment
    const { readFileSync } = await import("fs");
    const { fileURLToPath } = await import("url");
    const { dirname, join } = await import("path");
    const file = fileURLToPath(import.meta.url);
    const wasmPath = join(dirname(file), "build", "kaldi-fbank.wasm");
    const buf = readFileSync(wasmPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  // Browser environment
  const url = new URL("./build/kaldi-fbank.wasm", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load WASM: ${response.statusText}`);
  return response.arrayBuffer();
}

/**
 * Initialize the WASM module (call once at startup)
 */
export async function initFbank(): Promise<void> {
  if (wasmInstance) return;
  const bytes = await loadWasmBytes();
  const result = await WebAssembly.instantiate(bytes, {});
  wasmInstance = result.instance;
}

/**
 * Extract Kaldi Fbank features from audio
 * @param audio - 16kHz mono audio samples
 * @returns Features as Float32Array with shape (frames, 80)
 */
export async function extractKaldiFbank(audio: Float32Array): Promise<Float32Array> {
  if (!wasmInstance) await initFbank();

  const exports = wasmInstance!.exports as unknown as WasmExports;
  const memory = exports.memory;

  // Allocate input buffers in WASM linear memory
  const audioPtr = exports.malloc(audio.length * 4); // 4 bytes per f32
  const numFramesPtr = exports.malloc(4); // one i32

  try {
    // Copy audio into WASM memory
    new Float32Array(memory.buffer).set(audio, audioPtr / 4);

    // Call WASM function
    const featuresPtr = exports.extract_fbank(audioPtr, audio.length, numFramesPtr);

    if (featuresPtr === 0) {
      throw new Error("Fbank extraction failed - no frames generated");
    }

    // Read back the frame count written by extract_fbank
    const numFrames = new Int32Array(memory.buffer)[numFramesPtr / 4];

    if (numFrames === 0) {
      throw new Error("Fbank extraction returned 0 frames");
    }

    // Copy features out before freeing WASM memory
    const featureCount = numFrames * 80;
    const features = new Float32Array(new Float32Array(memory.buffer, featuresPtr, featureCount));

    exports.free_features(featuresPtr);
    return features;
  } finally {
    exports.free(audioPtr);
    exports.free(numFramesPtr);
  }
}

/**
 * Extract Kaldi Fbank features with metadata
 */
export async function extractKaldiFbankWithMetadata(audio: Float32Array): Promise<{
  features: Float32Array;
  numFrames: number;
  numBins: number;
}> {
  const features = await extractKaldiFbank(audio);
  return {
    features,
    numFrames: features.length / 80,
    numBins: 80,
  };
}
