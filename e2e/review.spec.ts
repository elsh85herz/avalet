import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, overlayPage, setTheme, shot, startMock, useOwnKey } from "./harness";

// Review mode as a spec-sync workflow (CLOUD_TASK_5): a synthetic document
// loaded before Start, a scripted call (fake recognizer), decisions from the
// summary, edits, reviewed patches, apply, downloads. Mock model only.

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "spec-activity-journal.md");
const SPEC = fs.readFileSync(FIXTURE, "utf8");

test("review: document in, decisions checklist, reviewed patches out, both downloads", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true, env: { FAKE_SIDECAR_SCRIPT: "review" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 560, height: 1000 });
    await page.getByTestId("wizard").waitFor();
    await useOwnKey(page, mock);
    await page.evaluate(async () => {
      const api = window.avalet!;
      await api.settings.setOnboardingDone(true);
      await api.settings.setGuideSeen(true);
      await api.settings.setMeetingMode("requirements");
    });
    await page.reload();
    await page.getByTestId("simple-home").waitFor();

    // Other modes: no document field, no cost note.
    await expect(page.getByTestId("artifact-field")).toHaveCount(0);
    await page.locator("#simple-mode").selectOption("review");
    const field = page.getByTestId("artifact-field");
    await expect(field).toBeVisible();
    await expect(page.getByTestId("artifact-cost")).toHaveCount(0);

    // Load the file: name, size and the cost, before anything is spent.
    await page.getByTestId("artifact-file").setInputFiles(FIXTURE);
    await expect(page.getByTestId("artifact-size")).toContainText("spec-activity-journal.md");
    const cost = page.getByTestId("artifact-cost");
    await expect(cost).toContainText(/токенов|tokens/);
    await expect(cost).toContainText(/два раза|twice/);
    expect(await page.evaluate(() => window.avalet!.settings.getArtifact().then((d) => d.text.length))).toBe(SPEC.length);
    await field.scrollIntoViewIfNeeded();
    await shot(page, "review-document-loaded-dark");

    await page.getByTestId("start").click();
    await expect(page.getByTestId("session-status")).toContainText(/Слушаю|Listening/);
    // Fixed while the meeting runs.
    await expect(page.getByTestId("artifact-text")).toHaveAttribute("readonly", "");
    const overlay = await overlayPage(run.app);
    await overlay.setViewportSize({ width: 380, height: 600 });

    await expect(page.locator(".segment")).toHaveCount(3, { timeout: 20_000 });
    // A typed question: the review answer puts remarks, proposals and decisions on the board.
    await overlay.locator(".ask-row input").fill("Что сейчас в разделе 3.1?");
    await overlay.locator(".ask-row input").press("Enter");
    const board = overlay.getByTestId("mode-board");
    await expect(board).toContainText(/Предложения 1|Proposals 1/, { timeout: 20_000 });
    await board.locator(".tracker-toggle").click();
    await expect(board.locator("[data-section=proposals] li")).toHaveCount(1);
    await shot(overlay, "overlay-review-proposals-dark");

    await page.getByTestId("pause").click();
    await expect(page.locator(".segment")).toHaveCount(4, { timeout: 10_000 });
    await page.getByTestId("end").click();

    // Before the summary is asked for: the extra cost of the document.
    await expect(page.getByTestId("summary-cost")).toContainText(/токенов|tokens/);
    const panel = page.getByTestId("decisions-panel");
    await expect(panel).toContainText(/Решений пока нет|No decisions yet/);
    await page.getByRole("button", { name: /Итог встречи|Meeting summary/ }).click();
    await expect(page.locator(".summary-text")).toContainText("Решения по открытым вопросам", { timeout: 20_000 });

    const rows = panel.getByTestId("decision");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute("data-status", "accepted");
    await expect(rows.nth(0).getByTestId("decision-include")).toBeChecked();
    await expect(rows.nth(0).getByTestId("decision-section")).toHaveValue("3.1 GET /activities");
    await expect(rows.nth(0).getByTestId("decision-quote")).toContainText("Согласен, поднимаем до 100 записей");
    await expect(rows.nth(1)).toHaveAttribute("data-status", "proposed");
    await expect(rows.nth(1).getByTestId("decision-include")).not.toBeChecked();
    await expect(rows.nth(2).getByTestId("decision-include")).not.toBeChecked();
    // Simple: was/becomes folded under Details.
    await expect(rows.nth(0).locator("details.decision-details")).toHaveCount(1);
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "review-decisions-dark");

    // Correct the checklist: include the proposal, reword it, delete the open question.
    await rows.nth(1).getByTestId("decision-include").check();
    await rows.nth(1).getByTestId("decision-text").fill("В разделе 3.2 добавить выгрузку в XLSX кроме CSV");
    await rows.nth(1).getByTestId("decision-text").blur();
    await rows.nth(2).getByTestId("decision-delete").click();
    await expect(rows).toHaveCount(2);
    await expect.poll(async () => {
      const m = await page.evaluate(() => window.avalet!.meetings.list().then((l) => window.avalet!.meetings.get(l[0]!.id)));
      return m?.decisions?.filter((d) => d.manual).length;
    }).toBe(2);

    // Update the document: the cost, a confirmation, then the preview.
    await expect(page.getByTestId("artifact-update-cost")).toContainText(/токенов|tokens/);
    await page.getByTestId("artifact-update-button").click();
    const confirm = page.getByTestId("artifact-confirm");
    await expect(confirm).toContainText(/Всего примерно|About .* tokens in all/);
    await confirm.scrollIntoViewIfNeeded();
    await shot(page, "review-update-confirm-dark");
    await page.getByTestId("artifact-confirm-send").click();
    const preview = page.getByTestId("patch-preview");
    await expect(preview.getByTestId("patch")).toHaveCount(2, { timeout: 20_000 });
    await expect(preview.getByTestId("patch").nth(0).getByTestId("patch-old")).toHaveText("не более 50 записей");
    await expect(preview.getByTestId("patch").nth(0).getByTestId("patch-new")).toHaveText("не более 100 записей");
    await preview.scrollIntoViewIfNeeded();
    await shot(page, "review-patch-preview-dark");

    // Nothing is written until Apply; then only the checked patches.
    expect(await page.evaluate(() => window.avalet!.meetings.list().then((l) => window.avalet!.meetings.get(l[0]!.id)).then((m) => m?.artifactResult ?? null))).toBeNull();
    await preview.getByTestId("patch").nth(1).getByTestId("patch-include").uncheck();
    await page.getByTestId("patch-apply").click();
    await expect(page.getByTestId("artifact-result")).toContainText(/Применено правок: 1|Changes applied: 1/);
    await page.getByTestId("artifact-result").scrollIntoViewIfNeeded();
    await shot(page, "review-updated-dark");

    await page.getByTestId("artifact-download").click();
    const updatedFile = path.join(run.dirs.exports, "spec-activity-journal (updated).md");
    await expect.poll(() => fs.existsSync(updatedFile)).toBe(true);
    expect(fs.readFileSync(updatedFile, "utf8")).toBe(SPEC.replace("не более 50 записей", "не более 100 записей"));

    await page.getByTestId("decisions-download").click();
    await expect.poll(() => fs.readdirSync(run.dirs.exports).filter((f) => f.endsWith("decisions.md")).length).toBe(1);
    const decisions = fs.readFileSync(path.join(run.dirs.exports, fs.readdirSync(run.dirs.exports).find((f) => f.endsWith("decisions.md"))!), "utf8");
    expect(decisions).toContain("## 1. В разделе 3.1 поднять размер страницы до 100 записей");
    expect(decisions).toContain("## 2. В разделе 3.2 добавить выгрузку в XLSX кроме CSV");
    expect(decisions).not.toContain("Срок хранения 180 дней согласовать");

    // Undo: back to the original.
    await page.getByTestId("artifact-revert").click();
    await expect(page.getByTestId("artifact-result")).toHaveCount(0);

    await setTheme(page, "light");
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "review-decisions-light");
    await setTheme(page, "dark");
  } finally {
    await run.close();
    await mock.close();
  }
});
