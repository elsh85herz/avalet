import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launch, overlayPage, setTheme, shot, skipWizardWithTrial, startMock } from "./harness";

// The Simple meeting flow end to end: start, fake transcript, a suggestion in
// the overlay, pause, summary, export .md and .txt, end.
test("simple meeting: start, transcript, suggestion, pause, summary, export", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await skipWizardWithTrial(page);
    await page.locator("#meeting-agenda").fill("Какой лимит: дневной или разовый\nКто подтверждает выше порога");
    await page.locator("#meeting-context").fill("Проект лимитов по картам в мобильном приложении.");
    await page.waitForTimeout(700); // autosave

    await page.getByTestId("start").click();
    await expect(page.getByTestId("session-status")).toContainText(/Слушаю|Listening/);
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });

    // The fake capture feeds four canned phrases; they show up in the transcript.
    await expect(page.locator(".segment")).toHaveCount(3, { timeout: 20_000 });
    await expect(page.locator(".segment-text").first()).toContainText("лимит");
    // The other side paused after a question cue: a suggestion streams into the overlay.
    await expect(overlay.locator(".block-text")).toContainText(/Уточните|экране/, { timeout: 20_000 });
    await shot(overlay, "overlay-simple-suggestion-dark");
    await shot(page, "simple-meeting-live-dark");
    await expect(overlay.locator(".usage-chip")).toBeVisible();

    // One primary quick action in Simple, the rest behind "More actions".
    await expect(overlay.locator(".quick-actions button")).toHaveCount(2);
    await overlay.getByRole("button", { name: /Ещё действия|More actions/ }).click();
    await expect(overlay.locator(".quick-actions button")).toHaveCount(5);
    await shot(overlay, "overlay-simple-more-actions-dark");

    await page.getByTestId("pause").click();
    await expect(page.getByTestId("session-status")).toContainText(/Пауза|Paused/);
    await shot(overlay, "overlay-simple-paused-dark");

    await page.getByRole("button", { name: /Итог встречи|Meeting summary/ }).click();
    await expect(page.locator(".summary-text")).toContainText("Обсуждения", { timeout: 20_000 });
    await expect(page.locator(".agenda-toggle").last()).toBeVisible();
    await shot(page, "simple-meeting-summary-dark");
    await setTheme(page, "light");
    await shot(page, "simple-meeting-summary-light");
    await shot(overlay, "overlay-simple-paused-light");
    await setTheme(page, "dark");

    await page.getByRole("button", { name: /Скачать протокол|Download protocol/ }).click();
    await page.getByRole("button", { name: /Скачать транскрипт|Download transcript/ }).click();
    await expect.poll(() => fs.readdirSync(run.dirs.exports).filter((f) => f.endsWith(".md") || f.endsWith(".txt")).length).toBe(2);
    const files = fs.readdirSync(run.dirs.exports);
    const md = fs.readFileSync(path.join(run.dirs.exports, files.find((f) => f.endsWith(".md"))!), "utf8");
    const txt = fs.readFileSync(path.join(run.dirs.exports, files.find((f) => f.endsWith(".txt"))!), "utf8");
    expect(md).toMatch(/^# /);
    expect(md).toContain("Какой лимит: дневной или разовый");
    expect(md).toContain("Прислать описание процесса колл-центра");
    expect(txt).toContain("Нам нужно, чтобы клиент мог менять дневной лимит");

    await page.getByTestId("end").click();
    await expect(page.getByTestId("session-status")).toContainText(/Всё готово|Ready/);
    // The ended meeting stays on screen with its summary.
    await expect(page.locator(".summary-text")).toBeVisible();
  } finally {
    await run.close();
    await mock.close();
  }
});

test("start without a speech model explains it and offers the download", async () => {
  const mock = await startMock();
  const run = await launch(mock);
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await skipWizardWithTrial(page);
    await page.getByTestId("start").click();
    await expect(page.getByTestId("problem")).toContainText(/модель|model/i);
    await shot(page, "simple-error-model-missing-dark");
    await page.getByTestId("problem").getByRole("button").click();
    await expect(page.getByTestId("simple-settings")).toBeVisible();
    await expect(page.locator('[data-model="small"]')).toHaveClass(/downloading|ready/);
    await shot(page, "simple-settings-model-downloading-dark");
  } finally {
    await run.close();
    await mock.close();
  }
});
