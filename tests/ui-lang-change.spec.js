import { test, expect } from "./fixtures.js";

test.describe("uiLang change", () => {
  test("changing uiLang updates t() template expressions", async ({ page }) => {
    // Use a fresh page (not the shared modelPage) since we navigate to /settings/
    await page.addInitScript(() => {
      localStorage.setItem("phoneme-party-study-lang", "de-DE");
      localStorage.setItem("phoneme-party-language", "en-GB");
    });
    await page.goto("/phoneme-party/settings/");
    await page.locator("#ui-lang-select").waitFor({ state: "visible", timeout: 10000 });

    const studyLangLabel = page.locator('label[for="study-lang-select"]');

    // Switch to English
    await page.locator("#ui-lang-select").selectOption("en-GB");
    await expect(studyLangLabel).toHaveText("Study language:");

    // Switch to German — label text must update
    await page.locator("#ui-lang-select").selectOption("de-DE");
    await expect(studyLangLabel).toHaveText("Lernsprache:");

    // Switch to French — label text must update
    await page.locator("#ui-lang-select").selectOption("fr-FR");
    await expect(studyLangLabel).toHaveText("Langue étudiée :");
  });
});
