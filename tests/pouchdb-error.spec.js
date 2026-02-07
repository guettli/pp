import { expect, test } from "@playwright/test";

test.describe("PouchDB Loading Bug", () => {
  test("should not have any console errors", async ({ page }) => {
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

    // Navigate to the app
    await page.goto("/");

    // Wait a bit for initialization (PouchDB loads early)
    await page.waitForTimeout(2000);

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
