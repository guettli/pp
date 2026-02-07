# Testing Guide

This document explains how to run tests for Phoneme Party, including strategies for handling the ML
model download.

## Quick Start

```bash
# Run fast tests (no model loading):
./run pnpm test

# Run ALL tests including slow ones:
./run pnpm test:slow

# Run voice selection tests specifically:
./run pnpm test:voice
```

## ML Model Caching

The app uses an ML model that downloads from HuggingFace (~50-100MB). The model is cached in the
browser's Cache API, but by default Playwright uses a fresh browser profile for each test run.

### Problem: Slow Tests

Without caching, each test run re-downloads the model, taking **~2-3 minutes**. The `@slow` tests
include this loading time.

### Solution: Pre-cache the Model

Use the **global setup** feature to download the model once and reuse it:

```bash
# First run: Downloads and caches model (slow)
./run pnpm test:slow:cached

# Subsequent runs: Reuses cached model (fast!)
./run pnpm test:slow:cached
```

**How it works:**

1. Global setup script (`tests/global-setup.js`) runs once before all tests
2. It loads the app in a persistent browser context
3. Model downloads and is cached in `/tmp/playwright-phoneme-party-cache/`
4. All tests reuse this cached browser profile

### Voice Selection Tests

```bash
# Without caching (2-3 min first time):
./run pnpm test:voice

# With caching (30 sec after first run):
./run pnpm test:voice:cached
```

## Test Categories

### Fast Tests (Default)

Run automatically by `pnpm test` and `pnpm check`:

- `tests/app.spec.js` - Basic app loading
- `tests/history.spec.js` - History functionality
- `tests/voice-selection-unit.spec.js` - Voice selection logic
- `tests/pouchdb-error*.spec.js` - Database loading

These tests are **excluded from slow tests** via the `@slow` tag filter.

### Slow Tests (@slow tag)

Require full app initialization with model loading:

- `tests/voice-selection.spec.js` - Full E2E voice selection testing

**Run with:**

```bash
RUN_SLOW_TESTS=1 ./run pnpm test
# or
./run pnpm test:slow
```

## Manual Testing

For voice-related features (speech synthesis), manual testing is often more reliable:

1. Start dev server: `./run pnpm dev`
2. Open browser: http://localhost:5173
3. Test voice selection:
   - Make a recording (hold the record button)
   - **Long-press** (500ms) on the 🔊 replay button or play-target button
   - Voice selection modal should appear with available voices

## Headed Mode (Visual Debugging)

Watch tests run in a real browser window:

```bash
./run pnpm test:headed

# Or for voice tests:
RUN_SLOW_TESTS=1 ./run pnpm test tests/voice-selection.spec.js --headed
```

## UI Mode (Interactive Debugging)

Playwright's interactive UI for debugging:

```bash
./run pnpm test:ui

# For slow tests:
RUN_SLOW_TESTS=1 ./run pnpm test:ui
```

## Test Reports

View detailed test results with screenshots:

```bash
./run pnpm test:report
```

## Environment Variables

- `RUN_SLOW_TESTS=1` - Include tests marked with `@slow`
- `USE_GLOBAL_SETUP=1` - Pre-load model in global setup
- `CI=1` - Enable CI-specific settings (retries, sequential runs)

## npm Scripts Reference

| Script                   | Description                   | Speed   |
| ------------------------ | ----------------------------- | ------- |
| `pnpm test`              | Fast tests only               | ~5 sec  |
| `pnpm test:slow`         | All tests including @slow     | 2-3 min |
| `pnpm test:slow:cached`  | All tests with model caching  | 30 sec  |
| `pnpm test:voice`        | Voice selection tests         | 2-3 min |
| `pnpm test:voice:cached` | Voice tests with caching      | 30 sec  |
| `pnpm test:headed`       | Run with visible browser      | -       |
| `pnpm test:ui`           | Interactive debug mode        | -       |
| `pnpm test:report`       | View test results             | -       |
| `pnpm check`             | Lint + typecheck + fast tests | ~10 sec |

## CI/CD Considerations

For continuous integration:

1. **Use global setup** to cache model across test runs
2. **Cache the browser profile** between CI runs:

   ```yaml
   # GitHub Actions example
   - name: Cache Playwright model
     uses: actions/cache@v3
     with:
       path: /tmp/playwright-phoneme-party-cache
       key: playwright-model-${{ runner.os }}
   ```

3. **Run slow tests in separate job** to parallelize

## Troubleshooting

### "No tests found" error

- Make sure you're in the project root
- Use `./run pnpm test` not just `pnpm test`
- Check that test files exist in `tests/` directory

### Tests timeout on model loading

- Increase timeout in `playwright.config.js`
- Use cached model approach (`test:slow:cached`)
- Check network connection to HuggingFace CDN

### Voice tests fail in headless mode

- Headless Chrome has no speech synthesis voices
- Use `--headed` mode or manual testing for voice features

### Model cache not working

- Clear the cache: `rm -rf /tmp/playwright-phoneme-party-cache`
- Try running with `USE_GLOBAL_SETUP=1` explicitly
- Check that `tests/global-setup.js` exists

## Clean Up

Remove cached test data:

```bash
# Remove Playwright cache
rm -rf /tmp/playwright-phoneme-party-cache

# Remove test results
rm -rf test-results/ playwright-report/
```
