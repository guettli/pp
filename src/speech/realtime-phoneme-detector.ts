/**
 * Real-time phoneme detection during recording
 * Processes audio chunks as they arrive and detects when target phrase is spoken
 */

import { extractPhonemesWithBlankInfo } from "./phoneme-extractor.js";
import { prepareAudioForModel } from "../audio/processor.js";
import { calculatePanPhonDistance } from "../comparison/panphon-distance.js";

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
  private audioChunks: Blob[] = [];
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
   * Add an audio chunk for processing
   */
  async addChunk(chunk: Blob): Promise<void> {
    // Ignore empty chunks
    if (chunk.size === 0) return;

    this.audioChunks.push(chunk);
    this.chunkCount++;

    // Note: We don't check for silence on individual chunks because MediaRecorder chunks
    // are streaming fragments that can't be decoded individually. Instead, we check for
    // silence when processing accumulated chunks in processAccumulatedAudio().

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
   * Process all accumulated audio chunks
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
      // Combine all chunks into a single blob
      const combinedBlob = new Blob(this.audioChunks, { type: this.audioChunks[0].type });

      // Prepare audio for model
      const audioData = await prepareAudioForModel(combinedBlob);

      // Check for silence on the decoded audio (not on individual chunks)
      await this.checkSilenceFromAudioData(audioData);

      // Extract phonemes and check for trailing blank frames
      const { phonemes, trailingBlankFrames } = await extractPhonemesWithBlankInfo(
        audioData,
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
   * Get all accumulated audio as a single blob
   */
  getAccumulatedAudio(): Blob | null {
    if (this.audioChunks.length === 0) return null;
    return new Blob(this.audioChunks, { type: this.audioChunks[0].type });
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.audioChunks = [];
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
