/**
 * Phoneme extraction using wav2vec2-espeak INT4 model
 * Outputs IPA phonemes directly from audio
 */

// Model configuration
// Using your HuggingFace repo for ZIPA small CTC ONNX model
const MODEL_REPO = 'guettli/zipa-small-ctc-onnx-2026-01-28';
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/model.onnx`;
const VOCAB_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/vocab.json`;

let session = null;
let vocab = null;
let idToToken = null;

/**
 * Load the phoneme extraction model
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<void>}
 */
export async function loadPhonemeModel(progressCallback) {
  console.log('Loading phoneme extraction model...');

  // Wait for ONNX Runtime to be available
  while (!window.ort) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const ort = window.ort;

  try {
    // Load vocab first (small)
    progressCallback({ status: 'downloading', name: 'vocab.json', progress: 0 });
    console.log('Fetching vocab from:', VOCAB_URL);

    const vocabResponse = await fetch(VOCAB_URL);
    if (!vocabResponse.ok) {
      throw new Error(`Failed to fetch vocab: ${vocabResponse.status}`);
    }
    vocab = await vocabResponse.json();

    // Create reverse mapping (id -> token)
    idToToken = {};
    for (const [token, id] of Object.entries(vocab)) {
      idToToken[id] = token;
    }
    console.log(`Loaded vocab with ${Object.keys(vocab).length} tokens`);

    progressCallback({ status: 'downloading', name: 'model.onnx', progress: 10 });

    // Configure ONNX Runtime - prefer WebGPU
    const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu;
    if (!webgpuAvailable) {
      console.warn('⚠️ WebGPU not available - falling back to WASM (slower inference)');
      console.warn('   For best performance, use Chrome 113+ or Edge 113+ with WebGPU enabled');
    }

    const executionProviders = webgpuAvailable
      ? ['webgpu', 'wasm']
      : ['wasm'];

    console.log('Loading ONNX model from:', MODEL_URL);
    console.log('WebGPU available:', webgpuAvailable);
    console.log('Execution providers:', executionProviders);

    // Load model with progress tracking
    const modelResponse = await fetch(MODEL_URL);
    if (!modelResponse.ok) {
      throw new Error(`Failed to fetch model: ${modelResponse.status}`);
    }

    const contentLength = modelResponse.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    // Read response as stream for progress tracking
    const reader = modelResponse.body.getReader();
    const chunks = [];
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
    const modelBuffer = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      modelBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    progressCallback({ status: 'initializing', progress: 90 });

    // Create inference session
    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders,
      graphOptimizationLevel: 'all',
    });

    progressCallback({ status: 'ready', progress: 100 });
    console.log('Phoneme model loaded successfully');
    console.log('Model inputs:', session.inputNames);
    console.log('Model outputs:', session.outputNames);

  } catch (error) {
    console.error('Failed to load phoneme model:', error);
    throw error;
  }
}

/**
 * Extract phonemes from audio data
 * @param {Float32Array} audioData - Audio samples at 16kHz
 * @returns {Promise<string>} IPA phoneme string
 */
export async function extractPhonemes(audioData) {
  if (!session) {
    throw new Error('Phoneme model not loaded');
  }

  const ort = window.ort;

  // Create input tensor [batch=1, sequence_length]
  const inputTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);

  // Run inference
  const feeds = { input_values: inputTensor };
  const results = await session.run(feeds);

  // Get logits output
  const logits = results.logits;
  const logitsData = logits.data;
  const [batchSize, seqLen, vocabSize] = logits.dims;

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

  return phonemes.join(' ');
}

/**
 * CTC greedy decode: remove consecutive duplicates and special tokens
 * @param {number[]} ids - Predicted token IDs
 * @returns {string[]} Decoded phonemes
 */
function ctcDecode(ids) {
  const phonemes = [];
  let prevId = -1;

  for (const id of ids) {
    // Skip if same as previous (CTC collapse)
    if (id === prevId) continue;
    prevId = id;

    // Skip special tokens
    const token = idToToken[id];
    if (!token || token === '<pad>' || token === '<s>' || token === '</s>' || token === '<unk>') {
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
 * @returns {Object} Token to ID mapping
 */
export function getVocab() {
  return vocab;
}
