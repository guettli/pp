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

  // Maximum time one test can run for (increased for model loading)
  timeout: 120000, // 2 minutes to allow for ML model download

  // Global timeout for the entire test run
  globalTimeout: 600000, // 10 minutes for all tests

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: "html",

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: "http://localhost:5173",

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
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: "./run pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 10000, // Increased timeout for model loading
  },
});
