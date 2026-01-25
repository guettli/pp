/**
 * Recording UI controls
 */

/**
 * Update record button to show recording state
 * @param {boolean} isRecording - Whether currently recording
 * @param {number} duration - Recording duration in ms (optional)
 */
export function updateRecordButton(isRecording, duration = 0) {
  const button = document.getElementById('record-btn');
  const icon = document.getElementById('record-icon');
  const text = document.getElementById('record-text');

  if (!button) return;

  if (isRecording) {
    button.classList.remove('btn-danger');
    button.classList.add('btn-warning', 'pulse');
    if (icon) icon.textContent = '🎤';
    const seconds = (duration / 1000).toFixed(1);
    if (text) text.textContent = `Recording... ${seconds}s`;
  } else {
    button.classList.remove('btn-warning', 'pulse');
    button.classList.add('btn-danger');
    if (icon) icon.textContent = '🎤';
    if (text) text.textContent = 'Hold to Record';
  }
}

/**
 * Enable or disable the record button
 * @param {boolean} enabled - Whether button should be enabled
 */
export function setRecordButtonEnabled(enabled) {
  const button = document.getElementById('record-btn');
  if (button) {
    button.disabled = !enabled;
  }
}

/**
 * Show processing state with progress
 * @param {number} progress - Progress percentage (0-100)
 */
export function showProcessing(progress = 0) {
  const button = document.getElementById('record-btn');
  const icon = document.getElementById('record-icon');
  const text = document.getElementById('record-text');
  const progressBar = document.getElementById('processing-progress-bar');
  const progressContainer = document.getElementById('processing-progress');

  if (button) button.disabled = true;
  if (icon) icon.textContent = '⏳';

  if (progress === 0) {
    if (text) text.textContent = 'Processing...';
  } else {
    if (text) text.textContent = `Processing... ${Math.round(progress)}%`;
  }

  // Show progress bar if available
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
  }
}

/**
 * Hide processing progress bar
 */
export function hideProcessingProgress() {
  const progressContainer = document.getElementById('processing-progress');
  if (progressContainer) {
    progressContainer.style.display = 'none';
  }
}

/**
 * Reset record button to initial state
 */
export function resetRecordButton() {
  const button = document.getElementById('record-btn');
  const icon = document.getElementById('record-icon');
  const text = document.getElementById('record-text');

  if (button) {
    button.disabled = false;
    button.classList.remove('btn-warning', 'pulse');
    button.classList.add('btn-danger');
  }
  if (icon) icon.textContent = '🎤';
  if (text) text.textContent = 'Hold to Record';

  hideProcessingProgress();
}

/**
 * Show error message for too-short recording
 */
export function showRecordingTooShortError() {
  const alert = document.createElement('div');
  alert.className = 'alert alert-info alert-dismissible fade show mt-3';
  alert.role = 'alert';
  alert.innerHTML = `
    <strong>Recording too short!</strong>
    <p class="mb-0 mt-1">Please hold down the button while speaking to record your pronunciation.</p>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  const mainContent = document.getElementById('main-content');
  const recordBtn = document.getElementById('record-btn');

  if (mainContent && recordBtn) {
    recordBtn.parentNode.insertBefore(alert, recordBtn.nextSibling);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 150);
    }, 5000);
  }
}
