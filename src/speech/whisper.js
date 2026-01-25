/**
 * Whisper model loading and speech recognition
 */

let transcriber = null;

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
  // Use default HuggingFace CDN
  console.log('allowLocalModels: ', env.allowLocalModels);
  console.log('Using default HuggingFace CDN');
  console.log('remoteURL:', env.remoteURL);
  console.log('remotePathTemplate:', env.remotePathTemplate);
  console.log('allowLocalModels:', env.allowLocalModels);
  console.log('useBrowserCache:', env.useBrowserCache);

  console.log('Starting pipeline initialization...');

  try {
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
    console.error('Pipeline loading failed');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    throw error;
  }
}

/**
 * Transcribe audio to German text
 * @param {Float32Array} audioData - Preprocessed audio data
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioData) {
  if (!transcriber) {
    throw new Error('Model not loaded. Please wait for initialization.');
  }

  const result = await transcriber(audioData, {
    language: 'german',
    task: 'transcribe',
    return_timestamps: false,  // We only need text for MVP
    chunk_length_s: 30,
    stride_length_s: 5
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
