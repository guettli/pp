/**
 * Recording UI controls
 */

/**
 * Update record button to show recording state
 * @param {boolean} isRecording - Whether currently recording
 */
export function updateRecordButton(isRecording) {
  const button = document.getElementById('record-btn');
  const icon = document.getElementById('record-icon');
  const text = document.getElementById('record-text');

  if (!button) return;

  if (isRecording) {
    button.classList.remove('btn-danger');
    button.classList.add('btn-warning', 'pulse');
    if (icon) icon.textContent = '⏹️';
    if (text) text.textContent = 'Stop Recording';
  } else {
    button.classList.remove('btn-warning', 'pulse');
    button.classList.add('btn-danger');
    if (icon) icon.textContent = '🎤';
    if (text) text.textContent = 'Record Your Voice';
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
 * Show processing state
 */
export function showProcessing() {
  const button = document.getElementById('record-btn');
  const icon = document.getElementById('record-icon');
  const text = document.getElementById('record-text');

  if (button) button.disabled = true;
  if (icon) icon.textContent = '⏳';
  if (text) text.textContent = 'Processing...';
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
  if (text) text.textContent = 'Record Your Voice';
}
