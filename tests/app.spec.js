import { expect, test } from "./fixtures.js";

test.describe("Phoneme Party - Pronunciation Practice", () => {
  test(
    "should load without console errors and show uiLang phrase",
    { timeout: 300000 },
    async ({ modelPage: page }) => {
      const errors = [];

      // Capture errors that occur after the model has loaded
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(msg.text());
        }
      });

      page.on("pageerror", (error) => {
        errors.push(`${error.message}\n${error.stack}`);
      });

      // Model is already loaded via the shared fixture — just verify the loaded state is error-free
      await page.locator("#main-content").waitFor({ state: "visible", timeout: 10000 });

      if (errors.length > 0) {
        console.log("\n=== Captured Errors ===");
        errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
        console.log("=== End Errors ===\n");
      }

      expect(errors, `Found ${errors.length} errors - see console output above`).toHaveLength(0);

      // studyLang (de-DE) and uiLang (en-GB) are pre-set via localStorage in the fixture
      // Click "Press to Play" to load the first phrase (pre-set studyLang doesn't auto-trigger it)
      await page
        .locator(
          "button:has-text('Press to Play'), button:has-text('Zum Spielen drücken'), button:has-text('Appuyez pour jouer')",
        )
        .first()
        .click();

      // Wait for a study phrase to appear
      await page.locator("#phrase-text").waitFor({ state: "visible", timeout: 5000 });
      const studyPhrase = await page.locator("#phrase-text").innerText();

      // The uiLang (en-GB) translation should also be visible, and differ from the German phrase
      await page
        .locator('[data-testid="ui-lang-phrase"]')
        .waitFor({ state: "visible", timeout: 5000 });
      const uiLangPhrase = await page.locator('[data-testid="ui-lang-phrase"]').innerText();

      expect(uiLangPhrase.length).toBeGreaterThan(0);
      expect(uiLangPhrase).not.toBe(studyPhrase);
    },
  );
});
