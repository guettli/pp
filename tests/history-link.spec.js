import { expect, test } from "./fixtures.js";

test.describe("History - phrase link", () => {
  test("clicking a phrase link in history loads that phrase in the main UI", async ({
    modelPage: page,
  }) => {
    const phraseName = "Der Hase lacht";

    // Set study lang and add a history entry for a real phrase
    await page.evaluate(async (phrase) => {
      const { setStudyLang } = await import("/phoneme-party/src/study-lang.ts");
      setStudyLang("de-DE");
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAll();
      await db.savePhraseResult(phrase, "de-DE", 85, "/dɛɐ̯ haːzə laxt/", "/dɛɐ̯ haːzə laxt/", 1000);
      const { refreshHistory } = await import("/phoneme-party/src/ui/history.ts");
      refreshHistory();
    }, phraseName);

    // Wait for the history item to appear
    await page.locator(".history-item").first().waitFor({ timeout: 5000 });

    // Click the phrase link inside the history item
    await page.locator(".history-item a").first().click();

    // The main phrase display should update to show the history entry's phrase
    await expect(page.locator("#phrase-text")).toHaveText(phraseName, { timeout: 3000 });
  });
});
