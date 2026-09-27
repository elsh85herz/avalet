import { expect, test } from "@playwright/test";
import { launch, shot, startMock, setTheme, skipWizardWithTrial } from "./harness";

// First run: all four wizard screens, the trial path, the model download with
// progress, the self-test, then the Simple main window.
test("first-run wizard: permissions, trial, model download, context and try it", async () => {
  const mock = await startMock();
  const run = await launch(mock);
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "1");
    await shot(page, "wizard-1-permissions-dark");
    await setTheme(page, "light");
    await shot(page, "wizard-1-permissions-light");
    await setTheme(page, "dark");

    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "2");
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
    await shot(page, "wizard-3-model-dark");
    await page.locator('[data-model="small"] button.primary').click();
    await expect(page.locator('[data-model="small"]')).toHaveClass(/downloading/);
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
    await expect(page.locator('[data-model="small"]')).toHaveClass(/ready/, { timeout: 20_000 });
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
