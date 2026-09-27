import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_SECTION_LIMIT, MODE_BOARD, boardText, extractBoard, hasBoard } from "../src/renderer/lib/mode-board.js";
import { MODE_INSTRUCTIONS } from "../electron/modes.js";
import { QUICK_ACTIONS, quickActionsFor } from "../src/renderer/live/quick-actions.js";

test("requirements: candidate requirements and risks, in order, without repeats", () => {
  const board = extractBoard("requirements", [
    "Требование: клиент меняет дневной лимит в приложении.\nНе хватает: порог подтверждения.",
    "- **Требование:** изменение выше порога подтверждает колл-центр\n1. Риск: нет отката, если звонок не состоялся",
    "требование:  клиент меняет  дневной лимит в приложении",
    "Слово Требование: в середине строки не считается? Нет, строка начинается с него.",
  ]);
  assert.deepEqual(board, [
    {
      key: "requirements",
      items: ["клиент меняет дневной лимит в приложении.", "изменение выше порога подтверждает колл-центр"],
    },
    { key: "risks", items: ["нет отката, если звонок не состоялся"] },
  ]);
});

test("a marker inside a sentence is not an item", () => {
  const board = extractBoard("grooming", ["Команда говорит, что Срез: это не тот случай.", "это уже отдельная задача: миграция"]);
  assert.deepEqual(
    board.map((s) => s.items.length),
    [0, 0, 0],
  );
});

test("grooming: slices, separate tasks and risks; demo: deviations and checks; review: remarks and decisions", () => {
  const grooming = extractBoard("grooming", [
    "Срез: выгрузка отчёта без фильтров. Критерий: файл открывается в Excel.\nОтдельная задача: права доступа к отчёту\nRisk: backfill for old data",
  ]);
  assert.deepEqual(
    grooming.map((s) => [s.key, s.items.length]),
    [
      ["slices", 1],
      ["separate", 1],
      ["risks", 1],
    ],
  );
  const demo = extractBoard("demo", ["Попросите показать: пустой список\nОтклонение: по требованию 3 должна быть сортировка, показано без неё"]);
  assert.deepEqual(demo.map((s) => s.items), [["по требованию 3 должна быть сортировка, показано без неё"], ["пустой список"]]);
  const review = extractBoard("review", ["Замечание: раздел 2, уточнить термин, Ольга\nРешение: принято, срок пятница"]);
  assert.deepEqual(review.map((s) => s.key), ["remarks", "decisions"]);
});

test("free and interview have no board; a long meeting keeps the newest items", () => {
  assert.equal(hasBoard("free"), false);
  assert.equal(hasBoard("interview"), false);
  assert.deepEqual(extractBoard("interview", ["Требование: x"]), []);
  const many = Array.from({ length: BOARD_SECTION_LIMIT + 5 }, (_, i) => `Требование: пункт ${i}`);
  const items = extractBoard("requirements", many)[0]!.items;
  assert.equal(items.length, BOARD_SECTION_LIMIT);
  assert.equal(items.at(-1), `пункт ${BOARD_SECTION_LIMIT + 4}`);
});

test("clipboard text lists only sections with items", () => {
  const text = boardText(extractBoard("requirements", ["Требование: a\nТребование: b"]), {
    requirements: "Требования",
    risks: "Риски",
    slices: "",
    separate: "",
    deviations: "",
    checks: "",
    remarks: "",
    decisions: "",
  });
  assert.equal(text, "Требования\n- a\n- b");
});

test("every Russian board marker is asked for by that mode's prompt or its quick actions", () => {
  for (const [mode, sections] of Object.entries(MODE_BOARD)) {
    const prompts = [MODE_INSTRUCTIONS[mode as keyof typeof MODE_INSTRUCTIONS], ...quickActionsFor(mode as never).map((a) => a.prompt)].join("\n");
    for (const section of sections!) assert.ok(prompts.includes(`'${section.markers[0]}:`), `${mode}: ${section.markers[0]}`);
  }
});

test("quick actions: requirements keeps Risks; in grooming the Risks button also asks about hidden work; interview has none", () => {
  assert.ok(quickActionsFor("requirements").some((a) => a.key === "risks"));
  assert.deepEqual(
    quickActionsFor("grooming").map((a) => a.key),
    ["summarize", "hiddenWork", "askQuestion", "explainThis"],
  );
  assert.deepEqual(quickActionsFor("interview"), []);
  assert.deepEqual(quickActionsFor("free"), QUICK_ACTIONS);
});
