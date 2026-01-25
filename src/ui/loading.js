/**
 * Loading overlay and progress display
 */

/**
 * Update loading progress
 * @param {Object} progress - Progress object from transformers.js
 */
export function updateLoadingProgress(progress) {
  const statusElement = document.getElementById('loading-status');
  const progressBar = document.getElementById('loading-progress');

  console.log('Loading progress:', progress);

  if (!progress) return;

  // Update status message with detailed information
  if (statusElement) {
    if (progress.status === 'initiate') {
      const fileName = progress.file || 'unknown';
      statusElement.textContent = `🔄 Initiating download: ${fileName}`;
      console.log(`🔄 Initiating download: ${fileName}`);
    } else if (progress.status === 'download') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      const fileName = progress.file || 'model';
      statusElement.textContent = `⬇️ Downloading ${fileName}... ${percent}%`;
      console.log(`⬇️ Downloading ${fileName}: ${percent}%`);
    } else if (progress.status === 'done') {
      const fileName = progress.file || 'file';
      statusElement.textContent = `✅ Downloaded ${fileName}`;
      console.log(`✅ Downloaded ${fileName}`);
    } else if (progress.status === 'progress') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      const fileName = progress.file || 'model';
      statusElement.textContent = `📥 Loading ${fileName}... ${percent}%`;
      console.log(`📥 Loading ${fileName}: ${percent}%`);
    } else if (progress.status === 'downloading') {
      const percent = progress.progress ? Math.round(progress.progress) : 0;
      statusElement.textContent = `⬇️ Downloading model... ${percent}%`;
      console.log(`⬇️ Downloading: ${percent}%`);
    } else if (progress.status === 'loading') {
      statusElement.textContent = '📂 Loading model into memory...';
      console.log('📂 Loading model into memory...');
    } else if (progress.status === 'ready') {
      statusElement.textContent = '✨ Ready!';
      console.log('✨ Model ready!');
    } else {
      const msg = progress.status || 'Initializing...';
      statusElement.textContent = `⏳ ${msg}`;
      console.log(`⏳ ${msg}`);
    }
  }

  // Update progress bar
  if (progressBar && progress.progress !== undefined) {
    const percent = Math.round(progress.progress);
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', percent);
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
 * @param {Error} error - Error object
 */
export function showError(error) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    const errorMessage = error.message || 'Unknown error';
    const errorStack = error.stack || 'No stack trace available';

    overlay.innerHTML = `
      <div class="card-body py-5">
        <div class="text-danger text-center mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" class="bi bi-exclamation-triangle" viewBox="0 0 16 16">
            <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
            <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/>
          </svg>
        </div>
        <h5 class="text-center mb-3">Error</h5>
        <div class="alert alert-danger" role="alert">
          <strong>Message:</strong> ${errorMessage}
        </div>
        <details class="mb-3">
          <summary class="btn btn-sm btn-outline-secondary">Show Full Error Details</summary>
          <pre class="mt-2 p-3 bg-light border rounded text-start" style="overflow-x: auto; font-size: 0.85rem;">${errorStack}</pre>
        </details>
        <div class="text-center">
          <button class="btn btn-primary" onclick="location.reload()">
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * Show inline error alert (for non-fatal errors during operation)
 * @param {Error} error - Error object
 */
export function showInlineError(error) {
  const feedbackSection = document.getElementById('feedback-section');
  if (!feedbackSection) return;

  const errorMessage = error.message || 'Unknown error';
  const errorStack = error.stack || 'No stack trace available';

  feedbackSection.style.display = 'block';
  feedbackSection.innerHTML = `
    <div class="alert alert-danger" role="alert">
      <h5 class="alert-heading">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-circle-fill me-2" viewBox="0 0 16 16">
          <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
        </svg>
        Error
      </h5>
      <p><strong>Message:</strong> ${errorMessage}</p>
      <details>
        <summary class="btn btn-sm btn-outline-danger">Show Full Error Details</summary>
        <pre class="mt-2 p-2 bg-light border rounded" style="overflow-x: auto; font-size: 0.8rem; max-height: 300px;">${errorStack}</pre>
      </details>
    </div>
  `;

  feedbackSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
