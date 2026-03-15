import { test } from "../fixtures.js";
import { captureConsoleErrors, assertNoConsoleErrors } from "../helpers/console-errors.js";

test.describe("PouchDB Loading Bug", () => {
  test("should not have any console errors", async ({ modelPage: page }) => {
    // Model already loaded — capture any runtime errors
    const errors = captureConsoleErrors(page);

    // Brief pause to catch any deferred errors
    await page.waitForTimeout(500);

    assertNoConsoleErrors(errors);
  });
});
