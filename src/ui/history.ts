/**
 * History UI module - displays training history with infinite scroll
 */

import { db, type PhraseResultDoc } from "../db.js";
import { getLanguage, t } from "../i18n.js";

const ITEMS_PER_PAGE = 20;
let currentPage = 0;
let isLoading = false;
let hasMore = true;
let scrollContainer: HTMLElement | null = null;

/**
 * Initialize history view
 */
export function initHistory() {
  scrollContainer = document.getElementById("history-container");
  if (!scrollContainer) {
    console.error("History container not found");
    return;
  }

  // Set up infinite scroll
  scrollContainer.addEventListener("scroll", handleScroll);

  // Load initial history
  void loadHistory(true);
}

/**
 * Handle scroll event for infinite scroll
 */
function handleScroll() {
  if (!scrollContainer || isLoading || !hasMore) {
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
  const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

  // Load more when scrolled 80% down
  if (scrollPercentage > 0.8) {
    void loadHistory(false);
  }
}

/**
 * Load history items from database
 */
async function loadHistory(reset: boolean) {
  if (isLoading) return;

  if (reset) {
    currentPage = 0;
    hasMore = true;
    const historyList = document.getElementById("history-list");
    if (historyList) {
      historyList.innerHTML = "";
    }
  }

  isLoading = true;
  showLoadingIndicator(true);

  try {
    const language = getLanguage();
    const skip = currentPage * ITEMS_PER_PAGE;

    const result = await db.getHistory(language, ITEMS_PER_PAGE, skip);

    if (result.docs.length === 0 && currentPage === 0) {
      showEmptyState(true);
      showLoadingIndicator(false);
      return;
    }

    showEmptyState(false);
    renderHistoryItems(result.docs);

    hasMore = result.hasMore;
    currentPage++;

    showLoadingIndicator(false);
  } catch (error) {
    console.error("Error loading history:", error);
    // Show empty state on error to prevent UI from being stuck
    showEmptyState(true);
    showLoadingIndicator(false);
  } finally {
    isLoading = false;
  }
}

/**
 * Render history items to the DOM
 */
function renderHistoryItems(items: PhraseResultDoc[]) {
  const historyList = document.getElementById("history-list");
  if (!historyList) return;

  items.forEach((item) => {
    const itemElement = createHistoryItem(item);
    historyList.appendChild(itemElement);
  });
}

/**
 * Create a single history item element
 */
function createHistoryItem(item: PhraseResultDoc): HTMLElement {
  const div = document.createElement("div");
  div.className = "history-item border-bottom py-3";

  const timeAgo = formatTimeAgo(item.timestamp);
  const scorePercent = Math.round(item.score);
  const scoreClass = getScoreClass(scorePercent);

  div.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div class="flex-grow-1">
        <h6 class="mb-1">${escapeHtml(item.phrase)}</h6>
        <div class="small text-muted">
          <span>${item.targetIPA}</span>
          <span class="mx-2">→</span>
          <span>${item.actualIPA}</span>
        </div>
        <div class="small text-muted mt-1">${timeAgo}</div>
      </div>
      <div class="text-end ms-3">
        <div class="badge ${scoreClass} fs-6">${scorePercent}%</div>
      </div>
    </div>
  `;

  return div;
}

/**
 * Get Bootstrap badge class based on score
 */
function getScoreClass(score: number): string {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-primary";
  if (score >= 40) return "bg-warning";
  return "bg-danger";
}

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return t("history.time", { time: `${days}d` });
  }
  if (hours > 0) {
    return t("history.time", { time: `${hours}h` });
  }
  if (minutes > 0) {
    return t("history.time", { time: `${minutes}m` });
  }
  return t("history.time", { time: `${seconds}s` });
}

/**
 * Show/hide loading indicator
 */
function showLoadingIndicator(show: boolean) {
  const loadingEl = document.getElementById("history-loading");
  if (loadingEl) {
    loadingEl.style.display = show ? "block" : "none";
  }
}

/**
 * Show/hide empty state
 */
function showEmptyState(show: boolean) {
  const emptyEl = document.getElementById("history-empty");
  if (emptyEl) {
    emptyEl.style.display = show ? "block" : "none";
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Refresh history (call after language change or new result)
 */
export function refreshHistory() {
  void loadHistory(true);
}
