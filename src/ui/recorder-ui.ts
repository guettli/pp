/**
 * Recording UI controls
 */

import { t } from "../i18n.js";

interface TimingStep {
  labelKey: string;
  ms: number;
  isTotal?: boolean;
}

interface MetaItem {
  labelKey: string;
  value: string;
}

interface ProcessingTimings {
  steps: TimingStep[];
  meta?: MetaItem[];
  totalMs?: number;
}

/**
 * Update record button to show recording state
 */
export function updateRecordButton(isRecording: boolean): void {
  const button = document.getElementById("record-btn");
  const icon = document.getElementById("record-icon");
  const text = document.getElementById("record-text");

  if (!button) return;

  if (isRecording) {
    button.classList.remove("btn-danger");
    button.classList.add("btn-warning", "pulse");
    if (icon) icon.textContent = "🎤";
    if (text) text.textContent = t("record.recording");
  } else {
    button.classList.remove("btn-warning", "pulse");
    button.classList.add("btn-danger");
    if (icon) icon.textContent = "🎤";
    if (text) text.textContent = t("record.hold");
  }
}

/**
 * Enable or disable the record button
 */
export function setRecordButtonEnabled(enabled: boolean): void {
  const button = document.getElementById("record-btn") as HTMLButtonElement | null;
  if (button) {
    button.disabled = !enabled;
  }
}

/**
 * Show processing state with progress
 * @param {number} progress - Progress percentage (0-100)
 */
export function showProcessing(progress = 0) {
  const button = document.getElementById("record-btn");
  const icon = document.getElementById("record-icon");
  const text = document.getElementById("record-text");
  const progressBar = document.getElementById("processing-progress-bar");
  const progressContainer = document.getElementById("processing-progress");
  const debugContainer = document.getElementById("processing-debug");

  if (button) (button as HTMLButtonElement).disabled = true;
  if (icon) icon.textContent = "⏳";

  if (progress === 0) {
    if (text) text.textContent = t("record.processing_plain");
    if (debugContainer) {
      debugContainer.style.display = "none";
      debugContainer.innerHTML = "";
    }
  } else {
    if (text)
      text.textContent = t("record.processing", {
        percent: Math.round(progress),
      });
  }

  // Show progress bar if available
  if (progressContainer) {
    progressContainer.style.display = "block";
  }
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute("aria-valuenow", String(progress));
  }
}

/**
 * Hide processing progress bar
 */
export function hideProcessingProgress() {
  const progressContainer = document.getElementById("processing-progress");
  const progressBar = document.getElementById("processing-progress-bar");

  if (progressContainer) {
    progressContainer.style.display = "none";
  }

  // Reset progress bar to 0% to prevent it from being stuck at 100%
  if (progressBar) {
    progressBar.style.width = "0%";
    progressBar.setAttribute("aria-valuenow", "0");
  }
}

/**
 * Show processing timing details
 */
export function showProcessingDetails(timings: ProcessingTimings): void {
  const debugContainer = document.getElementById("processing-debug");
  if (!debugContainer || !timings || !Array.isArray(timings.steps)) {
    return;
  }

  const steps: TimingStep[] = timings.steps.slice();
  const totalMs =
    timings.totalMs !== undefined && Number.isFinite(timings.totalMs)
      ? timings.totalMs
      : steps.reduce((sum: number, step: TimingStep) => sum + (step.ms || 0), 0);

  const metaItems: MetaItem[] = Array.isArray(timings.meta) ? timings.meta : [];
  const metaList = metaItems
    .map((item: MetaItem) => {
      const label = t(item.labelKey);
      const value = item.value || "—";
      return `
      <li class="processing-debug-item">
        <span class="processing-debug-label">${label}</span>
        <span class="processing-debug-value">${value}</span>
      </li>
    `;
    })
    .join("");

  steps.push({ labelKey: "processing.step_total", ms: totalMs, isTotal: true });

  const items = steps
    .map((step: TimingStep) => {
      const ms = Number.isFinite(step.ms) ? step.ms : 0;
      const percent = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
      const label = t(step.labelKey);
      const value = step.isTotal ? `${ms.toFixed(0)} ms` : `${ms.toFixed(0)} ms (${percent}%)`;

      return `
      <li class="processing-debug-item${step.isTotal ? " total" : ""}">
        <span class="processing-debug-label">${label}</span>
        <span class="processing-debug-value">${value}</span>
      </li>
    `;
    })
    .join("");

  debugContainer.innerHTML = `
    <div class="processing-debug-title">${t("processing.debug_title")}</div>
    ${metaList ? `<ul class="processing-debug-list processing-debug-meta">${metaList}</ul>` : ""}
    <ul class="processing-debug-list">
      ${items}
    </ul>
  `;
  debugContainer.style.display = "block";
}

/**
 * Reset record button to initial state
 */
export function resetRecordButton() {
  const button = document.getElementById("record-btn");
  const icon = document.getElementById("record-icon");
  const text = document.getElementById("record-text");

  if (button) {
    (button as HTMLButtonElement).disabled = false;
    button.classList.remove("btn-warning", "pulse");
    button.classList.add("btn-danger");
  }
  if (icon) icon.textContent = "🎤";
  if (text) text.textContent = t("record.hold");

  hideProcessingProgress();
}

/**
 * Show error message for too-short recording
 */
export function showRecordingTooShortError() {
  const alert = document.createElement("div");
  alert.className = "alert alert-info alert-dismissible fade show mt-3";
  alert.role = "alert";
  alert.innerHTML = `
    <strong>${t("record.too_short_title")}</strong>
    <p class="mb-0 mt-1">${t("record.too_short_body")}</p>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="${t("buttons.close")}"></button>
  `;

  const mainContent = document.getElementById("main-content");
  const recordBtn = document.getElementById("record-btn");

  if (mainContent && recordBtn && recordBtn.parentNode) {
    recordBtn.parentNode.insertBefore(alert, recordBtn.nextSibling);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      alert.classList.remove("show");
      setTimeout(() => alert.remove(), 150);
    }, 5000);
  }
}

/**
 * Show info message when requesting microphone permission
 */
export function showMicrophonePermissionNotice(): void {
  const alert = document.createElement("div");
  alert.className = "alert alert-warning alert-dismissible fade show mt-3";
  alert.role = "alert";
  alert.innerHTML = `
    <strong>${t("record.permission_title")}</strong>
    <p class="mb-0 mt-1">${t("record.permission_body")}</p>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="${t("buttons.close")}"></button>
  `;

  const mainContent = document.getElementById("main-content");
  const recordBtn = document.getElementById("record-btn");

  if (mainContent && recordBtn && recordBtn.parentNode) {
    recordBtn.parentNode.insertBefore(alert, recordBtn.nextSibling);

    // Auto-dismiss after 7 seconds
    setTimeout(() => {
      alert.classList.remove("show");
      setTimeout(() => alert.remove(), 150);
    }, 7000);
  }
}
