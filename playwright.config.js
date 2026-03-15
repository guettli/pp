import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

// Load deploy.conf (gitignored, environment-specific) into process.env
try {
  for (const line of fs.readFileSync("deploy.conf", "utf-8").split("\n")) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2];
  }
} catch {
  // deploy.conf not present — fall back to defaults in test files
}

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
  retries: 2,

  // 1 worker: each Chrome loads the ONNX model into ~6GB WASM heap.
  // 2 workers peaks at 26GB system-wide (measured), which OOMs on 31GB machines
  // when VSCode + Claude Code (~4GB combined) are also running.
  workers: 1,

  // Reporters: HTML for humans, JSON for programmatic failure analysis.
  // On failure read playwright-results.json — no need to re-run the tests.
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-results.json" }],
  ],

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
      name: "fast",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"],
        },
      },
      testMatch: "**/fast/*.spec.js",
    },
    {
      name: "model",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
            ...(process.env.USE_GLOBAL_SETUP
              ? [`--user-data-dir=${path.join(os.tmpdir(), "playwright-phoneme-party-cache")}`]
              : []),
          ],
        },
      },
      testMatch: "**/model/*.spec.js",
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            // Block all external DNS — model and assets must come from localhost.
            // Any accidental fetch to huggingface.co or a CDN fails immediately.
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
            // When using global setup, reuse persistent context to keep the compiled model.
            ...(process.env.USE_GLOBAL_SETUP
              ? [`--user-data-dir=${path.join(os.tmpdir(), "playwright-phoneme-party-cache")}`]
              : []),
          ],
        },
      },
      // fast/ and model/ tests handled by their own projects; prod-* by chromium-production/prod.
      testIgnore: ["**/fast/*.spec.js", "**/model/*.spec.js", "**/prod-*.spec.js"],
    },
    {
      name: "chromium-production",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8080/phoneme-party",
      },
      testMatch: "**/prod-pouchdb-error.spec.js",
    },
    {
      name: "prod",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/prod-smoke.spec.js", "**/prod-audio.spec.js"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: ["**/prod-*.spec.js"],
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
