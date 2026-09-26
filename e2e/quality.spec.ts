import { expect, test, type Page } from "@playwright/test";
import { launch, overlayPage, setTheme, skipWizardWithTrial, startMock } from "./harness";
import { contrastFailures } from "./a11y";

async function expectReadable(page: Page, where: string) {
  for (const theme of ["dark", "light"] as const) {
    await setTheme(page, theme);
    await page.waitForTimeout(200);
    const failures = await contrastFailures(page);
    expect(failures, `${where}, ${theme} theme: text below WCAG AA contrast`).toEqual([]);
  }
  await setTheme(page, "dark");
}

test("contrast: wizard, Simple home and settings, Advanced settings, overlay in both themes", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 1400 });
    await expectReadable(page, "wizard step 1");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("choice-avalet").click();
    await expectReadable(page, "wizard step 2");
    await page.evaluate(() => window.avalet!.settings.setOnboardingDone(true));
    await page.reload();
    await page.getByTestId("simple-home").waitFor();
    await expectReadable(page, "simple home");
    await page.getByTestId("open-settings").click();
    await expectReadable(page, "simple settings");
    await page.getByTestId("to-advanced").click();
    await page.getByTestId("advanced-settings").waitFor();
    await expectReadable(page, "advanced settings");
    await page.evaluate(() => window.avalet!.session.start());
    const overlay = await overlayPage(run.app);
    await overlay.locator(".block-text").waitFor({ timeout: 20_000 });
    await expectReadable(overlay, "overlay");
  } finally {
    await run.close();
    await mock.close();
  }
});

test("keyboard: the wizard can be finished with Tab and Enter only, focus is visible", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 480, height: 820 });
    await page.getByTestId("wizard").waitFor();
    const focusTo = async (testId: string) => {
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const current = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
        if (current === testId) {
          const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
          expect(outline, `focus ring on ${testId}`).not.toBe("none");
          return;
        }
      }
      throw new Error(`Tab never reached ${testId}`);
    };
    for (let step = 1; step <= 3; step++) {
      await focusTo("wizard-next");
      await page.keyboard.press("Enter");
    }
    await expect(page.getByTestId("wizard")).toHaveAttribute("data-step", "4");
    await focusTo("try-it");
    await focusTo("wizard-next");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("simple-home")).toBeVisible();
    await focusTo("start");
  } finally {
    await run.close();
    await mock.close();
  }
});

test("no layout jump while a suggestion streams in the overlay", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true });
  const page = run.main;
  try {
    await skipWizardWithTrial(page);
    await page.getByTestId("start").click();
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 560 });
    await overlay.locator(".ask-row").waitFor();
    const positions = async () =>
      overlay.evaluate(() =>
        [".overlay-header", ".overlay-navrow", ".quick-actions", ".ask-row"].map((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return r ? Math.round(r.top) : -1;
        }),
      );
    const before = await positions();
    await overlay.locator(".block-text").waitFor({ timeout: 20_000 });
    await overlay.waitForTimeout(300);
    const after = await positions();
    expect(after).toEqual(before);
  } finally {
    await run.close();
    await mock.close();
  }
});
