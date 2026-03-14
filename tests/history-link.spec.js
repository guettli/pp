import { expect, test } from "./fixtures.js";

test.describe("History - phrase link", () => {
  test("clicking a phrase link in history loads that phrase in the main UI", async ({
    modelPage: page,
  }) => {
    const phraseName = "Der Hase lacht";

    // Clear DB and save entry BEFORE changing study lang.
    // setStudyLang() triggers onStudyLangChange → refreshHistory(); saving data first
    // ensures refreshHistory sees the item. Explicit refreshHistory() handles the case
    // where studyLang was already "de-DE" (setStudyLang is a no-op then).
    await page.evaluate(async (phrase) => {
      const { getStudyLang } = await import("/phoneme-party/src/study-lang.ts");
      const studyLang = getStudyLang() ?? "de-DE";
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAllDocs();
      await db.savePhraseResult(
        phrase,
        studyLang,
        85,
        "/dɛɐ̯ haːzə laxt/",
        "/dɛɐ̯ haːzə laxt/",
        1000,
      );
      await window.__phonemePartyRefreshHistoryAsync();
    }, phraseName);

    // Wait for the history item to appear
    await page.locator(".history-item").first().waitFor({ timeout: 5000 });

    // Click the phrase link inside the history item
    await page.locator(".history-item a").first().click();

    // The main phrase display should update to show the history entry's phrase
    await expect(page.locator("#phrase-text")).toHaveText(phraseName, { timeout: 3000 });
  });
});
