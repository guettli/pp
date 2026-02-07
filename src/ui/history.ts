/**
 * History UI module - displays training history with infinite scroll
 */

import { db, type PhraseResultDoc } from "../db.js";
import { getLanguage, t } from "../i18n.js";
import { findPhraseByName } from "../utils/random.js";
import type { SupportedLanguage } from "../types.js";

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
    // Load and display user stats on initial load
    void loadUserStats();
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
 * Load and display user statistics
 */
async function loadUserStats() {
  try {
    const language = getLanguage();
    const stats = await db.getUserStats(language);

    // Update or create stats panel
    let statsPanel = document.getElementById("user-stats-panel");
    if (!statsPanel) {
      statsPanel = document.createElement("div");
      statsPanel.id = "user-stats-panel";
      statsPanel.className = "card mb-3 bg-light";

      // Insert at the top of history container, before history-list
      const historyContainer = document.getElementById("history-container");
      const historyList = document.getElementById("history-list");
      if (historyContainer && historyList) {
        historyContainer.insertBefore(statsPanel, historyList);
      }
    }

    // Build stats HTML
    const levelBadgeClass =
      stats.userLevel >= 500 ? "bg-danger" : stats.userLevel >= 300 ? "bg-warning" : "bg-success";

    statsPanel.innerHTML = `
      <div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-1">Your Level</h6>
            <div class="small text-muted">Based on recent performance</div>
          </div>
          <div class="text-end">
            <div class="badge ${levelBadgeClass} fs-4 px-3 py-2">${stats.userLevel}</div>
            <div class="small text-muted mt-1">${stats.masteredCount}/${stats.totalInWindow} mastered (≥95%)</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error loading user stats:", error);
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

  // Get phrase level from phrase data
  const phrase = findPhraseByName(item.phrase, item.language as SupportedLanguage);
  const phraseLevel = phrase?.level;
  const levelBadge = phraseLevel
    ? `<span class="badge bg-secondary ms-2" title="Phrase level">L${phraseLevel}</span>`
    : "";

  div.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div class="flex-grow-1">
        <h6 class="mb-1">${escapeHtml(item.phrase)}${levelBadge}</h6>
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
