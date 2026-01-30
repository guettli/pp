/**
 * Application state management
 */

export const state = {
  currentWord: null,
  isRecording: false,
  isModelLoaded: false,
  isProcessing: false,
  score: null,
  recorder: null,
  transcriber: null,
  modelLoadMs: null,
  webgpuAvailable: null,
  webgpuBackend: null,
  lastRecordingBlob: null
};

/**
 * Update application state
 * @param {Object} updates - Object with state updates
 */
export function setState(updates) {
  Object.assign(state, updates);
}

/**
 * Reset feedback state
 */
export function resetFeedback() {
  setState({
    score: null
  });
}
