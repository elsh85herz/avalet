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

    // Every quick action is one click away in Simple; "Clarifying question" is the highlighted one.
    await expect(overlay.locator(".quick-actions button")).toHaveCount(4);
    await expect(overlay.locator(".quick-actions button.primary")).toHaveCount(1);

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

// Simple is the same working product with fewer settings: every control used
// during a meeting is in the Simple overlay and works.
test("simple overlay: auto, language, opacity, pause, end are there and work", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await skipWizardWithTrial(page);
    // Auto off before the call: speech is recorded, no suggestion comes by itself.
    await page.evaluate(() => window.avalet!.settings.setAutoDetect(false));
    await page.getByTestId("start").click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    for (const id of ["overlay-auto", "overlay-language", "overlay-opacity", "overlay-pause", "overlay-end", "overlay-screenshot", "overlay-notes"]) {
      await expect(overlay.getByTestId(id), id).toBeVisible();
    }
    // Icon-only controls still have a name for screen readers and a tooltip.
    for (const id of ["overlay-screenshot", "overlay-notes", "overlay-language", "overlay-auto"]) {
      await expect(overlay.getByTestId(id)).toHaveAttribute("aria-label", /\S/);
      await expect(overlay.getByTestId(id)).toHaveAttribute("title", /\S/);
    }
    await expect(overlay.getByTestId("overlay-pause")).toHaveText(/Пауза|Pause/);
    await expect(overlay.getByTestId("overlay-end")).toHaveText(/Завершить|End/);
    await expect(overlay.getByTestId("overlay-auto")).toHaveAttribute("aria-pressed", "false");

    await expect(page.locator(".segment")).toHaveCount(3, { timeout: 20_000 });
    await overlay.waitForTimeout(3_000);
    await expect(overlay.locator(".block-text")).toHaveCount(0);
    await shot(overlay, "overlay-simple-auto-off-dark");
    // "Process now" appears with Auto off and produces the suggestion on request.
    await overlay.locator(".process-btn").click();
    await expect(overlay.locator(".block-text")).toContainText(/Уточните|экране/, { timeout: 20_000 });
    await overlay.getByTestId("overlay-auto").click();
    await expect(overlay.getByTestId("overlay-auto")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(async () => (await window.avalet!.settings.getAll()).autoDetectEnabled)).toBe(true);

    // Opacity from the overlay drives the saved setting.
    await overlay.getByTestId("overlay-opacity").fill("0.6");
    await expect.poll(() => page.evaluate(async () => (await window.avalet!.settings.getAll()).overlayOpacity)).toBeCloseTo(0.6);
    // Language button switches the interface.
    await overlay.getByTestId("overlay-language").click();
    await expect(overlay.getByTestId("overlay-pause")).toHaveText("Pause");
    await overlay.getByTestId("overlay-language").click();
    await expect(overlay.getByTestId("overlay-pause")).toHaveText("Пауза");
    await overlay.getByTestId("overlay-opacity").fill("1");
    await shot(overlay, "overlay-simple-controls-dark");

    // Pause from the overlay: the main window shows it, the strip keeps Resume and End.
    await overlay.getByTestId("overlay-pause").click();
    await expect(page.getByTestId("session-status")).toContainText(/Пауза|Paused/);
    await expect(overlay.getByTestId("overlay-pause")).toHaveText(/Продолжить|Resume/);
    await expect(overlay.getByTestId("overlay-end")).toBeVisible();
    await shot(overlay, "overlay-simple-strip-paused-dark");
    await overlay.getByTestId("overlay-pause").click();
    await expect(page.getByTestId("session-status")).toContainText(/Слушаю|Listening/);

    // From any screen of the main window Pause is one click away.
    await page.getByRole("button", { name: /^(История|History)$/ }).click();
    await page.getByTestId("header-pause").click();
    await expect(overlay.getByTestId("overlay-pause")).toHaveText(/Продолжить|Resume/);
    await page.getByTestId("header-pause").click();
    await expect(overlay.getByTestId("overlay-pause")).toHaveText(/Пауза|Pause/);
    await page.getByRole("button", { name: /^(Встреча|Meeting)$/ }).click();

    // End from the overlay closes the meeting and hides the overlay.
    await overlay.getByTestId("overlay-end").click();
    await expect(page.getByTestId("session-status")).toContainText(/Всё готово|Ready/);
    await expect
      .poll(() =>
        run.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes("overlay.html") && w.isVisible()),
        ),
      )
      .toBe(false);
    const meetings = await page.evaluate(() => window.avalet!.meetings.list());
    expect(meetings.length).toBe(1);
    expect(meetings[0].endedAt).toBeTruthy();
  } finally {
    await run.close();
    await mock.close();
  }
});
