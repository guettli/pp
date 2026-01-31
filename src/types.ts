/**
 * Core type definitions for Phoneme Party
 */

// Word data
export interface Word {
  word: string;
  emoji: string;
  ipa: string;
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
  currentWord: Word | null;
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
export type SupportedLanguage = 'de' | 'en';

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
