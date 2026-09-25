import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_MARKER, VisibleTextStream, parseAgendaText, splitSummary } from "./summary-format.js";

test("parseAgendaText strips bullets and numbering, drops blanks", () => {
  assert.deepEqual(parseAgendaText("1. Где лежит JSON?\n- Что в Альфа Метрике\n\n  * Лимит времени  "), [
    "Где лежит JSON?",
    "Что в Альфа Метрике",
    "Лимит времени",
  ]);
});

test("splitSummary parses the JSON tail and matches agenda by index", () => {
  const raw = `Обсуждения\n- что-то\n${ANALYSIS_MARKER}\n\`\`\`json\n{"agenda":[{"index":2,"closed":true,"note":"есть"}],"actions":[{"task":"Прислать пример","owner":"Егор","due":""},{"task":""}]}\n\`\`\``;
  const { protocol, analysis } = splitSummary(raw, ["Первый", "Второй"]);
  assert.equal(protocol, "Обсуждения\n- что-то");
  assert.deepEqual(analysis?.agendaStatus, [
    { question: "Первый", closed: false, note: "" },
    { question: "Второй", closed: true, note: "есть" },
  ]);
  assert.deepEqual(analysis?.actions, [{ task: "Прислать пример", owner: "Егор", due: "" }]);
});

test("splitSummary tolerates a missing or broken tail", () => {
  assert.equal(splitSummary("просто текст", []).analysis, null);
  assert.equal(splitSummary(`текст ${ANALYSIS_MARKER} {broken`, []).analysis, null);
});

test("VisibleTextStream never leaks the marker, even split across chunks", () => {
  const stream = new VisibleTextStream();
  const chunks = ["Итог\n- пункт\n@@AVAL", "ET_JSON@@\n{\"agenda\":[]}"];
  const shown = chunks.map((c) => stream.push(c)).join("");
  assert.equal(shown, "Итог\n- пункт\n");
});

test("VisibleTextStream releases held-back characters that were not the marker", () => {
  const stream = new VisibleTextStream();
  const shown = [stream.push("цена @@"), stream.push("AB конец")].join("");
  assert.equal(shown, "цена @@AB конец");
});
