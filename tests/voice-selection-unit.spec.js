// @ts-check
import { expect, test } from "./fixtures.js";

test.describe("Voice Selection - Unit Tests", () => {
  test("play-target-btn is always present", async ({ modelPage: page }) => {
    const playBtn = await page.locator("#play-target-btn").count();
    expect(playBtn).toBe(1);

    // The voice-selection-modal was removed when switching to pre-generated audio
    const modalExists = await page.locator("#voice-selection-modal").count();
    expect(modalExists).toBe(0);
  });
});
