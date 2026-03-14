import { expect, test } from "./fixtures.js";

test.describe("Catch It! game", () => {
  test("start game, click one matching word, verify score increases", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("phoneme-party-study-lang", "de-DE");
      localStorage.setItem("phoneme-party-language", "en-GB");
    });

    await page.goto("/phoneme-party/catch-it/?ss=80&se=80&wps=5&wlt=2&n=3");

    // Wait for intro screen
    await page.locator("button.btn-success").waitFor({ state: "visible", timeout: 5000 });

    // Set game duration to 2 seconds via slider (override slider min for testing)
    await page.locator("#cfg-duration").evaluate((el) => {
      el.min = "2";
      el.value = "2";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Start the game
    await page.locator("button.btn-success").click();

    // Wait for a target phrase (matching word) to appear
    const targetPhrase = page.locator('.flying-phrase[data-is-target="true"]').first();
    await targetPhrase.waitFor({ state: "attached", timeout: 5000 });

    // Click the matching word
    await targetPhrase.dispatchEvent("pointerdown");

    // Score should have increased to 1
    await expect(page.locator(".hud-score")).toContainText("1", { timeout: 2000 });

    // Game ends after ~2 seconds — verify gameover screen
    await page
      .locator(".container:has(button.btn-success)")
      .waitFor({ state: "visible", timeout: 10000 });
  });
});
