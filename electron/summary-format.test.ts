import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_MARKER, VisibleTextStream, buildProtocolMarkdown, meetingClock, parseAgendaText, splitSummary } from "./summary-format.js";
import type { Meeting } from "./meetings-store.js";

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

test("the protocol shows each quote under its agenda item and action, with speaker and time", () => {
  const startedAt = 1_700_000_000_000;
  const meeting: Meeting = {
    id: "m",
    title: "Лимиты",
    startedAt,
    mode: "review",
    context: "",
    transcript: [],
    summary: "Обсуждения\n- лимиты",
    agenda: ["Кто подтверждает", "Сроки"],
    agendaStatus: [
      { question: "Кто подтверждает", closed: true, note: "риск-менеджер", quote: "Подтверждает дежурный риск-менеджер", speaker: "other", at: startedAt + 724_000 },
      { question: "Сроки", closed: false, note: "" },
    ],
    actions: [{ id: "1", task: "Прислать описание", owner: "Я", due: "пятница", state: "confirmed", quote: "Я пришлю описание до пятницы", speaker: "me", at: startedAt + 3_600_000 }],
  };
  const labels = {
    date: "Дата", mode: "Режим", participants: "Участники", agenda: "Повестка", discussions: "Обсуждения", actions: "Задачи",
    actionTask: "Задача", actionOwner: "Кто", actionDue: "Срок", agendaClosed: "закрыт", agendaOpen: "открыт", me: "Я", other: "Собеседник",
  };
  const md = buildProtocolMarkdown(meeting, labels, "Ревью", ["Обсуждения"]);
  assert.match(md, /- \[x\] Кто подтверждает \(риск-менеджер\)\n  > «Подтверждает дежурный риск-менеджер» \(Собеседник, 00:12:04\)/);
  assert.match(md, /- \[ \] Сроки\n/);
  assert.match(md, /> \*\*Прислать описание\*\*: «Я пришлю описание до пятницы» \(Я, 01:00:00\)/);
  assert.equal(meetingClock(startedAt - 5, startedAt), "00:00:00");
});
