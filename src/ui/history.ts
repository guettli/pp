/**
 * History UI module - displays training history with infinite scroll
 */

import { db, type PhraseResultDoc } from "../db.js";
import { t } from "../i18n.js";
import { getStudyLang } from "../study-lang.js";
import { findPhraseByName } from "../utils/random.js";
import escapeHtml from "escape-html";

const ITEMS_PER_PAGE = 20;
let currentPage = 0;
let isLoading = false;
let hasMore = true;
let scrollContainer: HTMLElement | null = null;

// Key used to track the active scroll handler across HMR re-inits.
// Vite HMR creates a new module instance with fresh state, so we use window
// to remove the old handler before registering the new one.
const SCROLL_HANDLER_KEY = "__phonemePartyScrollHandler";

/**
 * Initialize history view
 */
export function initHistory() {
  scrollContainer = document.getElementById("history-container");
  if (!scrollContainer) {
    console.error("History container not found");
    return;
  }

  // Remove any previously registered scroll handler (handles HMR re-inits where
  // the module is re-evaluated with fresh state but the DOM element persists).
  const w = window as unknown as Window & Record<string, unknown>;
  const prevHandler = w[SCROLL_HANDLER_KEY] as EventListener | undefined;
  if (prevHandler) {
    scrollContainer.removeEventListener("scroll", prevHandler);
  }
  w[SCROLL_HANDLER_KEY] = handleScroll as EventListener;

  // Expose live state and refreshHistoryAsync on window from THIS module instance.
  // Tests must call window.__phonemePartyRefreshHistoryAsync() instead of importing
  // history.ts directly, because dynamic import() may return a different module
  // instance (different URL) than the one owning the scroll handler.
  w.__phonemePartyHistoryState = {
    get currentPage() {
      return currentPage;
    },
    get isLoading() {
      return isLoading;
    },
    get hasMore() {
      return hasMore;
    },
  };
  w.__phonemePartyRefreshHistoryAsync = refreshHistoryAsync;

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
    const studyLang = getStudyLang();
    if (!studyLang) {
      showEmptyState(true);
      showLoadingIndicator(false);
      return;
    }
    const skip = currentPage * ITEMS_PER_PAGE;

    const result = await db.getHistory(studyLang, ITEMS_PER_PAGE, skip);

    // Debug: Verify sort order (newest should be first)
    if (result.docs.length > 0 && currentPage === 0) {
      console.log(
        "[History] First item:",
        new Date(result.docs[0].timestamp).toISOString(),
        result.docs[0].phrase,
      );
      if (result.docs.length > 1) {
        console.log(
          "[History] Last item:",
          new Date(result.docs[result.docs.length - 1].timestamp).toISOString(),
          result.docs[result.docs.length - 1].phrase,
        );
      }
    }

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
    const studyLang = getStudyLang();
    if (!studyLang) return;
    const stats = await db.getUserStats(studyLang);

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
            <h6 class="mb-1">${t("level.title")}</h6>
            <div class="small text-muted">${t("level.stats_subtitle")}</div>
          </div>
          <div class="text-end">
            <div class="badge ${levelBadgeClass} fs-4 px-3 py-2">${stats.userLevel}</div>
            <div class="small text-muted mt-1">${t("level.mastered", { mastered: stats.masteredCount, total: stats.totalInWindow })}</div>
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

  // Get phrase level from phrase data
  const phrase = findPhraseByName(item.phrase, item.language);
  const phraseLevel = phrase?.level;
  const levelBadge = phraseLevel
    ? `<span class="badge bg-secondary ms-2" title="Phrase level">L${phraseLevel}</span>`
    : "";

  const scoreBadge = item.skipped
    ? `<div class="badge bg-secondary fs-6">${t("history.skipped")}</div>`
    : `<div class="badge ${getScoreClass(Math.round(item.score))} fs-6">${Math.round(item.score)}%</div>`;

  const ipaLine = item.skipped
    ? ""
    : `<div class="small text-muted">
          <span>${item.targetIPA}</span>
          <span class="mx-2">→</span>
          <span>${item.actualIPA}</span>
        </div>`;

  div.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div class="flex-grow-1">
        <h6 class="mb-1">
          <a href="#" class="text-decoration-none text-reset history-phrase-link">${escapeHtml(item.phrase)}</a>${levelBadge}
        </h6>
        ${ipaLine}
        <div class="small text-muted mt-1">${timeAgo}</div>
      </div>
      <div class="text-end ms-3">
        ${scoreBadge}
      </div>
    </div>
  `;

  const link = div.querySelector<HTMLAnchorElement>(".history-phrase-link");
  link?.addEventListener("click", (e) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent("load-phrase", { detail: { lang: item.language, phrase: item.phrase } }),
    );
  });

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

// Note: HTML escaping uses the standard 'escape-html' package

/**
 * Refresh history (call after language change or new result)
 */
export function refreshHistory() {
  void loadHistory(true);
}

/**
 * Async version of refreshHistory for use in tests.
 * Waits for any in-flight load to finish, then performs a fresh load and
 * returns once the history list has been updated.
 */
export async function refreshHistoryAsync(): Promise<void> {
  // If a load is already in progress (e.g. triggered by an onStudyLangChange
  // listener), wait for it to settle before starting a new one.
  while (isLoading) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await loadHistory(true);
  // Wait for any concurrently-triggered load (e.g. from the app's event
  // listeners that fire during the DB operations above) to also finish.
  while (isLoading) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * For testing: returns the current page index so tests can verify pagination
 * state before triggering scroll events.
 */
export function getHistoryCurrentPage(): number {
  return currentPage;
}

/**
 * For testing: returns whether a history load is currently in progress.
 */
export function getHistoryIsLoading(): boolean {
  return isLoading;
}
