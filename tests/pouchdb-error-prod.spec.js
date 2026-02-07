import { expect, test } from "@playwright/test";

test.describe("PouchDB Loading Bug - Production Build", () => {
  test("should not have any console errors in production", async ({ page }) => {
    const errors = [];

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        errors.push(text);
      }
    });

    // Capture page errors (including TypeError from class extension)
    page.on("pageerror", (error) => {
      const errorText = `${error.message}\n${error.stack}`;
      errors.push(errorText);
    });

    // Navigate to the production build served from dist
    await page.goto("http://localhost:8080");

    // Wait a bit for initialization
    await page.waitForTimeout(2000);

    // Log all errors for debugging
    if (errors.length > 0) {
      console.log("\n=== Captured Console Errors ===");
      errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
      console.log("=== End Errors ===\n");
    }

    // This test will fail if ANY console error is found
    expect(
      errors,
      `Found ${errors.length} console error(s) in production - see output above`,
    ).toHaveLength(0);
  });
});
