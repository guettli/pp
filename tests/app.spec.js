import { expect, test } from "@playwright/test";

test.describe("Phoneme Party - Pronunciation Practice", () => {
  test("should load without console errors", async ({ page }) => {
    const errors = [];

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Capture page errors (these include SyntaxError, etc.)
    page.on("pageerror", (error) => {
      errors.push(`${error.message}\n${error.stack}`);
    });

    await page.goto("/");

    // Wait for app to finish loading (model served locally in DEV mode)
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 120000 });

    // This test will fail if there are errors
    if (errors.length > 0) {
      console.log("\n=== Captured Errors ===");
      errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
      console.log("=== End Errors ===\n");
    }

    expect(errors, `Found ${errors.length} errors - see console output above`).toHaveLength(0);
  });
});
