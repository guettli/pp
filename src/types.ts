/**
 * Core type definitions for Phoneme Party
 */

// IPA pronunciation with category
export interface IPA {
  ipa: string;
  category: string;
}

// Phrase data
export interface Phrase {
  phrase: string;
  emoji: string;
  ipas: IPA[];
  level?: number; // 1-1000 difficulty level
}

/**
 * Get difficulty level text from numeric level (1-1000)
 */
export function getLevelText(level: number): string {
  if (level < 200) return "Very Easy";
  if (level < 400) return "Easy";
  if (level < 600) return "Medium";
  if (level < 800) return "Hard";
  return "Very Hard";
}

// Phoneme comparison result
export interface PhonemeComparisonItem {
  target: string | null;
  actual: string | null;
  distance: number;
  match: boolean;
  wordBoundary?: boolean; // True if this phoneme starts a new word
}

// Score result from pronunciation comparison
export interface Score {
  grade: string;
  color: string;
  bootstrapClass: string;
  message: string;
  similarity: number;
  similarityPercent: number;
  distance: number;
  phonemeComparison: PhonemeComparisonItem[];
  targetPhonemes: string[];
  actualPhonemes: string[];
  basicSimilarity: number;
  notFound?: boolean;
}

// PanPhon distance result
export interface PanPhonDistanceResult {
  distance: number;
  similarity: number;
  targetPhonemes: string[];
  actualPhonemes: string[];
  phonemeComparison: PhonemeComparisonItem[];
  maxLength: number;
}

// Alignment item for phoneme alignment
export interface AlignmentItem {
  target: string | null;
  actual: string | null;
  distance: number;
}

// Phoneme feature table type
export type PhonemeFeatureTable = Record<string, number[]>;

// Loading progress
export interface LoadingProgress {
  status?: string;
  progress?: number;
  file?: string;
  percent?: number;
}

// Application state
export interface AppState {
  currentPhrase: Phrase | null;
  isRecording: boolean;
  isProcessing: boolean;
  isModelLoaded: boolean;
  score: Score | null;
  recordingCount: number;
  webgpuAvailable: boolean;
  webgpuBackend: string | null;
  shaderF16: boolean | null;
  webgpuValidationFailed: boolean;
  modelLoadMs: number | null;
  recorder: AudioRecorderInstance | null;
  lastRecordingBlob: Blob | null;
  lastRecordingAudioData: Float32Array | null; // Cached processed audio to ensure deterministic reprocessing
  actualIPA: string | null;
  userLevel: number; // User's effective level (1-1000)
  actualUserLevel: number; // User's real level based on performance (1-1000)
}

// Audio recorder interface
export interface AudioRecorderInstance {
  start(
    onAutoStop?: (() => void) | null,
    onDataAvailable?: ((chunk: Blob) => void) | null,
    streamingInterval?: number,
  ): Promise<void>;
  stop(): Promise<{ blob: Blob; duration: number }>;
  requestPermission(): Promise<void>;
  isRecording(): boolean;
  getDuration(): number;
  minDuration: number;
  maxDuration: number;
}

// Processing timing step
export interface TimingStep {
  labelKey: string;
  ms: number;
}

// Processing debug meta
export interface DebugMeta {
  labelKey: string;
  value: string;
}

// Supported UI languages (for translations)
export type SupportedLanguage = "de" | "en" | "fr";

// Supported study languages (for phrase content)
export type StudyLanguage = "en-GB" | "de" | "fr-FR";

// Translation key type (partial, for type safety without exhaustive listing)
export type TranslationKey = string;

// User statistics based on training history
export interface UserStats {
  userLevel: number; // 80th percentile of last 30 mastered phrase levels
  masteredCount: number; // Count with score ≥95% in last 30
  totalInWindow: number; // Total attempts in window (≤30)
  language: string;
}

// ONNX Runtime types (minimal)
export interface OnnxTensor {
  data: Float32Array | Int32Array | BigInt64Array;
  dims: number[];
}

export interface OnnxInferenceSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
}

// WebGPU type augmentation
declare global {
  interface Navigator {
    gpu?: unknown;
  }

  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
