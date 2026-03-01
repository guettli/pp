import { test as base } from "@playwright/test";

/**
 * Worker-scoped `modelPage` fixture.
 *
 * The ONNX phoneme model takes ~5–30s to load and consumes ~6GB of WASM heap.
 * With the default Playwright per-test page isolation, every test pays this cost.
 *
 * This fixture creates one browser context + page per worker, navigates to "/",
 * waits for the model to finish loading, then hands the same page to every test
 * that declares `modelPage`. The ONNX InferenceSession stays in memory across
 * tests — no reload, no re-compilation.
 *
 * Suitable for tests that:
 *   - use window.__test_api / page.evaluate() to run phoneme extraction
 *   - don't depend on a clean browser storage state
 *   - call db.clearAll() themselves when they touch PouchDB
 *
 * Tests that specifically test the loading sequence (app.spec.js) should keep
 * using the regular `page` fixture for a fresh context.
 */
export const test = base.extend({
  modelPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/");
      // Wait for main content to appear, then wait for model to finish loading
      // (model-loaded class is added to #app when isModelLoaded becomes true)
      await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });
      await page.locator("#app.model-loaded").waitFor({ state: "attached", timeout: 180000 });
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
