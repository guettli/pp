import { expect, test } from "./fixtures.js";

test.describe("PouchDB Loading Bug", () => {
  test("should not have any console errors", async ({ modelPage: page }) => {
    const errors = [];

    // Model already loaded — capture any runtime errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        errors.push(text);
      }
    });

    page.on("pageerror", (error) => {
      const errorText = `${error.message}\n${error.stack}`;
      errors.push(errorText);
    });

    // Brief pause to catch any deferred errors
    await page.waitForTimeout(500);

    // Log all errors for debugging
    if (errors.length > 0) {
      console.log("\n=== Captured Console Errors ===");
      errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
      console.log("=== End Errors ===\n");
    }

    // This test will fail if ANY console error is found
    expect(errors, `Found ${errors.length} console error(s) - see output above`).toHaveLength(0);
  });
});
