/**
 * Application state management
 */

import type { AppState } from "./types.js";

export const state: AppState = {
  currentPhrase: null,
  isRecording: false,
  isModelLoaded: false,
  isProcessing: false,
  score: null,
  recorder: null,
  modelLoadMs: null,
  webgpuAvailable: false,
  webgpuBackend: null,
  lastRecordingBlob: null,
  lastRecordingAudioData: null,
  recordingCount: 0,
  actualIPA: null,
  userLevel: 1,
  actualUserLevel: 1,
};

/**
 * Update application state
 */
export function setState(updates: Partial<AppState>): void {
  Object.assign(state, updates);
}

/**
 * Reset feedback state
 */
export function resetFeedback(): void {
  setState({
    score: null,
    actualIPA: null,
  });
}
