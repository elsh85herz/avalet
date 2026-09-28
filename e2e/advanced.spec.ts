import { expect, test } from "@playwright/test";
import { launch, overlayPage, setTheme, shot, startMock, useOwnKey } from "./harness";

// Advanced level during a meeting with an own key: the live checklist in the
// overlay (on by default in Advanced), the requirements board, the meeting
// tab and the history list.
test("advanced meeting: live checklist, meeting tab, history", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true, env: { AVALET_ADVANCED: "1" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await useOwnKey(page, mock);
    await page.evaluate(async () => {
      const api = window.avalet!;
      await api.settings.setAgenda("Какой лимит: дневной или разовый\nКто подтверждает выше порога\nСроки интеграции");
      await api.settings.setMeetingMode("requirements");
      await api.settings.setOnboardingDone(true);
    await api.settings.setGuideSeen(true);
    });
    await page.reload();
    await page.getByTestId("advanced-settings").waitFor();
    await page.getByRole("button", { name: /^(Старт|Start)$/ }).click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    await expect(page.locator(".segment")).toHaveCount(3, { timeout: 20_000 });

    await overlay.locator(".tracker-toggle").first().click();
    await overlay.getByRole("button", { name: /Обновить сейчас|Update now/ }).click();
    await expect(overlay.locator(".tracker-list li.closed")).toHaveCount(1, { timeout: 20_000 });
    await expect(overlay.locator(".tracker-list li.proposed")).toHaveCount(1);
    // One line per item; a click shows what was actually said, who and when.
    await overlay.locator(".tracker-list li.closed .tracker-item").click();
    await expect(overlay.getByTestId("tracker-detail")).toContainText("дневной лимит по карте прямо в приложении");
    await expect(overlay.getByTestId("tracker-detail")).toContainText(/Собеседник|Other/);
    await shot(overlay, "overlay-advanced-checklist-dark");
    await setTheme(page, "light");
    await shot(overlay, "overlay-advanced-checklist-light");
    await setTheme(page, "dark");
    await overlay.locator(".tracker-toggle").first().click();
    await shot(overlay, "overlay-advanced-expanded-dark");

    // Requirements mode: candidate requirements and risks from the suggestions land on the board.
    const board = overlay.getByTestId("mode-board");
    await expect(board).toContainText(/Требования 1|Requirements 1/, { timeout: 20_000 });
    await board.locator(".tracker-toggle").click();
    await expect(board.locator("[data-section=requirements] li")).toHaveCount(1);
    await expect(board.locator("[data-section=risks] li")).toHaveCount(1);
    await shot(overlay, "overlay-requirements-board-dark");
    await board.locator(".tracker-toggle").click();

    // A new suggestion folds an open checklist back, so the answer is not covered.
    await overlay.locator(".tracker-toggle").first().click();
    await expect(overlay.locator(".tracker-body")).toHaveCount(1);
    await overlay.getByRole("button", { name: /Уточняющий вопрос|Ask a question/ }).click();
    await expect(overlay.locator(".tracker-toggle").first()).toHaveAttribute("aria-expanded", "false", { timeout: 10_000 });

    // Main window: the quote with a jump to that moment of the transcript.
    await page.locator(".agenda-toggle").click();
    const quote = page.getByTestId("meeting-quote").first();
    await expect(quote).toContainText("дневной лимит по карте");
    await quote.locator(".segment-jump").click();
    await expect(page.locator(".segment.highlight")).toHaveCount(1);
    await expect(page.locator(".segment.highlight")).toContainText("дневной лимит по карте");
    await shot(page, "advanced-meeting-live-dark");

    await page.getByRole("button", { name: /^(Настройки|Settings)$/ }).click();
    await page.getByRole("button", { name: /^(Стоп|Stop)$/ }).click();
    await page.getByRole("button", { name: /Завершить встречу|End meeting/ }).click();
    await page.getByRole("button", { name: /^(История|History)$/ }).click();
    await expect(page.locator(".meeting-row")).toHaveCount(1);
    await shot(page, "history-list-dark");
  } finally {
    await run.close();
    await mock.close();
  }
});
