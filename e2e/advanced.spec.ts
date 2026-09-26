import { expect, test } from "@playwright/test";
import { launch, overlayPage, setTheme, shot, startMock } from "./harness";

// Advanced level during a meeting: the live checklist in the overlay (on by
// default in Advanced), the meeting tab and the history list.
test("advanced meeting: live checklist, meeting tab, history", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true, env: { AVALET_ADVANCED: "1" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.evaluate(async () => {
      const api = window.avalet!;
      await api.settings.selectProvider("avalet");
      await api.billing.activateTrial();
      await api.settings.setAgenda("Какой лимит: дневной или разовый\nКто подтверждает выше порога\nСроки интеграции");
      await api.settings.setMeetingMode("requirements");
      await api.settings.setOnboardingDone(true);
    });
    await page.reload();
    await page.getByTestId("advanced-settings").waitFor();
    await page.getByRole("button", { name: /^(Старт|Start)$/ }).click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    await expect(page.locator(".segment")).toHaveCount(3, { timeout: 20_000 });

    await overlay.locator(".tracker-toggle").click();
    await overlay.getByRole("button", { name: /Обновить сейчас|Update now/ }).click();
    await expect(overlay.locator(".tracker-list li.closed")).toHaveCount(1, { timeout: 20_000 });
    await expect(overlay.locator(".tracker-list li.proposed")).toHaveCount(1);
    await shot(overlay, "overlay-advanced-checklist-dark");
    await setTheme(page, "light");
    await shot(overlay, "overlay-advanced-checklist-light");
    await setTheme(page, "dark");
    await overlay.locator(".tracker-toggle").click();
    await shot(overlay, "overlay-advanced-expanded-dark");
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
