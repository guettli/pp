import { expect, test } from "@playwright/test";

const PROD_URL = "https://thomas-guettler.de/phoneme-party/";

test.describe("Production smoke test", () => {
  test("page loads and returns 200", async ({ page }) => {
    const response = await page.goto(PROD_URL);
    expect(response.status()).toBe(200);
  });

  test("page title is correct", async ({ page }) => {
    await page.goto(PROD_URL);
    await expect(page).toHaveTitle(/Phoneme Party/);
  });

  test("coi-serviceworker.js is accessible", async ({ request }) => {
    const response = await request.get(`${PROD_URL}coi-serviceworker.js`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("crossOriginIsolated");
  });

  test("no critical console errors on load", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (error) => {
      errors.push(`${error.message}\n${error.stack}`);
    });

    await page.goto(PROD_URL);
    await page.waitForTimeout(5000);

    if (errors.length > 0) {
      console.log("\n=== Console errors ===");
      errors.forEach((e, i) => console.log(`\nError ${i + 1}:\n${e}`));
    }
    expect(errors, `Found ${errors.length} console error(s)`).toHaveLength(0);
  });

  test("cross-origin isolation is active", async ({ page }) => {
    // coi-serviceworker installs a SW on first load and reloads the page.
    // Navigate twice so the SW is active on the second visit.
    await page.goto(PROD_URL);
    await page.waitForTimeout(2000);
    await page.goto(PROD_URL);
    await page.waitForTimeout(2000);
    const isolated = await page.evaluate(() => window.crossOriginIsolated);
    expect(isolated).toBe(true);
  });
});
