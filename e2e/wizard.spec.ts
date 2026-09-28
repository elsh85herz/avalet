import { expect, test } from "@playwright/test";
import { launch, shot, startMock, setTheme, skipWizardWithTrial } from "./harness";

// First run: all four wizard screens, the trial path, the model download with
// progress, the self-test, then the Simple main window.
test("first-run wizard: permissions, trial, model download, context and try it", async () => {
  const mock = await startMock();
  // A slower fake download, so the test can see it start early and still cancel it on step 3.
  const run = await launch(mock, { env: { FAKE_DOWNLOAD_STEP_MS: "1500" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "1");
    await shot(page, "wizard-1-permissions-dark");
    await setTheme(page, "light");
    await shot(page, "wizard-1-permissions-light");
    await setTheme(page, "dark");

    const modelState = () => page.evaluate(async () => (await window.avalet!.speech.models())[0]?.state);
    expect(await modelState()).toBe("absent");

    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "2");
    // Leaving the first screen started the speech model download in the background.
    await expect.poll(modelState).toBe("downloading");
    await shot(page, "wizard-2-access-dark");
    await page.getByTestId("choice-avalet").click();
    await expect(page.getByTestId("access-card")).toHaveAttribute("data-tier", "trial");
    await expect(page.getByTestId("access-card")).toHaveAttribute("data-status", "ok");
    await shot(page, "wizard-2-access-trial-dark");
    await page.getByTestId("choice-own").click();
    await expect(page.getByTestId("own-key")).toBeVisible();
    await shot(page, "wizard-2-access-own-key-dark");
    await page.getByTestId("choice-avalet").click();

    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "3");
    // Already downloading when the step opens: one model, no choice, no button to press.
    await expect(page.locator("[data-model]")).toHaveCount(1);
    await expect(page.locator('[data-model="small"]')).toHaveClass(/downloading/);
    await shot(page, "wizard-3-model-dark");
    await page.waitForTimeout(500);
    await shot(page, "wizard-3-model-downloading-dark");
    // Cancel keeps what was downloaded: the row shows the partial size and Continue.
    await page.locator('[data-model="small"]').getByRole("button", { name: /Отменить|Cancel/ }).click();
    const small = page.locator('[data-model="small"]');
    await expect(small).toContainText(/Скачана частично|Partly downloaded/);
    await expect(small.locator(".model-percent")).toContainText("%");
    await shot(page, "wizard-3-model-partial-dark");
    const partialPercent = Number((await small.locator(".model-percent").innerText()).match(/(\d+)%/)![1]);
    expect(partialPercent).toBeGreaterThan(0);
    await small.getByRole("button", { name: /Продолжить|Continue/ }).click();
    await expect(small).toHaveClass(/downloading/);
    const resumedPercent = Number((await small.locator(".model-percent").innerText()).match(/(\d+)%/)![1]);
    expect(resumedPercent).toBeGreaterThanOrEqual(partialPercent);
    await expect(page.locator('[data-model="small"]')).toHaveClass(/ready/, { timeout: 30_000 });
    await shot(page, "wizard-3-model-ready-dark");

    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "4");
    await page.locator("#meeting-context").fill("Аналитик проекта отчётности в CRM");
    await page.getByTestId("try-it").click();
    // The made-up conversation is shown, so the suggestion reads as an example about it.
    await expect(page.getByTestId("sample")).toContainText("выгружать отчёт");
    await expect(page.getByTestId("sample")).toContainText("Excel", { timeout: 20_000 });
    await expect(page.getByTestId("mic-level")).toBeVisible();
    await shot(page, "wizard-4-context-try-it-dark");
    await setTheme(page, "light");
    await shot(page, "wizard-4-context-try-it-light");
    await setTheme(page, "dark");

    await page.getByTestId("wizard-next").click();
    // The how-it-works guide comes once, right after the wizard.
    await expect(page.getByTestId("how-it-works")).toBeVisible();
    await page.getByTestId("guide-skip").click();
    await expect(page.getByTestId("simple-home")).toBeVisible();
    await shot(page, "simple-home-empty-dark");
  } finally {
    await run.close();
    await mock.close();
  }
});

// The guide's mode menu: what it shows depends on the meeting mode picked
// there, not the app's actual setting (see src/renderer/components/HowItWorks.tsx).

// The guide read before the first call starts the speech model download when
// the model is not there yet (a wizard skipped from outside never started it).
test("first-run guide starts the speech model download in the background", async () => {
  const mock = await startMock();
  const run = await launch(mock);
  const page = run.main;
  try {
    await page.getByTestId("wizard").waitFor();
    await page.evaluate(async () => {
      await window.avalet!.settings.setOnboardingDone(true);
    });
    await page.reload();
    await expect(page.getByTestId("how-it-works")).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => (await window.avalet!.speech.models())[0]?.state))
      .toMatch(/downloading|ready/);
    await page.getByTestId("guide-skip").click();
    await expect(page.getByTestId("simple-home")).toBeVisible();
  } finally {
    await run.close();
    await mock.close();
  }
});
test("how-it-works guide: the mode menu changes which buttons and running list the guide shows", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await skipWizardWithTrial(page);
    await page.getByTestId("open-guide").click();
    const guide = page.getByTestId("how-it-works");
    await expect(guide).toBeVisible();

    // Overlay, Pause/End, Auto: three mode-independent pages, then the menu.
    await page.getByTestId("guide-next").click();
    await page.getByTestId("guide-next").click();
    await page.getByTestId("guide-next").click();
    await expect(guide).toHaveAttribute("data-step", "4");
    await expect(page.getByTestId("guide-mode-free")).toHaveAttribute("aria-checked", "true");
    await shot(page, "guide-mode-menu-dark");

    // Requirements: three buttons (no "Risks?", the mode's own prompt and board cover it), then a board page.
    await page.getByTestId("guide-mode-requirements").click();
    await page.getByTestId("guide-next").click();
    await expect(guide).toContainText("Уточняющий вопрос");
    await expect(guide).not.toContainText("Риски?");
    await shot(page, "guide-actions-requirements-dark");
    await page.getByTestId("guide-next").click();
    await expect(guide).toContainText(/требования и риски/i);
    await shot(page, "guide-board-requirements-dark");

    // Back to the menu, then interview: no button list at all, Process now instead, no board page.
    await page.getByTestId("guide-change-mode").click();
    await expect(guide).toHaveAttribute("data-step", "4");
    await page.getByTestId("guide-mode-interview").click();
    await page.getByTestId("guide-next").click();
    await expect(guide).toContainText("Обработать сейчас");
    await expect(guide).not.toContainText("Уточняющий вопрос");
    await expect(guide.getByTestId("guide-change-mode")).toBeVisible();
    // No board page for interview: the very next page is the live checklist, not a mode board.
    await page.getByTestId("guide-next").click();
    await expect(guide).toContainText(/Живой чек-лист/i);
    await expect(guide).toHaveAttribute("data-step", "6"); // no board page for interview: one less than requirements' 7

    // Last page: no Skip button any more, Next itself closes the guide.
    await page.getByTestId("guide-next").click();
    await expect(page.getByTestId("simple-home")).toBeVisible();
  } finally {
    await run.close();
    await mock.close();
  }
});
