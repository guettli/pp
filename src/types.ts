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
  difficulty?: {
    score: number;
  };
}

/**
 * Get difficulty level from numeric score
 */
export function getDifficultyLevel(score: number): string {
  if (score < 20) return "Very Easy";
  if (score < 40) return "Easy";
  if (score < 60) return "Medium";
  if (score < 80) return "Hard";
  return "Very Hard";
}

// Phoneme comparison result
export interface PhonemeComparisonItem {
  target: string | null;
  actual: string | null;
  distance: number;
  match: boolean;
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
  modelLoadMs: number | null;
  recorder: AudioRecorderInstance | null;
  lastRecordingBlob: Blob | null;
  actualIPA: string | null;
}

// Audio recorder interface
export interface AudioRecorderInstance {
  start(onAutoStop?: () => void): Promise<void>;
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

// Supported languages
export type SupportedLanguage = "de" | "en";

// Translation key type (partial, for type safety without exhaustive listing)
export type TranslationKey = string;

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
