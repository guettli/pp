import { expect, test } from "./fixtures.js";

// Helper: read the current UI console text (expands the panel if needed)
async function getUiConsoleText(page) {
  const pre = page.locator("#app pre[style*='max-height']");
  if (!(await pre.isVisible())) {
    await page
      .locator("#app .card-header")
      .filter({ hasText: /Console/i })
      .click();
    await pre.waitFor({ state: "visible", timeout: 2000 });
  }
  return pre.textContent();
}

test.describe("UI Console - uncaught exceptions", () => {
  test("unhandled promise rejection appears in UI console", async ({ modelPage: page }) => {
    await page.evaluate(() => {
      Promise.reject(new Error("test-unhandled-rejection-sentinel"));
    });

    await page.waitForTimeout(300);

    const consoleText = await getUiConsoleText(page);
    expect(consoleText).toContain("test-unhandled-rejection-sentinel");
  });

  test("window.onerror appears in UI console", async ({ modelPage: page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "test-window-onerror-sentinel",
          error: new Error("test-window-onerror-sentinel"),
        }),
      );
    });

    await page.waitForTimeout(300);

    const consoleText = await getUiConsoleText(page);
    expect(consoleText).toContain("test-window-onerror-sentinel");
  });
});
