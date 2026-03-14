import { test, expect } from "./fixtures.js";

async function goToMainPage(page) {
  await page.addInitScript(() => {
    localStorage.setItem("phoneme-party-study-lang", "de-DE");
    localStorage.setItem("phoneme-party-language", "en-GB");
  });
  await page.goto("/");
  await page.locator("#main-content").waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Fail immediately on any request that gets a 4xx/5xx response or a DNS/network
 * error. This surfaces broken external dependencies as a clear error rather than
 * a cryptic 180 s model-load timeout.
 */
test("no failed requests during page load", async ({ page }) => {
  const failures = [];

  page.on("requestfailed", (req) => {
    failures.push(`FAILED ${req.url()} — ${req.failure()?.errorText}`);
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      failures.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });

  await goToMainPage(page);
  await page.waitForTimeout(500);

  expect(failures, `Failed requests:\n${failures.join("\n")}`).toHaveLength(0);
});

/**
 * Verify that in dev mode the ONNX model is fetched from the local dev server,
 * not from HuggingFace.
 */
test("model is loaded from localhost, not huggingface.co", async ({ page }) => {
  const hfRequests = [];

  page.on("request", (req) => {
    if (req.url().includes("huggingface.co")) {
      hfRequests.push(req.url());
    }
  });

  await goToMainPage(page);
  await page.waitForTimeout(500);

  expect(
    hfRequests,
    `Model fetch went to HuggingFace instead of localhost: ${hfRequests.join(", ")}`,
  ).toHaveLength(0);
});

/**
 * Verify that external internet access is blocked in the test browser.
 * The --host-resolver-rules Chrome flag must prevent DNS resolution for
 * any host other than localhost / 127.0.0.1.
 */
test("external internet access is blocked", async ({ page }) => {
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch("https://huggingface.co", { signal: AbortSignal.timeout(5000) });
      return { blocked: false, status: res.status };
    } catch (e) {
      return { blocked: true, error: e.message };
    }
  });

  expect(result.blocked, `Expected internet to be blocked but got status ${result.status}`).toBe(
    true,
  );
});
