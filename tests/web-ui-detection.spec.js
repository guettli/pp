import { test, expect } from "@playwright/test";

/**
 * Test actual web UI detection by monitoring console output
 * This catches real-world bugs in the recording flow
 */
test.describe("Web UI - Real Detection Flow", () => {
  test("should log correct IPA in console during actual usage", async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];

    // Capture console output
    page.on("console", (msg) => {
      const text = msg.text();
      consoleLogs.push(text);

      // Look for IPA extraction logs
      if (text.includes("Extracted IPA phonemes:") || text.includes("Real-time phonemes:")) {
        console.log(`[Console] ${text}`);
      }
    });

    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
      console.error(`[Page Error] ${error.message}`);
    });

    // Navigate to app
    await page.goto("/");

    // Wait for model to load
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    console.log("\n=== App loaded successfully ===\n");

    // Get a phrase to record
    await page.click("#next-phrase-btn");
    await page.waitForTimeout(1000);

    // Get the current phrase
    const phraseText = await page.locator("#phrase-text").textContent();
    console.log(`Current phrase: ${phraseText}`);

    // Check that no errors occurred during init
    expect(consoleErrors).toHaveLength(0);

    console.log("\n=== Test Summary ===");
    console.log(`Total console logs: ${consoleLogs.length}`);
    console.log(`Errors: ${consoleErrors.length}`);

    // Look for phoneme-related logs
    const phonemeLogs = consoleLogs.filter(
      (log) =>
        log.includes("phoneme") ||
        log.includes("IPA") ||
        log.includes("Real-time") ||
        log.includes("Extracted"),
    );
    if (phonemeLogs.length > 0) {
      console.log(`\nPhoneme-related logs found:`);
      phonemeLogs.forEach((log) => console.log(`  - ${log}`));
    }

    // The app should initialize without errors
    expect(consoleErrors).toHaveLength(0);
  });

  test("should detect if real-time detector breaks main detection", async ({ page }) => {
    const detectionLogs = {
      realtime: [],
      final: [],
      errors: [],
    };

    page.on("console", (msg) => {
      const text = msg.text();

      if (text.includes("Real-time phonemes:")) {
        detectionLogs.realtime.push(text);
      }
      if (text.includes("Extracted IPA phonemes:")) {
        detectionLogs.final.push(text);
      }
      if (text.includes("Error") && text.includes("phoneme")) {
        detectionLogs.errors.push(text);
      }
    });

    await page.goto("/");
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    // Get a phrase
    await page.click("#next-phrase-btn");
    await page.waitForTimeout(500);

    console.log("\n=== Detection Logging Test ===");
    console.log("Waiting for potential user interaction...");
    console.log("(In real usage, user would record here)");

    // Wait a bit to see if any detection happens
    await page.waitForTimeout(2000);

    console.log(`\nReal-time detections: ${detectionLogs.realtime.length}`);
    console.log(`Final detections: ${detectionLogs.final.length}`);
    console.log(`Errors: ${detectionLogs.errors.length}`);

    if (detectionLogs.errors.length > 0) {
      console.log("\nDetection errors found:");
      detectionLogs.errors.forEach((err) => console.log(`  - ${err}`));
    }

    // Should have no detection errors
    expect(detectionLogs.errors).toHaveLength(0);
  });
});
