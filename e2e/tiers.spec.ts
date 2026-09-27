import { expect, test } from "@playwright/test";
import { launch, mockPost, openedUrls, overlayPage, shot, skipWizardWithTrial, startMock, useOwnKey } from "./harness";

// Mode tiers (CLOUD_TASK_3): on the trial, review and demo and the live
// checklist are shown with the plan that has them; choosing one opens a
// preview with a real screenshot and the upgrade button; a mock payment
// unlocks it in place. With an own key none of this exists.

test("trial: a locked mode opens its preview, a mock payment unlocks it", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await skipWizardWithTrial(page);
    const picker = page.locator("#simple-mode");
    await expect(picker.locator("option[data-locked]")).toHaveCount(2);
    await expect(picker.locator('option[value="review"]')).toHaveText(/\((в )?Pro\)/);

    await picker.selectOption("review");
    const preview = page.getByTestId("locked-preview");
    await expect(preview).toHaveAttribute("data-feature", "review");
    await expect(preview).toHaveAttribute("data-unlocked", "false");
    await expect(preview.locator("img")).toBeVisible();
    await expect(picker).not.toHaveValue("review");
    await shot(page, "tier-preview-review-dark");
    await page.getByTestId("locked-close").click();
    await expect(preview).toHaveCount(0);

    await picker.selectOption("demo");
    await expect(preview).toHaveAttribute("data-feature", "demo");
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);

    await picker.selectOption("review");
    await page.getByTestId("locked-upgrade").click();
    await expect.poll(() => openedUrls(run).length).toBe(1);
    const session = openedUrls(run)[0].split("/").pop();
    await mockPost(mock, `/mock/checkout/${session}/succeed`);
    await expect(preview).toHaveAttribute("data-unlocked", "true", { timeout: 20_000 });
    await shot(page, "tier-preview-unlocked-dark");
    await page.getByTestId("locked-use").click();
    await expect(picker).toHaveValue("review");
    await expect(picker.locator("option[data-locked]")).toHaveCount(0);

    // Pro in Simple: the checklist is a normal switch in Settings.
    await page.getByTestId("open-settings").click();
    await expect(page.getByTestId("live-tracker-toggle")).toBeVisible();
    await expect(page.getByTestId("live-tracker-locked")).toHaveCount(0);
  } finally {
    await run.close();
    await mock.close();
  }
});

test("trial: the live checklist is locked in Settings and in the overlay, each with its preview", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 1400 });
    await skipWizardWithTrial(page);
    await page.getByTestId("open-settings").click();
    const locked = page.getByTestId("live-tracker-locked");
    await expect(locked).toBeVisible();
    await expect(page.getByTestId("live-tracker-toggle")).toHaveCount(0);
    await locked.getByRole("button").click();
    await expect(page.getByTestId("locked-preview")).toHaveAttribute("data-feature", "checklist");
    await page.setViewportSize({ width: 480, height: 820 });
    await shot(page, "tier-preview-checklist-dark");
    await page.getByTestId("locked-close").click();
    await page.setViewportSize({ width: 480, height: 1400 });
    await locked.scrollIntoViewIfNeeded();
    await shot(page, "tier-simple-settings-trial-dark");
    await page.getByTestId("settings-back").click();

    await page.getByTestId("start").click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    const row = overlay.getByTestId("checklist-locked");
    await expect(row).toBeVisible();
    await shot(overlay, "overlay-checklist-locked-dark");
    await row.getByRole("button").click();
    await expect(overlay.getByTestId("locked-preview")).toHaveAttribute("data-feature", "checklist");
    await shot(overlay, "overlay-checklist-preview-dark");
    await overlay.getByTestId("locked-close").click();
    await overlay.getByTestId("overlay-end").click();

    await page.getByTestId("open-settings").click();
    await page.getByTestId("to-advanced").click();
    // End left Advanced on the meeting tab.
    await page.getByRole("button", { name: /^(Настройки|Settings)$/ }).click();
    await expect(page.getByTestId("advanced-settings").getByTestId("live-tracker-locked")).toBeVisible();
  } finally {
    await run.close();
    await mock.close();
  }
});

test("own key: no lock, preview or plan label anywhere, every mode and the checklist work", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 1400 });
    // A trial token on this install must not matter once an own key is chosen.
    await page.evaluate(async () => {
      const api = window.avalet!;
      await api.settings.selectProvider("avalet");
      await api.billing.activateTrial();
    });
    await useOwnKey(page, mock);
    await page.evaluate(async () => {
      await window.avalet!.settings.setOnboardingDone(true);
      await window.avalet!.settings.setGuideSeen(true);
    });
    await page.reload();
    await page.getByTestId("simple-home").waitFor();

    const picker = page.locator("#simple-mode");
    await expect(picker.locator("option[data-locked]")).toHaveCount(0);
    await expect(picker).not.toContainText("Pro");
    await picker.selectOption("review");
    await expect(picker).toHaveValue("review");
    await expect(page.getByTestId("locked-preview")).toHaveCount(0);

    await page.getByTestId("open-settings").click();
    await expect(page.getByTestId("simple-settings")).toBeVisible();
    await expect(page.getByTestId("live-tracker-locked")).toHaveCount(0);
    await expect(page.getByTestId("live-tracker-toggle")).toHaveCount(0);
    await page.getByTestId("settings-back").click();

    await page.getByTestId("start").click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    await expect(overlay.locator(".mode-chip")).toBeVisible();
    // Review mode: remarks and decisions from the suggestions land on the board.
    const board = overlay.getByTestId("mode-board");
    await expect(board).toContainText(/Замечания 1|Remarks 1/, { timeout: 25_000 });
    await board.locator(".tracker-toggle").click();
    await expect(board.locator("[data-section=decisions] li")).toHaveCount(1);
    await shot(overlay, "overlay-review-board-dark");
    await expect(overlay.getByTestId("checklist-locked")).toHaveCount(0);
    await expect(overlay.getByTestId("locked-preview")).toHaveCount(0);
    await overlay.getByTestId("overlay-end").click();

    await page.getByTestId("open-settings").click();
    await page.getByTestId("to-advanced").click();
    await expect(page.getByTestId("live-tracker-toggle")).toBeChecked();
    await expect(page.getByTestId("live-tracker-locked")).toHaveCount(0);
  } finally {
    await run.close();
    await mock.close();
  }
});
