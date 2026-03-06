/**
 * Real-time phoneme detection during recording.
 * Receives raw Float32 PCM chunks (16 kHz mono) from AudioWorklet and processes them
 * without any re-decoding overhead — each call works on independently usable sample data.
 */

import { peakNormalize } from "../audio/processor.js";
import { calculatePanPhonDistance } from "../comparison/panphon-distance.js";
import { extractPhonemesWithBlankInfo } from "./phoneme-extractor.js";

/**
 * Configuration for real-time detection
 */
interface DetectorConfig {
  /** Target IPA phonemes to match */
  targetIPA: string;
  /** Study language code for phoneme comparison (e.g., "en-GB", "de-DE") */
  studyLang: string;
  /** Similarity threshold to trigger auto-stop (0-1) */
  threshold?: number;
  /** Minimum number of chunks before checking */
  minChunksBeforeCheck?: number;
  /** Silence threshold (RMS volume below this is considered silence, 0-1) */
  silenceThreshold?: number;
  /** Duration of silence in ms before triggering stop */
  silenceDuration?: number;
  /** Number of trailing blank frames required to trigger stop after chars detected (default: 15) */
  blankTrailFrames?: number;
  /** Minimum blank token probability to count as a trailing blank frame (default: 0.95) */
  blankTrailConfidence?: number;
}

/**
 * Callback types for real-time detection events
 */
export interface DetectorCallbacks {
  /** Called when phonemes are detected */
  onPhonemeUpdate?: (phonemes: string, similarity: number) => void;
  /** Called when target phrase is matched */
  onTargetMatched?: (phonemes: string, similarity: number) => void;
  /** Called when silence is detected for configured duration */
  onSilenceDetected?: () => void;
  /** Called when chars were detected and then N blank frames follow (end-of-speech) */
  onBlankTrailDetected?: () => void;
}

/**
 * Real-time phoneme detector for streaming audio
 */
export class RealTimePhonemeDetector {
  private config: Required<DetectorConfig>;
  private callbacks: DetectorCallbacks;
  private audioChunks: Float32Array[] = [];
  private totalSamples = 0;
  private chunkCount = 0;
  private isProcessing = false;
  private lastExtractedPhonemes = "";
  private lastSimilarity = 0;
  private hasMatched = false;
  private silenceStartTime: number | null = null;
  private hasSilenceTriggered = false;
  private lastProcessedChunkCount = 0; // Track how many chunks were in last successful processing
  private hasDetectedChars = false;
  private hasBlankTrailTriggered = false;

  constructor(config: DetectorConfig, callbacks: DetectorCallbacks = {}) {
    this.config = {
      targetIPA: config.targetIPA,
      studyLang: config.studyLang,
      threshold: config.threshold ?? 1.0, // Default to 100% similarity
      minChunksBeforeCheck: config.minChunksBeforeCheck ?? 3, // Wait for at least 3 chunks (1.5 seconds)
      silenceThreshold: config.silenceThreshold ?? 0.01, // RMS threshold for silence
      silenceDuration: config.silenceDuration ?? 1500, // 1.5 seconds of silence
      blankTrailFrames: config.blankTrailFrames ?? 15,
      blankTrailConfidence: config.blankTrailConfidence ?? 0.95,
    };
    this.callbacks = callbacks;
  }

  /**
   * Add a batch of raw PCM samples (16 kHz mono Float32) for processing.
   * Unlike MediaRecorder chunks, each batch is independently usable, so no
   * full-audio re-decode is required — we simply concatenate Float32Arrays.
   */
  async addChunk(samples: Float32Array): Promise<void> {
    // Ignore empty batches
    if (samples.length === 0) return;

    this.audioChunks.push(samples);
    this.totalSamples += samples.length;
    this.chunkCount++;

    // Only check after minimum number of chunks
    if (this.chunkCount < this.config.minChunksBeforeCheck) {
      return;
    }

    // Don't process if already matched
    if (this.hasMatched) {
      return;
    }

    // Don't process if already processing (but don't skip the chunks - they're already accumulated)
    // This avoids overlapping processing attempts, but ensures chunks keep accumulating
    if (this.isProcessing) {
      return;
    }

    // Process accumulated audio
    await this.processAccumulatedAudio();
  }

  /**
   * Check for silence in already-decoded audio data
   * This is called after successfully decoding accumulated chunks
   */
  private async checkSilenceFromAudioData(audioData: Float32Array): Promise<void> {
    // Skip if already triggered
    if (this.hasSilenceTriggered) return;

    try {
      // Calculate RMS volume from the decoded audio
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);

      const now = Date.now();

      // Check if the audio is silent
      if (rms < this.config.silenceThreshold) {
        // Start tracking silence if not already
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else {
          // Check if silence duration exceeded
          const silenceDuration = now - this.silenceStartTime;
          if (silenceDuration >= this.config.silenceDuration) {
            this.hasSilenceTriggered = true;
            if (this.callbacks.onSilenceDetected) {
              this.callbacks.onSilenceDetected();
            }
          }
        }
      } else {
        // Reset silence tracking if sound detected
        this.silenceStartTime = null;
      }
    } catch (error) {
      console.error("Error checking silence:", error);
    }
  }

  /**
   * Process all accumulated audio chunks.
   * Concatenates Float32 PCM arrays directly — no blob decoding overhead.
   */
  private async processAccumulatedAudio(): Promise<void> {
    if (this.audioChunks.length === 0) return;

    // Skip if we haven't accumulated enough NEW chunks since last processing
    // This avoids reprocessing the same incomplete data
    const newChunkCount = this.audioChunks.length - this.lastProcessedChunkCount;
    if (newChunkCount < 2 && this.lastProcessedChunkCount > 0) {
      // Need at least 2 new chunks to try again after a previous attempt
      return;
    }

    this.isProcessing = true;

    try {
      // Concatenate all accumulated Float32 chunks directly — O(n) copy, no decoding needed
      const audioData = new Float32Array(this.totalSamples);
      let offset = 0;
      for (const chunk of this.audioChunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }

      // Check for silence on the decoded audio (not on individual chunks)
      await this.checkSilenceFromAudioData(audioData);

      // Normalize after silence check so quiet audio doesn't fool the detector
      const normalizedAudioData = peakNormalize(audioData);

      // Extract phonemes and check for trailing blank frames
      const { phonemes, trailingBlankFrames } = await extractPhonemesWithBlankInfo(
        normalizedAudioData,
        this.config.blankTrailConfidence,
      );
      this.lastExtractedPhonemes = phonemes;

      if (phonemes.length > 0) {
        this.hasDetectedChars = true;
      }

      // Track that we successfully processed these chunks
      this.lastProcessedChunkCount = this.audioChunks.length;

      // Calculate similarity with target
      const result = calculatePanPhonDistance(
        this.config.targetIPA,
        phonemes,
        this.config.studyLang,
      );
      this.lastSimilarity = result.similarity;

      // Notify listeners
      if (this.callbacks.onPhonemeUpdate) {
        this.callbacks.onPhonemeUpdate(phonemes, result.similarity);
      }

      // Check if target is matched
      if (result.similarity >= this.config.threshold && !this.hasMatched) {
        this.hasMatched = true;
        if (this.callbacks.onTargetMatched) {
          this.callbacks.onTargetMatched(phonemes, result.similarity);
        }
      }

      // Check blank trail stop: chars detected, then N frames of high-confidence blank
      if (
        !this.hasBlankTrailTriggered &&
        this.hasDetectedChars &&
        trailingBlankFrames >= this.config.blankTrailFrames
      ) {
        this.hasBlankTrailTriggered = true;
        this.callbacks.onBlankTrailDetected?.();
      }
    } catch (error) {
      console.error(
        `Error processing accumulated audio (${this.audioChunks.length} chunks):`,
        error,
      );
      // Don't update lastProcessedChunkCount on error - we'll retry with more chunks
      // Continue processing future chunks - more data might make it decodable
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Finalize processing - ensures all accumulated audio is processed
   * Call this after recording stops to get the final, complete results
   * @returns Promise that resolves when processing is complete
   */
  async finalize(): Promise<void> {
    // Wait for any ongoing processing to complete
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Force processing of any remaining chunks
    if (this.audioChunks.length > this.lastProcessedChunkCount) {
      await this.processAccumulatedAudio();
    }

    // Wait again in case processing started
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Get the last extracted phonemes
   */
  getLastPhonemes(): string {
    return this.lastExtractedPhonemes;
  }

  /**
   * Get the last similarity score
   */
  getLastSimilarity(): number {
    return this.lastSimilarity;
  }

  /**
   * Check if target has been matched
   */
  hasTargetMatched(): boolean {
    return this.hasMatched;
  }

  /**
   * Get all accumulated audio as a concatenated Float32Array (16 kHz mono PCM)
   */
  getAccumulatedAudio(): Float32Array | null {
    if (this.audioChunks.length === 0) return null;
    const combined = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.audioChunks = [];
    this.totalSamples = 0;
    this.chunkCount = 0;
    this.isProcessing = false;
    this.lastExtractedPhonemes = "";
    this.lastSimilarity = 0;
    this.hasMatched = false;
    this.silenceStartTime = null;
    this.hasSilenceTriggered = false;
    this.lastProcessedChunkCount = 0;
    this.hasDetectedChars = false;
    this.hasBlankTrailTriggered = false;
  }
}
