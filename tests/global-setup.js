// @ts-check
import { chromium } from "@playwright/test";
import path from "path";
import os from "os";

/**
 * Global setup script for Playwright tests
 * This runs once before all tests to pre-download the ML model
 */
export default async function globalSetup() {
  console.log("🚀 Global Setup: Pre-loading ML model...");

  // Use persistent context to cache the model
  const userDataDir = path.join(os.tmpdir(), "playwright-phoneme-party-cache");

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Navigate to the app
    console.log("📍 Navigating to app...");
    await page.goto("http://localhost:5173?lang=en");

    // Wait for loading overlay to appear
    await page.waitForSelector("#loading-overlay", { state: "visible", timeout: 10000 });
    console.log("⏳ Loading overlay visible, waiting for model to download...");

    // Wait for loading overlay to disappear (model loaded)
    await page.waitForSelector("#loading-overlay", { state: "hidden", timeout: 180000 }); // 3 min
    console.log("✅ Model loaded and cached!");

    // Wait for main content to be visible
    await page.waitForSelector("#main-content", { state: "visible", timeout: 10000 });
    console.log("✅ App ready!");
  } catch (error) {
    console.error("❌ Global setup failed:", error);
    // Don't throw - let tests run even if setup fails
  } finally {
    await browser.close();
    console.log("🏁 Global setup complete");
  }
}
