import { expect, test } from "../fixtures.js";

/**
 * Navigation tests: 2×3 = 6 links.
 * 3 pages (Speak It, Catch It, Settings) × 2 outgoing nav links each.
 */
test.describe("Navigation - switching between all pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("phoneme-party-study-lang", "de-DE");
      localStorage.setItem("phoneme-party-language", "en-GB");
    });
  });

  async function clickNavTo(page, dest) {
    await page.locator("nav.app-nav").waitFor({ state: "visible", timeout: 10000 });
    if (dest === "speak-it") {
      await page.locator("nav.app-nav a", { hasText: "Speak It" }).click();
    } else if (dest === "catch-it") {
      await page.locator("nav.app-nav a", { hasText: "Catch It" }).click();
    } else {
      await page.locator('nav.app-nav a[href*="settings"]').click();
    }
  }

  // --- From Speak It ---
  test("Speak It → Catch It", async ({ page }) => {
    await page.goto("/");
    await clickNavTo(page, "catch-it");
    await expect(page).toHaveURL(/catch-it/, { timeout: 5000 });
  });

  test("Speak It → Settings", async ({ page }) => {
    await page.goto("/");
    await clickNavTo(page, "settings");
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
  });

  // --- From Catch It ---
  test("Catch It → Speak It", async ({ page }) => {
    await page.goto("/phoneme-party/catch-it/");
    await clickNavTo(page, "speak-it");
    await expect(page).not.toHaveURL(/catch-it/, { timeout: 5000 });
    await expect(page).not.toHaveURL(/settings/, { timeout: 5000 });
  });

  test("Catch It → Settings", async ({ page }) => {
    await page.goto("/phoneme-party/catch-it/");
    await clickNavTo(page, "settings");
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
  });

  // --- From Settings ---
  test("Settings → Speak It", async ({ page }) => {
    await page.goto("/phoneme-party/settings/");
    await clickNavTo(page, "speak-it");
    await expect(page).not.toHaveURL(/settings/, { timeout: 5000 });
    await expect(page).not.toHaveURL(/catch-it/, { timeout: 5000 });
  });

  test("Settings → Catch It", async ({ page }) => {
    await page.goto("/phoneme-party/settings/");
    await clickNavTo(page, "catch-it");
    await expect(page).toHaveURL(/catch-it/, { timeout: 5000 });
  });
});
