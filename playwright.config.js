import { defineConfig, devices } from "@playwright/test";
import path from "path";
import os from "os";

/**
 * Playwright configuration for Phoneme Party
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",

  // Grep to exclude slow tests by default (override with --grep)
  grep: process.env.RUN_SLOW_TESTS ? undefined : /^(?!.*@slow)/,

  // Global setup to pre-load ML model (optional, set USE_GLOBAL_SETUP=1)
  globalSetup: process.env.USE_GLOBAL_SETUP ? "./tests/global-setup.js" : undefined,

  // Maximum time one test can run for (includes worker-scoped fixture setup = model download)
  timeout: 300000, // 5 minutes: model download + compilation can take ~3 minutes on first run

  // Global timeout for the entire test run
  globalTimeout: 900000, // 15 minutes for all tests

  // Run tests in files in parallel
  fullyParallel: true,

  forbidOnly: false,
  retries: 0,

  // 1 worker: each Chrome loads the ONNX model into ~6GB WASM heap.
  // 2 workers peaks at 26GB system-wide (measured), which OOMs on 31GB machines
  // when VSCode + Claude Code (~4GB combined) are also running.
  workers: 1,

  // Reporter to use
  reporter: "html",

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: "http://localhost:5173/phoneme-party",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // When using global setup, also use persistent context to reuse cached model
        ...(process.env.USE_GLOBAL_SETUP && {
          launchOptions: {
            args: [`--user-data-dir=${path.join(os.tmpdir(), "playwright-phoneme-party-cache")}`],
          },
        }),
      },
      testIgnore: ["**/pouchdb-error-prod.spec.js", "**/prod-smoke.spec.js"],
    },
    {
      name: "chromium-production",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8080/phoneme-party",
      },
      testMatch: "**/pouchdb-error-prod.spec.js", // Only run production tests
    },
    {
      name: "prod",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/prod-smoke.spec.js",
    },
  ],

  // Run both dev and production servers before starting the tests
  webServer: [
    {
      command: "./run pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 10000, // Increased timeout for model loading
    },
    {
      command: "./run pnpm preview --port 8080 --strictPort",
      url: "http://localhost:8080",
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
