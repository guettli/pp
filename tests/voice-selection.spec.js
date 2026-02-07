// @ts-check
import { expect, test } from "@playwright/test";

// Skip these slow tests in CI or when running all tests
// Run explicitly with: pnpm test tests/voice-selection.spec.js
test.describe("Voice Selection @slow", () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for model loading
    test.setTimeout(180000); // 3 minutes for these tests

    console.log("📍 [BeforeEach] Navigating to page...");
    await page.goto("http://localhost:5173?lang=en");

    // Check if loading overlay exists
    const loadingOverlayCount = await page.locator("#loading-overlay").count();
    console.log(`📍 [BeforeEach] Loading overlay exists: ${loadingOverlayCount > 0}`);

    // Wait for model to finish loading (loading overlay disappears, main content shows)
    if (loadingOverlayCount > 0) {
      const isVisible = await page.locator("#loading-overlay").isVisible();
      console.log(`📍 [BeforeEach] Loading overlay visible: ${isVisible}`);

      if (isVisible) {
        console.log("📍 [BeforeEach] Waiting for loading overlay to disappear...");
        await page.waitForSelector("#loading-overlay", { state: "hidden", timeout: 120000 });
        console.log("📍 [BeforeEach] Loading overlay disappeared");
      }
    }

    // Wait for main content to become visible
    console.log("📍 [BeforeEach] Waiting for main-content to be visible...");
    await page.waitForSelector("#main-content", { state: "visible", timeout: 120000 });
    console.log("📍 [BeforeEach] Main content is visible");

    // Check button state before waiting
    const buttonVisible = await page.locator("#next-phrase-btn").isVisible();
    const buttonClasses = await page.locator("#next-phrase-btn").getAttribute("class");
    console.log(`📍 [BeforeEach] Button visible: ${buttonVisible}, classes: ${buttonClasses}`);

    // Now wait for app to be ready
    console.log("📍 [BeforeEach] Waiting for next-phrase-btn to be visible...");
    await page.waitForSelector("#next-phrase-btn", { state: "visible", timeout: 10000 });
    console.log("📍 [BeforeEach] Button is visible");

    // Click Next Phrase to get a phrase
    console.log("📍 [BeforeEach] Clicking next phrase button");
    await page.click("#next-phrase-btn");

    // Wait for phrase to appear
    console.log("📍 [BeforeEach] Waiting for phrase to appear");
    await page.waitForSelector("#phrase-text:not(:has-text('▶'))", { timeout: 5000 });
    console.log("📍 [BeforeEach] Setup complete");
  });

  test("should open voice selection dialog on long press", async ({ page }) => {
    // Make a recording to show the play target button
    const recordBtn = page.locator("#record-btn");
    await recordBtn.click({ delay: 1500 }); // Hold for 1.5s

    // Wait for feedback to appear
    await page.waitForSelector("#play-target-btn", { state: "visible", timeout: 10000 });

    // Long press on play target button (500ms)
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600); // Wait 600ms for long press
    await page.mouse.up();

    // Check if voice selection modal is visible
    const modal = page.locator("#voice-selection-modal");
    await expect(modal).toBeVisible({ timeout: 2000 });

    // Check if voice list has items
    const voiceList = page.locator("#voice-list .list-group-item");
    const count = await voiceList.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should show voice name, status badge, and checkbox", async ({ page }) => {
    // Make a recording to show the play target button
    const recordBtn = page.locator("#record-btn");
    await recordBtn.click({ delay: 1500 });

    await page.waitForSelector("#play-target-btn", { state: "visible", timeout: 10000 });

    // Long press to open dialog
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    await page.waitForSelector("#voice-selection-modal", { state: "visible" });

    // Check first voice item has all three columns
    const firstItem = page.locator("#voice-list .list-group-item").first();

    // Check for voice name
    const voiceName = firstItem.locator(".voice-name");
    await expect(voiceName).toBeVisible();
    const nameText = await voiceName.textContent();
    expect(nameText).toBeTruthy();
    expect(nameText.length).toBeGreaterThan(0);

    // Check for status badge (Offline or Online)
    const statusBadge = firstItem.locator(".badge");
    await expect(statusBadge).toBeVisible();
    const badgeText = await statusBadge.textContent();
    expect(["Offline", "Online"]).toContain(badgeText);

    // Check for checkbox
    const checkbox = firstItem.locator("input[type='checkbox']");
    await expect(checkbox).toBeVisible();
  });

  test("should save preferred voice when checkbox is checked", async ({ page }) => {
    // Make a recording
    const recordBtn = page.locator("#record-btn");
    await recordBtn.click({ delay: 1500 });

    await page.waitForSelector("#play-target-btn", { state: "visible", timeout: 10000 });

    // Long press to open dialog
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    await page.waitForSelector("#voice-selection-modal", { state: "visible" });

    // Click checkbox on first voice
    const firstCheckbox = page
      .locator("#voice-list .list-group-item input[type='checkbox']")
      .first();
    await firstCheckbox.click();

    // Check that it's now checked
    await expect(firstCheckbox).toBeChecked();

    // Close modal
    await page.locator("#voice-selection-modal .btn-close").click();
    await page.waitForTimeout(500);

    // Open dialog again and verify preference is saved
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    await page.waitForSelector("#voice-selection-modal", { state: "visible" });

    // First checkbox should still be checked
    const checkboxAfterReopen = page
      .locator("#voice-list .list-group-item input[type='checkbox']")
      .first();
    await expect(checkboxAfterReopen).toBeChecked();
  });

  test("should uncheck other checkboxes when selecting a voice", async ({ page }) => {
    // Make a recording
    const recordBtn = page.locator("#record-btn");
    await recordBtn.click({ delay: 1500 });

    await page.waitForSelector("#play-target-btn", { state: "visible", timeout: 10000 });

    // Long press to open dialog
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    await page.waitForSelector("#voice-selection-modal", { state: "visible" });

    const checkboxes = page.locator("#voice-list .list-group-item input[type='checkbox']");
    const count = await checkboxes.count();

    if (count > 1) {
      // Check first checkbox
      await checkboxes.nth(0).click();
      await expect(checkboxes.nth(0)).toBeChecked();

      // Check second checkbox
      await checkboxes.nth(1).click();
      await expect(checkboxes.nth(1)).toBeChecked();

      // First checkbox should now be unchecked
      await expect(checkboxes.nth(0)).not.toBeChecked();
    }
  });

  test("should play voice when clicking on voice name", async ({ page }) => {
    // Make a recording
    const recordBtn = page.locator("#record-btn");
    await recordBtn.click({ delay: 1500 });

    await page.waitForSelector("#play-target-btn", { state: "visible", timeout: 10000 });

    // Long press to open dialog
    await page.locator("#play-target-btn").hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    await page.waitForSelector("#voice-selection-modal", { state: "visible" });

    // Listen for console logs to verify speech is triggered
    const consoleLogs = [];
    page.on("console", (msg) => {
      if (msg.type() === "log") {
        consoleLogs.push(msg.text());
      }
    });

    // Click on first voice item (not checkbox)
    const firstItem = page.locator("#voice-list .list-group-item").first();
    await firstItem.click({ position: { x: 50, y: 10 } }); // Click on name area

    // Wait a bit for speech to start
    await page.waitForTimeout(500);

    // Check if speech-related console log appears
    const hasPlayingLog = consoleLogs.some(
      (log) => log.includes("Playing with voice:") || log.includes("Speaking phrase:"),
    );
    expect(hasPlayingLog).toBeTruthy();
  });

  test("should work on replay-phrase-btn as well", async ({ page }) => {
    // The replay-phrase-btn should also support long press for voice selection
    const replayBtn = page.locator("#replay-phrase-btn");

    // Wait for replay button to be visible
    await expect(replayBtn).toBeVisible();

    // Long press on replay button
    await replayBtn.hover();
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    // Check if voice selection modal is visible
    const modal = page.locator("#voice-selection-modal");
    await expect(modal).toBeVisible({ timeout: 2000 });
  });
});
