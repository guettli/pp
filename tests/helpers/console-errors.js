import { expect } from "@playwright/test";

/**
 * Attach console/pageerror listeners to page and return the errors array.
 * Call before navigation or actions you want to monitor.
 */
export function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(`${error.message}\n${error.stack}`);
  });
  return errors;
}

/**
 * Log and assert that no console errors were captured.
 */
export function assertNoConsoleErrors(errors) {
  if (errors.length > 0) {
    console.log("\n=== Captured Console Errors ===");
    errors.forEach((err, i) => console.log(`\nError ${i + 1}:\n${err}`));
    console.log("=== End Errors ===\n");
  }
  expect(errors, `Found ${errors.length} console error(s) - see output above`).toHaveLength(0);
}
