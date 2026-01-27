/**
 * Whisper model loading and speech recognition
 */

let transcriber = null;

export const WHISPER_CHUNK_LENGTH_S = 30;
export const WHISPER_STRIDE_LENGTH_S = 5;

/**
 * Load Whisper model for German speech recognition
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<Object>} Loaded transcriber
 */
export async function loadWhisper(progressCallback) {
  // Wait for transformers.js to be loaded from CDN
  console.log('Waiting for transformers.js...');
  while (!window.transformers) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('Transformers.js available, configuring environment...');
  const { pipeline, env } = window.transformers;
  env.allowLocalModels = false;
  const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu;
  if (env.backends?.onnx) {
    env.backends.onnx.preferredBackend = webgpuAvailable ? 'webgpu' : 'wasm';
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
    }
  }
  // Use default HuggingFace CDN
  console.log('allowLocalModels: ', env.allowLocalModels);
  console.log('Using default HuggingFace CDN');
  console.log('remoteURL:', env.remoteURL);
  console.log('remotePathTemplate:', env.remotePathTemplate);
  console.log('allowLocalModels:', env.allowLocalModels);
  console.log('useBrowserCache:', env.useBrowserCache);
  console.log('webgpuAvailable:', webgpuAvailable);

  console.log('Starting pipeline initialization...');

  try {
    // Use whisper-tiny for faster in-browser ASR
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      {
        progress_callback: (progress) => {
          console.log('Pipeline progress:', progress);
          progressCallback(progress);
        }
      }
    );

    console.log('Pipeline initialized successfully');
    return transcriber;
  } catch (error) {
    console.error('🚨 PIPELINE LOADING FAILED 🚨');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    // Additional context
    if (error.message.includes('not valid JSON')) {
      console.error('');
      console.error('💡 DIAGNOSIS: A JSON file returned HTML instead of JSON');
      console.error('   This usually means:');
      console.error('   1. 🎯 MOST LIKELY: Browser cache has corrupted HTML files');
      console.error('   2. HuggingFace CDN is down or blocking requests');
      console.error('   3. Network/firewall is intercepting requests');
      console.error('');
      console.error('🔧 IMMEDIATE FIX:');
      console.error('   1. Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)');
      console.error('   2. Select "Cached images and files"');
      console.error('   3. Click "Clear data"');
      console.error('   4. Reload this page with Ctrl+Shift+R');
      console.error('');
      console.error('🔄 Attempting to clear transformers.js cache automatically...');

      // Try to clear the cache
      if ('caches' in window) {
        caches.keys().then(names => {
          console.log('📦 Found caches:', names);
          return Promise.all(
            names.map(name => {
              console.log('🗑️ Deleting cache:', name);
              return caches.delete(name);
            })
          );
        }).then(() => {
          console.log('✅ Cache cleared! Please reload the page now (Ctrl+Shift+R or Cmd+Shift+R)');
          console.log('');
        }).catch(err => {
          console.error('❌ Could not clear cache automatically:', err);
          console.error('   Please clear cache manually as described above');
        });
      }
      console.error('');
    }

    throw error;
  }
}

/**
 * Transcribe audio to text
 * @param {Float32Array} audioData - Preprocessed audio data
 * @param {string} language - Language code ("de" or "en")
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioData, language = 'de') {
  if (!transcriber) {
    throw new Error('Model not loaded. Please wait for initialization.');
  }

  const whisperLanguage = language === 'de' ? 'german' : 'english';
  const result = await transcriber(audioData, {
    language: whisperLanguage,
    task: 'transcribe',
    return_timestamps: false,  // We only need text for MVP
    chunk_length_s: WHISPER_CHUNK_LENGTH_S,
    stride_length_s: WHISPER_STRIDE_LENGTH_S
  });

  return result.text.trim();
}

/**
 * Check if model is loaded
 * @returns {boolean}
 */
export function isModelLoaded() {
  return transcriber !== null;
}
