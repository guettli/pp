import { test, expect } from "./fixtures.js";

test.describe("uiLang change", () => {
  test("changing uiLang updates t() template expressions", async ({ modelPage: page }) => {
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
