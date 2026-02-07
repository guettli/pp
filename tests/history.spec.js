import { expect, test } from "@playwright/test";

test.describe("History - Database Functionality", () => {
  test("should test database operations without loading full app", async ({ page }) => {
    // Create a minimal test page that only tests the database
    await page.goto("/");

    // Wait for page to start loading
    await page.waitForLoadState("domcontentloaded");

    // Test database directly without waiting for model
    const dbTest = await page.evaluate(async () => {
      try {
        // Import database module
        const { db } = await import("/src/db.ts");

        // Clear existing data - this recreates the database and indexes
        await db.clearAll();

        // Test 1: Add a test result
        await db.savePhraseResult("TestPhrase", "de", 85, "/test/", "/target/", 1000);

        // Small delay to ensure write is complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Test 2: Try to retrieve history
        const history = await db.getHistory("de", 20, 0);

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
test.describe.skip("History - Infinite Scroll (Full App)", () => {
  test("should display history and support infinite scroll", async ({ page }) => {
    // Go to the app
    await page.goto("/");

    // Wait for app to load (model can take 60-90 seconds on first load)
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 120000 });

    // Inject test data into PouchDB
    await page.evaluate(async () => {
      // Import db module
      const { db } = await import("/src/db.ts");

      // Clear existing data
      await db.clearAll();

      // Add 50 test results for testing infinite scroll
      const phrase = "Test";
      const language = "en";

      for (let i = 0; i < 50; i++) {
        const timestamp = Date.now() - i * 60000; // Each result 1 minute apart
        const score = 50 + (i % 50); // Varying scores from 50-99

        await db.savePhraseResult(`${phrase}${i}`, language, score, "/test/", "/test/", 1000);
      }

      console.log("Added 50 test history items");
    });

    // Wait a moment for the history to render
    await page.waitForTimeout(500);

    // Check that history section is visible
    const historyContainer = page.locator("#history-container");
    await expect(historyContainer).toBeVisible();

    // Check that history list exists
    const historyList = page.locator("#history-list");
    await expect(historyList).toBeVisible();

    // Check that initial items are loaded (should be at least 20)
    const initialItems = await page.locator(".history-item").count();
    console.log(`Initial history items loaded: ${initialItems}`);
    expect(initialItems).toBeGreaterThanOrEqual(20);

    // Get the history container for scrolling
    const container = page.locator("#history-container");

    // Scroll down to trigger loading more items
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait for loading indicator to appear and disappear
    const loadingIndicator = page.locator("#history-loading");
    await expect(loadingIndicator).toBeVisible({ timeout: 2000 });
    await expect(loadingIndicator).toBeHidden({ timeout: 5000 });

    // Check that more items have been loaded
    const afterScrollItems = await page.locator(".history-item").count();
    console.log(`History items after scroll: ${afterScrollItems}`);
    expect(afterScrollItems).toBeGreaterThan(initialItems);

    // Verify that we have loaded more items (should be around 40 now)
    expect(afterScrollItems).toBeGreaterThanOrEqual(40);

    // Scroll to the bottom again
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait a moment for potential loading
    await page.waitForTimeout(1000);

    // Check final count (should have all 50 items)
    const finalItems = await page.locator(".history-item").count();
    console.log(`Final history items: ${finalItems}`);
    expect(finalItems).toBe(50);

    // Verify that each history item has the expected structure
    const firstItem = page.locator(".history-item").first();
    await expect(firstItem.locator("h6")).toBeVisible(); // Phrase text
    await expect(firstItem.locator(".badge")).toBeVisible(); // Score badge

    // Verify empty state is not shown
    const emptyState = page.locator("#history-empty");
    await expect(emptyState).toBeHidden();
  });

  test("should show empty state when no history", async ({ page }) => {
    // Go to the app
    await page.goto("/");

    // Wait for app to load (model can take 60-90 seconds on first load)
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 120000 });

    // Clear all data
    await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      await db.clearAll();
      console.log("Cleared all data");
    });

    // Refresh history
    await page.evaluate(async () => {
      const { refreshHistory } = await import("/src/ui/history.ts");
      refreshHistory();
    });

    // Wait a moment
    await page.waitForTimeout(500);

    // Check that empty state is visible
    const emptyState = page.locator("#history-empty");
    await expect(emptyState).toBeVisible();

    // Verify empty state message
    await expect(emptyState).toContainText("No training history");
  });

  test("should update history after new recording", async ({ page }) => {
    // Go to the app
    await page.goto("/");

    // Wait for app to load (model can take 60-90 seconds on first load)
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 120000 });

    // Clear existing data
    await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      await db.clearAll();
    });

    // Refresh history
    await page.evaluate(async () => {
      const { refreshHistory } = await import("/src/ui/history.ts");
      refreshHistory();
    });

    // Wait for empty state
    await page.waitForTimeout(500);
    await expect(page.locator("#history-empty")).toBeVisible();

    // Get initial history count
    const initialCount = await page.locator(".history-item").count();
    console.log(`Initial history count: ${initialCount}`);

    // Add a new result directly via DB
    await page.evaluate(async () => {
      const { db } = await import("/src/db.ts");
      await db.savePhraseResult("NewPhrase", "en", 85, "/test/", "/test/", 1000);

      // Refresh history
      const { refreshHistory } = await import("/src/ui/history.ts");
      refreshHistory();
    });

    // Wait for history to update
    await page.waitForTimeout(500);

    // Check that empty state is hidden
    await expect(page.locator("#history-empty")).toBeHidden();

    // Check that a new item appears
    const newCount = await page.locator(".history-item").count();
    console.log(`New history count: ${newCount}`);
    expect(newCount).toBe(initialCount + 1);

    // Verify the new item contains the phrase
    const firstItem = page.locator(".history-item").first();
    await expect(firstItem).toContainText("NewPhrase");
  });
});
