import { expect, test } from "./fixtures.js";

test.describe("User Stats - getUserStats", () => {
  test("should return the NEWEST 30 results, not the oldest 30", async ({ modelPage: page }) => {
    const result = await page.evaluate(async () => {
      const { db } = await import("/phoneme-party/src/db.ts");
      await db.clearAll();

      // Save 35 results:
      // - First 30 (oldest) have score < 95 (not mastered)
      // - Last 5 (newest) have score = 100 (mastered)
      for (let i = 0; i < 30; i++) {
        await db.savePhraseResult(`OldPhrase${i}`, "de-DE", 50, "/test/", "/target/", 1000);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      for (let i = 0; i < 5; i++) {
        await db.savePhraseResult(`NewPhrase${i}`, "de-DE", 100, "/test/", "/target/", 1000);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const stats = await db.getUserStats("de-DE");
      return {
        masteredCount: stats.masteredCount,
        totalInWindow: stats.totalInWindow,
      };
    });

    // getUserStats should look at the last 30 results.
    // The last 30 results are: 25 OldPhrases (score 50) + 5 NewPhrases (score 100).
    // So masteredCount should be 5.
    // If it returns the OLDEST 30 instead (all OldPhrases, score 50), masteredCount would be 0.
    expect(result.totalInWindow).toBe(30);
    expect(result.masteredCount).toBe(5);
  });
});
