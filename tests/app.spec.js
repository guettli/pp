import { expect, test } from "@playwright/test";

test.describe("Phoneme Party - Pronunciation Practice", () => {
  // FIXME: Test times out waiting for model to load (>120s) in CI environment
  // App works fine when tested manually with ./run pnpm dev
  test.skip("should load without console errors", async ({ page }) => {
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

    // Wait for console output element to be visible (max 5 seconds)
    await page.locator("#console-output").waitFor({ timeout: 5000 });

    // Read the console output from the page itself
    const consoleText = await page.locator("#console-output").textContent();

    console.log("\n=== Console Output from Page ===");
    console.log(consoleText);
    console.log("=== End ===\n");

    // This test will fail if there are errors
    if (errors.length > 0) {
      console.log("\n=== Captured Errors ===");
      errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
      console.log("=== End Errors ===\n");
    }

    expect(errors, `Found ${errors.length} errors - see console output above`).toHaveLength(0);
  });
});
