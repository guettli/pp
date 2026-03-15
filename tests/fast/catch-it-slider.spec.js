import { expect, test } from "../fixtures.js";

/**
 * Simulate a slider drag: pointerdown at fromVal, pointermove to toVal,
 * then update slider value + fire input event so bind:value updates cfgPhraseCount.
 * Caller should call releasePhraseSlider afterwards to complete the gesture.
 */
async function dragPhraseSlider(page, fromVal, toVal) {
  await page.evaluate(
    ({ fromVal, toVal }) => {
      const slider = document.querySelector("#cfg-phrases");
      if (!slider) throw new Error("slider not found");
      const rect = slider.getBoundingClientRect();
      const fromX = rect.left + ((fromVal - 3) / (7 - 3)) * rect.width;
      const toX = rect.left + ((toVal - 3) / (7 - 3)) * rect.width;
      const cy = rect.top + rect.height / 2;
      slider.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          clientX: fromX,
          clientY: cy,
          button: 0,
          buttons: 1,
        }),
      );
      // Dispatch pointermove on the slider element so onpointermove fires
      // and sets _rangeDragged = true (required by the drag-only pattern).
      slider.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: toX,
          clientY: cy,
          buttons: 1,
        }),
      );
      slider.value = String(toVal);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { fromVal, toVal },
  );
}

async function releasePhraseSlider(page, toVal) {
  await page.evaluate((toVal) => {
    const slider = document.querySelector("#cfg-phrases");
    const rect = slider.getBoundingClientRect();
    const toX = rect.left + ((toVal - 3) / (7 - 3)) * rect.width;
    // Dispatch on the slider element (with bubbles) so onRangePointerUp fires,
    // which runs scroll compensation after the phrase list DOM update.
    slider.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: toX,
        button: 0,
      }),
    );
  }, toVal);
  // Wait for the iterative rAF correction to complete (4 passes + anchor restore + final pass).
  await page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
            ),
          ),
        ),
      ),
  );
}

/**
 * Simulate a bare click (no drag) on the phrase slider at toVal.
 * Fires pointerdown + input + pointerup with no pointermove, mimicking a
 * click on the track without dragging the thumb.
 */
async function clickPhraseSlider(page, toVal) {
  await page.evaluate((toVal) => {
    const slider = document.querySelector("#cfg-phrases");
    if (!slider) throw new Error("slider not found");
    const rect = slider.getBoundingClientRect();
    const x = rect.left + ((toVal - 3) / (7 - 3)) * rect.width;
    const y = rect.top + rect.height / 2;
    slider.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
      }),
    );
    slider.value = String(toVal);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: x,
        button: 0,
      }),
    );
  }, toVal);
}

async function setLocaleAndGoto(page, url) {
  // Catch-it must never trigger ONNX model loading — fail fast if it does.
  await page.route("https://huggingface.co/**", (route) =>
    route.fulfill({ status: 503, body: "model must not be loaded in catch-it tests" }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("phoneme-party-study-lang", "de-DE");
    localStorage.setItem("phoneme-party-language", "en-GB");
  });
  await page.goto(url);
}

test.describe("Catch It - phrase count slider", () => {
  test.beforeEach(async ({ page }) => {
    await setLocaleAndGoto(page, "/phoneme-party/catch-it/?sl=de-DE&n=5");
    await page.locator("button.btn-success").waitFor({ state: "visible", timeout: 5000 });
  });

  test("drag 5→7: slider viewport position stays stable after phrase list grows", async ({
    page,
  }) => {
    // Use a narrow mobile-like viewport so content requires scrolling and
    // a layout shift (slider pushed down) becomes clearly visible.
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(page.locator(".target-item")).toHaveCount(5, { timeout: 3000 });

    // Scroll slider into view so it is on screen before we measure
    await page.locator("#cfg-phrases").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const yBefore = (await page.locator("#cfg-phrases").boundingBox()).y;

    await dragPhraseSlider(page, 5, 7);
    await releasePhraseSlider(page, 7);
    await expect(page.locator(".target-item")).toHaveCount(7, { timeout: 2000 });
    await page.waitForTimeout(100);

    const yAfter = (await page.locator("#cfg-phrases").boundingBox()).y;

    // Slider must not shift by more than 2px when the phrase list grows above it
    expect(Math.abs(yAfter - yBefore)).toBeLessThanOrEqual(2);
  });

  test("drag 5→7: phrase list and label update live during drag", async ({ page }) => {
    await expect(page.locator(".target-item")).toHaveCount(5, { timeout: 3000 });
    await expect(page.locator('label[for="cfg-phrases"]')).toContainText("5");

    await dragPhraseSlider(page, 5, 7);

    // During drag: label shows 7 and phrase list already grows to 7 (live update)
    await expect(page.locator('label[for="cfg-phrases"]')).toContainText("7");
    await expect(page.locator(".target-item")).toHaveCount(7, { timeout: 2000 });

    await releasePhraseSlider(page, 7);

    // After release: still 7, slider thumb stays put
    await expect(page.locator(".target-item")).toHaveCount(7, { timeout: 1000 });
    expect(await page.locator("#cfg-phrases").inputValue()).toBe("7");
  });

  test("click without drag: slider value and phrase list stay unchanged", async ({ page }) => {
    await expect(page.locator(".target-item")).toHaveCount(5, { timeout: 3000 });
    await expect(page.locator('label[for="cfg-phrases"]')).toContainText("5");

    // Click at position 7 without dragging — should NOT change value
    await clickPhraseSlider(page, 7);

    await expect(page.locator('label[for="cfg-phrases"]')).toContainText("5");
    await expect(page.locator(".target-item")).toHaveCount(5, { timeout: 1000 });
    expect(await page.locator("#cfg-phrases").inputValue()).toBe("5");
  });

  test("drag 5→3: phrase list updates live, game uses correct count", async ({ page }) => {
    await expect(page.locator(".target-item")).toHaveCount(5, { timeout: 3000 });

    await dragPhraseSlider(page, 5, 3);

    // During drag: phrase list shrinks to 3 live
    await expect(page.locator('label[for="cfg-phrases"]')).toContainText("3");
    await expect(page.locator(".target-item")).toHaveCount(3, { timeout: 2000 });

    await releasePhraseSlider(page, 3);

    // After release: still 3, slider thumb stays put
    await expect(page.locator(".target-item")).toHaveCount(3, { timeout: 1000 });
    expect(await page.locator("#cfg-phrases").inputValue()).toBe("3");

    // Start game: symbols bar must have 3 symbols
    await page.locator("button.btn-success").click();
    await page.locator(".symbol-item").first().waitFor({ state: "visible", timeout: 3000 });
    await expect(page.locator(".symbol-item")).toHaveCount(3);
  });
});

test.describe("Catch It - back button navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setLocaleAndGoto(page, "/phoneme-party/catch-it/?sl=de-DE&n=3");
    await page.locator("button.btn-success").waitFor({ state: "visible", timeout: 5000 });
  });

  test("browser back during game returns to catch-it intro", async ({ page }) => {
    await page.locator("button.btn-success").click();
    await page.locator(".game-container").waitFor({ state: "visible", timeout: 3000 });

    // Simulate browser back button
    await page.evaluate(() => window.history.back());

    await expect(page.locator("button.btn-success")).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveURL(/catch-it/, { timeout: 3000 });
  });

  test("back button on gameover returns to catch-it settings screen (not home)", async ({
    page,
  }) => {
    // Shorten game duration to 2 s via evaluate
    await page.locator("#cfg-duration").evaluate((el) => {
      el.min = "2";
      el.value = "2";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await page.locator("button.btn-success").click();

    await page
      .locator("h1")
      .filter({ hasText: /time.s up/i })
      .waitFor({ timeout: 10000 });

    await page.locator("button", { hasText: "← Back" }).click();

    await expect(page).toHaveURL(/catch-it/, { timeout: 3000 });
    await expect(page.locator("button.btn-success")).toBeVisible({ timeout: 3000 });
  });
});
