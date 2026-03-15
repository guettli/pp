import { expect, test } from "../fixtures.js";

test.describe("User feedback form", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("phoneme-party-study-lang", "de-DE");
      localStorage.setItem("phoneme-party-language", "en-GB");
    });
  });

  test("opens modal when feedback button is clicked", async ({ page }) => {
    await page.goto("/");
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });

    const feedbackBtn = page.locator("#open-user-feedback-btn");
    await feedbackBtn.waitFor({ state: "visible" });
    await feedbackBtn.click();

    await expect(page.locator("#user-feedback-modal")).toBeVisible();
    await expect(page.locator("#user-feedback-text")).toBeVisible();
    await expect(page.locator("#submit-user-feedback-btn")).toBeVisible();
  });

  test("submit button is disabled when text is empty", async ({ page }) => {
    await page.goto("/");
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });

    await page.locator("#open-user-feedback-btn").click();
    await expect(page.locator("#user-feedback-modal")).toBeVisible();

    const submitBtn = page.locator("#submit-user-feedback-btn");
    await expect(submitBtn).toBeDisabled();
  });

  test("submits text feedback and shows success message", async ({ page }) => {
    await page.goto("/");
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });

    await page.locator("#open-user-feedback-btn").click();
    await expect(page.locator("#user-feedback-modal")).toBeVisible();

    await page.locator("#user-feedback-text").fill("This is a test feedback message.");

    const submitBtn = page.locator("#submit-user-feedback-btn");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.locator('[data-testid="feedback-success"]')).toBeVisible({ timeout: 5000 });
  });

  test("closes modal with close button", async ({ page }) => {
    await page.goto("/");
    await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });

    await page.locator("#open-user-feedback-btn").click();
    await expect(page.locator("#user-feedback-modal")).toBeVisible();

    await page.locator("#user-feedback-modal .btn-close").click();
    await expect(page.locator("#user-feedback-modal")).not.toBeVisible();
  });
});
