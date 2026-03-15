import { test } from "@playwright/test";
import { captureConsoleErrors, assertNoConsoleErrors } from "./helpers/console-errors.js";

test.describe("PouchDB Loading Bug - Production Build", () => {
  test("should not have any console errors in production", async ({ page }) => {
    const errors = captureConsoleErrors(page);

    // Pre-set studyLang to prevent redirect to /settings/ (which would cause "History container not found")
    await page.addInitScript(() => {
      localStorage.setItem("phoneme-party-study-lang", "de-DE");
    });

    // Navigate to the production build served from dist
    await page.goto("/");

    // Wait a bit for initialization
    await page.waitForTimeout(2000);

    assertNoConsoleErrors(errors);
  });
});
