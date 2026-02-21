import { expect, test } from "./fixtures.js";

test.describe("Phoneme Party - Pronunciation Practice", () => {
  test("should load without console errors", async ({ modelPage: page }) => {
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
  });
});
