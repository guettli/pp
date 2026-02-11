/**
 * Whisper model loading and speech recognition
 */

import type { SupportedLanguage } from "../types.js";

interface TransformersPipeline {
  (
    audio: Float32Array,
    options?: Record<string, unknown>,
  ): Promise<{ text: string; [key: string]: unknown }>;
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<TransformersPipeline>;
  env: {
    allowLocalModels: boolean;
    remoteURL?: string;
    remotePathTemplate?: string;
    useBrowserCache?: boolean;
    backends?: {
      onnx?: {
        preferredBackend?: string;
        wasm?: {
          numThreads?: number;
        };
      };
    };
  };
}

declare global {
  interface Window {
    transformers?: TransformersModule;
  }
}

interface ProgressInfo {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

let transcriber: TransformersPipeline | null = null;

export const WHISPER_CHUNK_LENGTH_S = 30;
export const WHISPER_STRIDE_LENGTH_S = 5;

/**
 * Load Whisper model for German speech recognition
 */
export async function loadWhisper(
  progressCallback: (progress: ProgressInfo) => void,
): Promise<TransformersPipeline> {
  // Wait for transformers.js to be loaded from CDN
  while (!window.transformers) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const { pipeline, env } = window.transformers;
  env.allowLocalModels = false;
  const webgpuAvailable = typeof navigator !== "undefined" && !!navigator.gpu;
  if (env.backends?.onnx) {
    env.backends.onnx.preferredBackend = webgpuAvailable ? "webgpu" : "wasm";
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
    }
  }

  try {
    // Use wavLM+ model with fp16 for all languages
    // Model: microsoft/wavlm-plus-base-sd (or latest available)
    // See: https://huggingface.co/microsoft/wavlm-plus-base-sd
    transcriber = await pipeline("automatic-speech-recognition", "microsoft/wavlm-plus-base-sd", {
      progress_callback: (progress: ProgressInfo) => {
        progressCallback(progress);
      },
      dtype: "float16", // Enable fp16
    });

    return transcriber;
  } catch (err) {
    const error = err as Error;
    console.error("🚨 PIPELINE LOADING FAILED 🚨");
    console.error("Error message:", error.message);
    console.error("Error name:", error.name);
    console.error("Error stack:", error.stack);
    console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));

    // Additional context
    if (error.message?.includes("not valid JSON")) {
      console.error("");
      console.error("💡 DIAGNOSIS: A JSON file returned HTML instead of JSON");
      console.error("   This usually means:");
      console.error("   1. 🎯 MOST LIKELY: Browser cache has corrupted HTML files");
      console.error("   2. HuggingFace CDN is down or blocking requests");
      console.error("   3. Network/firewall is intercepting requests");
      console.error("");
      console.error("🔧 IMMEDIATE FIX:");
      console.error("   1. Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)");
      console.error('   2. Select "Cached images and files"');
      console.error('   3. Click "Clear data"');
      console.error("   4. Reload this page with Ctrl+Shift+R");
      console.error("");
      console.error("🔄 Attempting to clear transformers.js cache automatically...");

      // Try to clear the cache
      if ("caches" in window) {
        caches
          .keys()
          .then((names) => {
            return Promise.all(names.map((name) => caches.delete(name)));
          })
          .catch((err: unknown) => {
            console.error("❌ Could not clear cache automatically:", err);
            console.error("   Please clear cache manually as described above");
          });
      }
      console.error("");
    }

    throw error;
  }
}

/**
 * Transcribe audio to text
 */
export async function transcribeAudio(
  audioData: Float32Array,
  language: SupportedLanguage = "de",
): Promise<string> {
  if (!transcriber) {
    throw new Error("Model not loaded. Please wait for initialization.");
  }

  const whisperLanguage = language === "de" ? "german" : "english";
  const result = await transcriber(audioData, {
    language: whisperLanguage,
    task: "transcribe",
    return_timestamps: false, // We only need text for MVP
    chunk_length_s: WHISPER_CHUNK_LENGTH_S,
    stride_length_s: WHISPER_STRIDE_LENGTH_S,
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
