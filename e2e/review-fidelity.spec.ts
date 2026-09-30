import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, setTheme, shot, startMock, useOwnKey } from "./harness";

// Honest review summaries (CLOUD_TASK_6) on a synthetic "parcel" call: a map
// decision that does not say what its key is, a question asked three times and
// deferred, a role that contradicts the briefing, doubled lines and an invented
// credit line. The fake recognizer and the mock model are scripted; the checks
// are about what the app parses, shows and marks, not about model quality.

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const PARCEL = JSON.parse(fs.readFileSync(path.join(FIXTURES, "parcel-call.json"), "utf8")) as { briefing: string; lines: unknown[] };
const SPEC = fs.readFileSync(path.join(FIXTURES, "spec-parcel.md"), "utf8");

test("review fidelity: open questions with a count, unpinned terms marked, the briefing contradiction listed, one line per utterance", async () => {
  const mock = await startMock();
  const run = await launch(mock, { readyModel: true, env: { FAKE_SIDECAR_SCRIPT: "parcel", AVALET_TEST_ECHO_HOLD_MS: "0" } });
  const page = run.main;
  try {
    await page.setViewportSize({ width: 560, height: 1000 });
    await page.getByTestId("wizard").waitFor();
    await useOwnKey(page, mock);
    await page.evaluate(
      async ({ briefing, spec }) => {
        const api = window.avalet!;
        await api.settings.setOnboardingDone(true);
        await api.settings.setGuideSeen(true);
        await api.settings.setMeetingMode("review");
        await api.settings.setContext(briefing);
        await api.settings.setArtifact({ name: "spec-parcel.md", text: spec });
      },
      { briefing: PARCEL.briefing, spec: SPEC },
    );
    await page.reload();
    await page.getByTestId("simple-home").waitFor();

    await page.getByTestId("start").click();
    await expect(page.getByTestId("session-status")).toContainText(/Слушаю|Listening/);
    // Live, both copies of the doubled lines and the credit line get through.
    await expect(page.locator(".segment")).toHaveCount(PARCEL.lines.length, { timeout: 40_000 });
    await page.getByTestId("pause").click();
    await page.getByTestId("end").click();

    // After End: one line per utterance, the rest kept and counted.
    await expect(page.locator(".segment")).toHaveCount(PARCEL.lines.length - 3);
    const hidden = page.getByTestId("hidden-lines");
    await expect(hidden).toContainText(/3/);
    await expect(page.locator(".meeting-transcript")).not.toContainText("Редактор субтитров");
    await page.getByTestId("toggle-hidden").click();
    await expect(page.locator(".segment")).toHaveCount(PARCEL.lines.length);
    await expect(page.locator(".segment.filtered")).toHaveCount(3);
    await hidden.scrollIntoViewIfNeeded();
    await shot(page, "review-fidelity-hidden-lines-dark");
    await page.getByTestId("toggle-hidden").click();
    await expect(page.locator(".segment")).toHaveCount(PARCEL.lines.length - 3);

    // Before the summary: the review rules' extra cost, in plain words.
    await expect(page.getByTestId("summary-cost")).toContainText(/вопросы без ответа|unanswered questions/);
    await page.getByRole("button", { name: /Итог встречи|Meeting summary/ }).click();
    const summary = page.locator(".summary-text");
    await expect(summary).toContainText("Новые вопросы и риски", { timeout: 20_000 });
    await expect(summary).toContainText(/Вопрос без ответа: что является ключом мапы.*\(задан 3 раз\)/);
    await expect(summary).toContainText("Вопрос без ответа: сохраняется ли обратная совместимость");
    await expect(summary).toContainText("Расхождение с контекстом: в контексте разработчик и владелец продукта один человек");
    // Participants: roles from the call; the name nobody said is not there.
    const participants = page.getByTestId("participants");
    await expect(participants).toContainText(/по ходу встречи|from the call/);
    await expect(participants).toContainText(/владелец продукта/);
    await expect(participants).not.toContainText("Кирилл");
    await summary.scrollIntoViewIfNeeded();
    await shot(page, "review-fidelity-summary-dark");

    const panel = page.getByTestId("decisions-panel");
    const rows = panel.getByTestId("decision");
    await expect(rows).toHaveCount(3);
    // The map decision: accepted, but its terms are not pinned, so it starts unchecked and is marked.
    await expect(rows.nth(0)).toHaveAttribute("data-status", "accepted");
    await expect(rows.nth(0).getByTestId("decision-include")).not.toBeChecked();
    await expect(rows.nth(0).getByTestId("decision-terms-missing")).toBeVisible();
    // The question asked three times: open, with its count and "не уточнено".
    await expect(rows.nth(1)).toHaveAttribute("data-status", "open");
    await expect(rows.nth(1).getByTestId("decision-asked")).toContainText("3");
    await expect(rows.nth(1).getByTestId("decision-terms-unclear")).toBeVisible();
    await expect(rows.nth(1).getByTestId("decision-include")).not.toBeChecked();
    await expect(rows.nth(2)).toHaveAttribute("data-status", "open");
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "review-fidelity-decisions-dark");

    // The analyst pins the terms by hand; the mark goes, the choice to include stays theirs.
    await rows.nth(0).getByTestId("decision-terms").fill("ключ - значение типа вложения (box, envelope); значение - массив количеств");
    await rows.nth(0).getByTestId("decision-terms").blur();
    await expect(rows.nth(0).getByTestId("decision-terms-missing")).toHaveCount(0);
    await rows.nth(0).getByTestId("decision-include").check();

    // The optional check: cost first, then a confirmation; nothing is sent before Send.
    const check = page.getByTestId("decisions-check");
    await expect(check).toContainText(/токенов|tokens/);
    await page.getByTestId("decisions-check-button").click();
    await expect(page.getByTestId("decisions-check-confirm")).toContainText(/только понизить|only lower/);
    await page.getByTestId("decisions-check-send").click();
    await expect(page.getByTestId("decisions-check-result")).toContainText(/Сверено: 1|Checked: 1/, { timeout: 20_000 });
    // Edited by hand: the check only adds its note, the analyst's row stays as it is.
    await expect(rows.nth(0).getByTestId("decision-check")).toHaveAttribute("data-verdict", "ok");
    await expect(rows.nth(0).getByTestId("decision-include")).toBeChecked();

    // The transcript export: one line per utterance and the count of the rest.
    await page.getByRole("button", { name: /Скачать транскрипт|Download transcript/ }).click();
    await expect.poll(() => fs.readdirSync(run.dirs.exports).filter((f) => f.endsWith("transcript.txt")).length).toBe(1);
    const transcript = fs.readFileSync(path.join(run.dirs.exports, fs.readdirSync(run.dirs.exports).find((f) => f.endsWith("transcript.txt"))!), "utf8");
    expect(transcript).not.toContain("Редактор субтитров");
    expect(transcript.match(/сделать мапу/g)?.length).toBe(1);
    expect(transcript).toMatch(/Строк убрано как шум распознавания: 3|Lines left out as recognition noise: 3/);

    await setTheme(page, "light");
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "review-fidelity-decisions-light");
    await setTheme(page, "dark");
  } finally {
    await run.close();
    await mock.close();
  }
});
