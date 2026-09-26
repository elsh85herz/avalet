import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
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
    // Stop stays one click away while the paywall is shown.
    await expect(overlay.getByTestId("overlay-pause")).toBeVisible();
    await expect(overlay.getByTestId("overlay-end")).toBeVisible();
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
    // Everything real work needs is here without Advanced.
    const settings = page.getByTestId("simple-settings");
    await expect(settings.getByTestId("access-card")).toBeVisible();
    await expect(settings.getByTestId("model-in-use")).toContainText(/avalet-fast/);
    await expect(settings.locator("#meeting-mode")).toBeVisible();
    await expect(settings.locator("#meeting-context")).toBeVisible();
    await expect(settings.getByTestId("speech-models").locator("[data-model]")).toHaveCount(3);
    await expect(settings.getByTestId("speech-models-guide")).toContainText(/VPN/);
    await expect(settings.locator("#settings-opacity")).toBeVisible();
    await expect(settings.locator("#simple-ui-language")).toBeVisible();
    await settings.getByTestId("choose-export-dir").click();
    await expect(settings.getByTestId("export-dir")).toHaveText(run.dirs.exports);
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

// A build without a billing server (the placeholder URL and key, as shipped
// today): the Avalet options say "Coming soon", own key is the way, and the
// billing host is never contacted.
test("no billing server: Avalet is 'coming soon', own key works, nothing about the server in the log", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true, env: { AVALET_BILLING_URL: "", AVALET_BILLING_DEV_PUBKEY: "" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.getByTestId("wizard-next").click();
    const avalet = page.getByTestId("choice-avalet");
    await expect(avalet).toBeDisabled();
    await expect(avalet).toContainText(/Скоро|Coming soon/);
    await expect(page.getByTestId("choice-own")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("own-key")).toBeVisible();
    await shot(page, "wizard-2-access-coming-soon-dark");

    await page.evaluate(() => window.avalet!.settings.setOnboardingDone(true));
    await page.reload();
    await page.getByTestId("simple-home").waitFor();
    await page.getByTestId("open-settings").click();
    await expect(page.getByTestId("avalet-coming-soon")).toBeVisible();
    await expect(page.getByRole("button", { name: /Начать бесплатно|Start free trial|Использовать Avalet|Use Avalet/ })).toHaveCount(0);
    await expect(page.evaluate(() => window.avalet!.settings.selectProvider("avalet"))).rejects.toThrow(/not available/);
    await shot(page, "simple-settings-own-key-dark");
    await page.getByTestId("to-advanced").click();
    await page.getByTestId("advanced-settings").waitFor();
    await expect(page.locator(".provider-row", { hasText: /^Avalet$/ })).toHaveCount(0);
  } finally {
    await run.close();
    await mock.close();
  }
  const logs = findFiles(run.dirs.userData, "avalet.log");
  expect(logs.length, "the app log lives in the test profile").toBeGreaterThan(0);
  const log = logs.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  expect(log).toContain("no billing server in this build");
  expect(log).not.toMatch(/\[billing\] (network|unreachable)|billing server unreachable/);
});

function findFiles(dir: string, name: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, name);
    return entry.name === name ? [full] : [];
  });
}
