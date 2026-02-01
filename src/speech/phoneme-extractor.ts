/**
 * Phoneme extraction using ZIPA small CTC ONNX model
 * Outputs IPA phonemes directly from audio
 */

import { extractLogMelJS } from './mel-js.js';
import { getModelFromCache, saveModelToCache } from './model-cache.js';

// ONNX Runtime types
interface OrtTensor {
  data: Float32Array | BigInt64Array;
  dims: number[];
}

interface OrtInferenceSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

interface OrtRuntime {
  InferenceSession: {
    create(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<OrtInferenceSession>;
  };
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => OrtTensor;
}

declare global {
  interface Window {
    ort?: OrtRuntime;
  }
}

interface ProgressInfo {
  status: string;
  name?: string;
  progress: number;
  loaded?: number;
  total?: number;
}

// Model configuration
// Using your HuggingFace repo for ZIPA small CTC ONNX model
const MODEL_REPO = 'guettli/zipa-small-ctc-onnx-2026-01-28';
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/model.onnx`;
const VOCAB_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/vocab.json`;

let session: OrtInferenceSession | null = null;
let vocab: Record<string, number> | null = null;
let idToToken: Record<number, string> | null = null;

/**
 * Load the phoneme extraction model
 */
export async function loadPhonemeModel(progressCallback: (info: ProgressInfo) => void): Promise<void> {
  // Wait for ONNX Runtime to be available
  while (!window.ort) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const ort = window.ort;

  try {
    // Load vocab first (small)
    progressCallback({ status: 'downloading', name: 'vocab.json', progress: 0 });

    const vocabResponse = await fetch(VOCAB_URL);
    if (!vocabResponse.ok) {
      throw new Error(`Failed to fetch vocab: ${vocabResponse.status}`);
    }
    vocab = await vocabResponse.json() as Record<string, number>;

    // Create reverse mapping (id -> token)
    idToToken = {};
    for (const [token, id] of Object.entries(vocab)) {
      idToToken[id as unknown as number] = token;
    }


    progressCallback({ status: 'downloading', name: 'model.onnx', progress: 10 });

    // Configure ONNX Runtime - prefer WebGPU
    const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu;
    const executionProviders = webgpuAvailable
      ? ['webgpu', 'wasm']
      : ['wasm'];

    // Try to load model from IndexedDB cache first
    let modelArrayBuffer = await getModelFromCache(MODEL_URL);
    if (!modelArrayBuffer) {
      // Not cached: download and cache

      // Load model with progress tracking
      const modelResponse = await fetch(MODEL_URL);
      if (!modelResponse.ok) {
        throw new Error(`Failed to fetch model: ${modelResponse.status}`);
      }

      const contentLength = modelResponse.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      // Read response as stream for progress tracking
      if (!modelResponse.body) {
        throw new Error('Model response body is null');
      }
      const reader = modelResponse.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loadedBytes += value.length;

        if (totalBytes > 0) {
          const progress = 10 + (loadedBytes / totalBytes) * 80;
          progressCallback({
            status: 'downloading',
            name: 'model.onnx',
            progress: Math.round(progress),
            loaded: loadedBytes,
            total: totalBytes
          });
        }
      }

      // Combine chunks into single ArrayBuffer
      const combinedArray = new Uint8Array(loadedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }
      // Save to IndexedDB cache
      await saveModelToCache(MODEL_URL, combinedArray.buffer);
      modelArrayBuffer = combinedArray.buffer;
    }

    // Use cached or freshly downloaded model
    const modelBuffer = new Uint8Array(modelArrayBuffer);

    progressCallback({ status: 'initializing', progress: 90 });

    // Create inference session
    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders,
      graphOptimizationLevel: 'all',
    });

    progressCallback({ status: 'ready', progress: 100 });

  } catch (error) {
    console.error('Failed to load phoneme model:', error);
    throw error;
  }
}

/**
 * Extract phonemes from audio data
 */
export async function extractPhonemes(audioData: Float32Array): Promise<string> {
  if (!session) {
    throw new Error('Phoneme model not loaded');
  }

  const ort = window.ort;
  if (!ort) {
    throw new Error('ONNX Runtime not loaded');
  }

  // Extract log-mel features (shape: [frames, 80])
  const melBands = 80;
  const melFeatures = extractLogMelJS(audioData, melBands);
  const numFrames = melFeatures.length / melBands;
  // Reshape to [1, numFrames, 80]
  const inputTensor = new ort.Tensor('float32', melFeatures, [1, numFrames, melBands]);
  // Prepare x_lens tensor (number of frames)
  const xLensTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(numFrames)]), [1]);
  // Run inference
  const feeds = { x: inputTensor, x_lens: xLensTensor };
  const results = await session.run(feeds);
  let logits = results.logits || results.log_probs;
  if (!logits) {
    // Try to use the first output if logits is not found
    const firstKey = Object.keys(results)[0];
    logits = results[firstKey];
  }
  if (!logits) {
    throw new Error('No logits output found in ONNX results. Available keys: ' + Object.keys(results).join(', '));
  }
  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;

  // Greedy decode: argmax over vocab dimension
  const predictedIds = [];
  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxVal = logitsData[t * vocabSize];
    for (let v = 1; v < vocabSize; v++) {
      const val = logitsData[t * vocabSize + v];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = v;
      }
    }
    predictedIds.push(maxIdx);
  }

  // CTC decode: remove consecutive duplicates and blanks
  const phonemes = ctcDecode(predictedIds);

  return phonemes.join('');
}

/**
 * CTC greedy decode: remove consecutive duplicates and special tokens
 */
function ctcDecode(ids: number[]): string[] {
  const phonemes: string[] = [];
  let prevId = -1;

  for (const id of ids) {
    // Skip if same as previous (CTC collapse)
    if (id === prevId) continue;
    prevId = id;

    // Skip special tokens (including sentence boundary marker ▁)
    const token = idToToken?.[id];
    if (!token || token === '<pad>' || token === '<s>' || token === '</s>' || token === '<unk>' || token === '<blk>' || token === '▁') {
      continue;
    }

    phonemes.push(token);
  }

  return phonemes;
}

/**
 * Check if model is loaded
 * @returns {boolean}
 */
export function isPhonemeModelLoaded() {
  return session !== null && vocab !== null;
}

/**
 * Get the vocabulary
 */
export function getVocab(): Record<string, number> | null {
  return vocab;
}
