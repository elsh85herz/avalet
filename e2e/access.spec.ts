import { expect, test } from "@playwright/test";
import { launch, mockPost, openedUrls, overlayPage, shot, skipWizardWithTrial, startMock, setTheme } from "./harness";

// Paywall: trial used up during a meeting, the transcript keeps going, the
// overlay offers buying or an own key; a mock payment unlocks Pro.
test("paywall: budget used up, mock payment, Pro unlocked", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await skipWizardWithTrial(page);
    await mockPost(mock, "/mock/usage", { weighted: 500_000 });

    await page.getByTestId("start").click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    await expect(overlay.getByTestId("paywall")).toBeVisible({ timeout: 25_000 });
    // Transcription is local and keeps going.
    await expect(page.locator(".segment").first()).toBeVisible();
    await shot(overlay, "overlay-paywall-dark");
    await expect(page.getByTestId("problem")).toBeVisible();
    await shot(page, "simple-paywall-dark");

    await overlay.getByTestId("paywall").getByRole("button").first().click();
    await expect.poll(() => openedUrls(run).length).toBe(1);
    const session = openedUrls(run)[0].split("/").pop();
    await mockPost(mock, `/mock/checkout/${session}/succeed`);
    await page.getByTestId("open-settings").click();
    const card = page.getByTestId("access-card");
    await expect(card).toHaveAttribute("data-tier", "pro", { timeout: 15_000 });
    await expect(card).toHaveAttribute("data-status", "ok");
    await expect(overlay.getByTestId("paywall")).toBeHidden();
    await shot(page, "simple-settings-pro-dark");
    await setTheme(page, "light");
    await shot(page, "simple-settings-pro-light");
  } finally {
    await run.close();
    await mock.close();
  }
});

test("own key: local model passes the test, a dead address gets a human error", async () => {
  const mock = await startMock();
  const run = await launch(mock);
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("choice-own").click();
    await page.locator("#own-provider").selectOption("custom");
    await page.locator("#own-base-url").fill("http://127.0.0.1:9/v1");
    await page.getByRole("button", { name: /Сохранить и проверить|Save and test/ }).click();
    await expect(page.getByTestId("key-test-result")).toContainText(/связаться|reach/, { timeout: 20_000 });
    await shot(page, "wizard-2-own-key-error-dark");
    await page.locator("#own-base-url").fill(`${mock.url}/openai/v1`);
    await page.getByRole("button", { name: /Сохранить и проверить|Save and test/ }).click();
    await expect(page.getByTestId("key-test-result")).toContainText(/работает|works/, { timeout: 20_000 });
    await shot(page, "wizard-2-own-key-ok-dark");
  } finally {
    await run.close();
    await mock.close();
  }
});

test("advanced level: switch from Simple settings and back", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 1600 });
    await skipWizardWithTrial(page);
    await page.getByTestId("open-settings").click();
    await shot(page, "simple-settings-dark");
    await page.getByTestId("to-advanced").click();
    await expect(page.getByTestId("advanced-settings")).toBeVisible();
    // The live checklist is on by default in Advanced.
    await expect(page.getByTestId("live-tracker-toggle")).toBeChecked();
    await shot(page, "advanced-settings-dark");
    await setTheme(page, "light");
    await shot(page, "advanced-settings-light");
    await setTheme(page, "dark");
    await page.getByTestId("to-simple").click();
    // Back in Simple, on the settings screen where the switch is.
    await expect(page.getByTestId("simple-settings")).toBeVisible();
  } finally {
    await run.close();
    await mock.close();
  }
});

test("AVALET_ADVANCED=1 opens the Advanced level for this launch", async () => {
  const mock = await startMock();
  const run = await launch(mock, { env: { AVALET_ADVANCED: "1" } });
  const page = run.main;
  try {
    await page.evaluate(() => window.avalet!.settings.setOnboardingDone(true));
    await page.reload();
    await expect(page.getByTestId("advanced-settings")).toBeVisible();
    await expect(page.getByTestId("to-simple")).toBeDisabled();
  } finally {
    await run.close();
    await mock.close();
  }
});
