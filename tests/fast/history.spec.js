import { expect, test } from "../fixtures.js";

test.describe("History - Database Functionality", () => {
  test("should verify history is sorted with newest first", async ({ modelPage: page }) => {
    const sortTest = await page.evaluate(async () => {
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAllDocs();

      // Add 5 items with specific timestamps
      const now = Date.now();
      await db.savePhraseResult("Oldest", "de-DE", 85, "/test/", "/target/", 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await db.savePhraseResult("Old", "de-DE", 85, "/test/", "/target/", 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await db.savePhraseResult("Middle", "de-DE", 85, "/test/", "/target/", 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await db.savePhraseResult("New", "de-DE", 85, "/test/", "/target/", 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await db.savePhraseResult("Newest", "de-DE", 85, "/test/", "/target/", 1000);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const history = await db.getHistory("de-DE", 20, 0);

      return {
        phrases: history.docs.map((d) => ({ phrase: d.phrase, timestamp: d.timestamp })),
        firstPhrase: history.docs[0].phrase,
        lastPhrase: history.docs[history.docs.length - 1].phrase,
      };
    });

    // First item should be "Newest", last should be "Oldest"
    expect(sortTest.firstPhrase).toBe("Newest");
    expect(sortTest.lastPhrase).toBe("Oldest");

    // Verify timestamps are in descending order
    for (let i = 0; i < sortTest.phrases.length - 1; i++) {
      expect(sortTest.phrases[i].timestamp).toBeGreaterThanOrEqual(
        sortTest.phrases[i + 1].timestamp,
      );
    }
  });

  test("should test database operations without loading full app", async ({ modelPage: page }) => {
    // Test database directly
    const dbTest = await page.evaluate(async () => {
      try {
        // Import database module
        const { db } = await import("/phoneme-party/src/db.ts");

        // Clear existing data - this recreates the database and indexes
        await db.clearAllDocs();

        // Test 1: Add a test result
        await db.savePhraseResult("TestPhrase", "de-DE", 85, "/test/", "/target/", 1000);

        // Small delay to ensure write is complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Test 2: Try to retrieve history
        const history = await db.getHistory("de-DE", 20, 0);

        return {
          success: true,
          historyCount: history.docs.length,
          totalCount: history.totalCount,
          hasMore: history.hasMore,
          firstItem: history.docs[0],
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack,
        };
      }
    });

    // Verify test results
    if (!dbTest.success) {
      console.error("Database test failed:", dbTest.error);
      console.error("Stack:", dbTest.stack);
      throw new Error(`Database test failed: ${dbTest.error}\n${dbTest.stack}`);
    }
    expect(dbTest.success).toBe(true);
    expect(dbTest.historyCount).toBe(1);
    expect(dbTest.totalCount).toBe(1);
    expect(dbTest.hasMore).toBe(false);
    expect(dbTest.firstItem.phrase).toBe("TestPhrase");
    expect(dbTest.firstItem.score).toBe(85);
  });
});

// Full integration tests - may be slow due to model loading
test.describe("History - Infinite Scroll (Full App)", () => {
  test("should display history and support infinite scroll", async ({ modelPage: page }) => {
    // Use the current study lang so we don't call setStudyLang() — that triggers the
    // app's onStudyLangChange listener (nextPhrase → saveSkippedPhrase → refreshHistory)
    // causing a second concurrent history load and double-rendering.
    await page.evaluate(async () => {
      const { getStudyLang } = await import("/phoneme-party/src/study-lang.ts");
      const studyLang = getStudyLang() ?? "de-DE";
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAllDocs();

      for (let i = 0; i < 50; i++) {
        await db.savePhraseResult(`Test${i}`, studyLang, 50 + (i % 50), "/test/", "/test/", 1000);
      }

      await window.__phonemePartyRefreshHistoryAsync();
    });

    // Items should already be in the DOM since we awaited refreshHistoryAsync
    await page.locator(".history-item").first().waitFor({ timeout: 3000 });

    // Check that history section is visible
    const historyContainer = page.locator("#history-container");
    await expect(historyContainer).toBeVisible();

    // Check that initial items are loaded (should be at least 20)
    const initialItems = await page.locator(".history-item").count();
    expect(initialItems).toBeGreaterThanOrEqual(20);

    // Wait for history to be fully settled (currentPage=1, not loading) before
    // triggering scroll. Uses window.__phonemePartyHistoryState exposed by initHistory()
    // in history.ts, which always reflects the module instance that owns the scroll handler.
    await page.waitForFunction(
      () => {
        const s = window.__phonemePartyHistoryState;
        return s?.currentPage === 1 && !s?.isLoading;
      },
      null,
      { timeout: 10000 },
    );

    // Get the history container for scrolling
    const container = page.locator("#history-container");

    // Scroll down to trigger loading more items (dispatch scroll event explicitly for reliability)
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });

    // Wait for more items to load (infinite scroll loaded next page)
    await page.waitForFunction(
      (count) => document.querySelectorAll(".history-item").length > count,
      initialItems,
      { timeout: 5000 },
    );

    // Check that more items have been loaded
    const afterScrollItems = await page.locator(".history-item").count();
    expect(afterScrollItems).toBeGreaterThan(initialItems);

    // Verify that we have loaded more items (should be around 40 now)
    expect(afterScrollItems).toBeGreaterThanOrEqual(40);

    // Wait for history to settle at page 2 before triggering scroll 2
    await page.waitForFunction(
      () => {
        const s = window.__phonemePartyHistoryState;
        return s?.currentPage === 2 && !s?.isLoading;
      },
      null,
      { timeout: 10000 },
    );

    // Scroll to the bottom again to load the last page
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });

    // Wait for all 50 items to load
    await page.waitForFunction(() => document.querySelectorAll(".history-item").length >= 50, {
      timeout: 5000,
    });

    // Check final count (should have all 50 items)
    const finalItems = await page.locator(".history-item").count();
    expect(finalItems).toBe(50);

    // Verify that each history item has the expected structure
    const firstItem = page.locator(".history-item").first();
    await expect(firstItem.locator("h6")).toBeVisible(); // Phrase text
    await expect(firstItem.locator(".badge")).toBeVisible(); // Score badge

    // Verify empty state is not shown
    const emptyState = page.locator("#history-empty");
    await expect(emptyState).toBeHidden();
  });

  test("should show empty state when no history", async ({ modelPage: page }) => {
    // Clear all data
    await page.evaluate(async () => {
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAllDocs();
      console.log("Cleared all data");
    });

    // Refresh history and await completion
    await page.evaluate(async () => {
      await window.__phonemePartyRefreshHistoryAsync();
    });

    // Check that empty state is visible
    const emptyState = page.locator("#history-empty");
    await expect(emptyState).toBeVisible();

    // Verify empty state message
    await expect(emptyState).toContainText("No training history");
  });

  test("should update history after new recording", async ({ modelPage: page }) => {
    // Avoid setStudyLang() — it triggers onStudyLangChange → nextPhrase → refreshHistory
    // causing a second concurrent load. Use the current study lang instead.
    await page.evaluate(async () => {
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAllDocs();
      await window.__phonemePartyRefreshHistoryAsync();
    });

    await expect(page.locator("#history-empty")).toBeVisible({ timeout: 3000 });

    // Get initial history count
    const initialCount = await page.locator(".history-item").count();
    console.log(`Initial history count: ${initialCount}`);

    // Add a new result and await the history reload
    await page.evaluate(async () => {
      const { getStudyLang } = await import("/phoneme-party/src/study-lang.ts");
      const studyLang = getStudyLang() ?? "de-DE";
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.savePhraseResult("NewPhrase", studyLang, 85, "/test/", "/test/", 1000);
      await window.__phonemePartyRefreshHistoryAsync();
    });

    await expect(page.locator("#history-empty")).toBeHidden({ timeout: 3000 });

    // Check that a new item appears
    const newCount = await page.locator(".history-item").count();
    console.log(`New history count: ${newCount}`);
    expect(newCount).toBe(initialCount + 1);

    // Verify the new item contains the phrase
    const firstItem = page.locator(".history-item").first();
    await expect(firstItem).toContainText("NewPhrase");
  });
});
