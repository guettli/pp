/**
 * Loading overlay and progress display
 */

import { t } from '../i18n.js';

// Track last logged progress to throttle console output
let lastLoggedPercent = -10;

interface ProgressInfo {
  status?: string;
  progress?: number;
  file?: string;
}

/**
 * Update loading progress
 */
export function updateLoadingProgress(progress: ProgressInfo): void {
  const statusElement = document.getElementById('loading-status');
  const progressBar = document.getElementById('loading-progress');

  if (!progress) return;

  // Only log every 10% to reduce console spam
  const currentPercent = progress.progress ? Math.round(progress.progress) : 0;
  const shouldLog = currentPercent >= lastLoggedPercent + 10 || progress.status !== 'downloading';

  // Update status message with detailed information
  if (statusElement) {
    if (progress.status === 'initiate') {
      const fileName = progress.file || 'unknown';
      statusElement.textContent = t('loading.status.initiate', { file: fileName });
      if (shouldLog) console.log(statusElement.textContent);
    } else if (progress.status === 'download') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      const fileName = progress.file || 'model';
      statusElement.textContent = t('loading.status.download', { file: fileName, percent });
      if (shouldLog) console.log(statusElement.textContent);
    } else if (progress.status === 'done') {
      const fileName = progress.file || 'file';
      statusElement.textContent = t('loading.status.done', { file: fileName });
      if (shouldLog) console.log(statusElement.textContent);
    } else if (progress.status === 'progress') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      const fileName = progress.file || 'model';
      statusElement.textContent = t('loading.status.progress', { file: fileName, percent });
      if (shouldLog) console.log(statusElement.textContent);
    } else if (progress.status === 'downloading') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      statusElement.textContent = t('loading.status.downloading_model', { percent });
      if (shouldLog) {
        console.log(statusElement.textContent);
        lastLoggedPercent = currentPercent;
      }
    } else if (progress.status === 'loading') {
      statusElement.textContent = t('loading.status.loading_model');
      if (shouldLog) console.log(statusElement.textContent);
    } else if (progress.status === 'ready') {
      statusElement.textContent = t('loading.status.ready');
      if (shouldLog) console.log(statusElement.textContent);
    } else {
      const msg = progress.status || t('loading.initializing');
      statusElement.textContent = t('loading.status.fallback', { status: msg });
      if (shouldLog) console.log(statusElement.textContent);
    }
  }

  // Update progress bar
  if (progressBar && progress.progress !== undefined) {
    const percent = Math.round(progress.progress);
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', String(percent));
    progressBar.textContent = `${percent}%`;
  }
}

/**
 * Show loading overlay
 */
export function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  const mainContent = document.getElementById('main-content');

  if (overlay) overlay.style.display = 'block';
  if (mainContent) mainContent.style.display = 'none';
}

/**
 * Hide loading overlay and show main content
 */
export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  const mainContent = document.getElementById('main-content');

  if (overlay) overlay.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
}

/**
 * Show error message (for fatal initialization errors)
 */
export function showError(error: unknown): void {
  const err = error as Error;
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    const errorMessage = err.message || t('errors.unknown');
    const errorStack = err.stack || t('errors.no_stack');

    overlay.innerHTML = `
      <div class="card-body py-5">
        <div class="text-danger text-center mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="bi bi-exclamation-triangle" viewBox="0 0 16 16">
            <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
            <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/>
          </svg>
        </div>
        <h5 class="text-center mb-3">${t('errors.title')}</h5>
        <div class="alert alert-danger" role="alert">
          <strong>${t('errors.message_label')}</strong> ${errorMessage}
        </div>
        <details class="mb-3">
          <summary class="btn btn-sm btn-outline-secondary">${t('errors.show_details')}</summary>
          <pre class="mt-2 p-3 bg-light border rounded text-start" style="overflow-x: auto; font-size: 0.85rem;">${errorStack}</pre>
        </details>
        <div class="text-center">
          <button class="btn btn-primary" onclick="location.reload()">
            ${t('errors.reload')}
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * Show inline error alert (for non-fatal errors during operation)
 */
export function showInlineError(error: unknown): void {
  const err = error as Error;
  const feedbackSection = document.getElementById('feedback-section');
  if (!feedbackSection) return;

  const errorMessage = err.message || t('errors.unknown');
  const errorStack = err.stack || t('errors.no_stack');

  feedbackSection.style.display = 'block';
  feedbackSection.innerHTML = `
    <div class="alert alert-danger" role="alert">
      <h5 class="alert-heading">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-circle-fill me-2" viewBox="0 0 16 16">
          <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
        </svg>
        ${t('errors.title')}
      </h5>
      <p><strong>${t('errors.message_label')}</strong> ${errorMessage}</p>
      <details>
        <summary class="btn btn-sm btn-outline-danger">${t('errors.show_details')}</summary>
        <pre class="mt-2 p-2 bg-light border rounded" style="overflow-x: auto; font-size: 0.8rem; max-height: 300px;">${errorStack}</pre>
      </details>
    </div>
  `;

  feedbackSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
