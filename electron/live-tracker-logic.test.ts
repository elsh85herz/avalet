import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTrackerReply,
  mergeSummaryAnalysis,
  parseTrackerReply,
  reconcileAgenda,
  sameTask,
  shouldRunTracker,
  TRACKER_MAX_GAP_MS,
  TRACKER_MIN_GAP_MS,
} from "./live-tracker-logic.js";
import type { ActionItem, AgendaStatusItem } from "./summary-format.js";

let n = 0;
const id = () => `id${++n}`;

test("tracker runs on a pause, but not too often and not on little speech", () => {
  const base = { now: 1_000_000, lastRunAt: 1_000_000 - TRACKER_MIN_GAP_MS - 1, newChars: 300, endsWithPause: true };
  assert.equal(shouldRunTracker(base), true);
  assert.equal(shouldRunTracker({ ...base, newChars: 20 }), false);
  assert.equal(shouldRunTracker({ ...base, lastRunAt: base.now - 10_000 }), false);
  assert.equal(shouldRunTracker({ ...base, endsWithPause: false }), false);
  assert.equal(shouldRunTracker({ ...base, endsWithPause: false, lastRunAt: base.now - TRACKER_MAX_GAP_MS }), true);
});

test("parseTrackerReply tolerates fences and drops junk entries", () => {
  const reply = parseTrackerReply(
    'Вот:\n```json\n{"agenda":[{"index":2,"state":"closed","note":"до пятницы"},{"index":"x","state":"closed"},{"index":1,"state":"weird"}],"actions":[{"task":" Прислать спеку ","owner":"Вася"},{"owner":"?"}]}\n```',
  );
  assert.deepEqual(reply?.agenda, [{ index: 2, state: "closed", note: "до пятницы" }]);
  assert.deepEqual(reply?.actions, [{ task: "Прислать спеку", owner: "Вася", due: "" }]);
  assert.equal(parseTrackerReply("no json here"), null);
  assert.equal(parseTrackerReply("{broken"), null);
});

test("sameTask matches rewordings and rejects different tasks", () => {
  assert.equal(sameTask("Прислать спецификацию по API", "Отправить спецификацию API"), true);
  assert.equal(sameTask("Прислать спецификацию по API", "Согласовать сроки релиза"), false);
});

test("reconcileAgenda keeps known statuses and adds open ones for new questions", () => {
  const prev: AgendaStatusItem[] = [{ question: "A", closed: true, note: "ok", manual: true }];
  const out = reconcileAgenda(["A", "B"], prev);
  assert.equal(out[0].manual, true);
  assert.deepEqual(out[1], { question: "B", closed: false, note: "" });
});

test("applyTrackerReply moves marks forward only and skips hand-set ones", () => {
  const statuses: AgendaStatusItem[] = [
    { question: "A", closed: true, note: "done" },
    { question: "B", closed: false, note: "" },
    { question: "C", closed: false, note: "", manual: true },
  ];
  const out = applyTrackerReply(
    statuses,
    [],
    {
      agenda: [
        { index: 1, state: "active", note: "" },
        { index: 2, state: "active", note: "спорят про сроки" },
        { index: 3, state: "closed", note: "x" },
        { index: 9, state: "closed", note: "" },
      ],
      actions: [],
    },
    id,
  );
  assert.equal(out.agendaStatus[0].closed, true);
  assert.equal(out.agendaStatus[0].active, undefined);
  assert.equal(out.agendaStatus[1].active, true);
  assert.equal(out.agendaStatus[2].closed, false);
});

test("applyTrackerReply adds new actions as proposed and never duplicates or revives dismissed ones", () => {
  const actions: ActionItem[] = [
    { id: "a", task: "Прислать спецификацию", owner: "Вася", due: "", state: "confirmed" },
    { id: "b", task: "Согласовать сроки релиза", owner: "", due: "", state: "dismissed" },
  ];
  const out = applyTrackerReply(
    [],
    actions,
    {
      agenda: [],
      actions: [
        { task: "Прислать спецификацию по API", owner: "Вася", due: "" },
        { task: "Согласовать сроки релиза с командой", owner: "", due: "" },
        { task: "Завести задачу в Jira", owner: "Я", due: "завтра" },
      ],
    },
    id,
  );
  assert.equal(out.actions.length, 3);
  assert.deepEqual(out.actions[2].state, "proposed");
  assert.equal(out.actions[2].task, "Завести задачу в Jira");
});

test("mergeSummaryAnalysis keeps hand marks, confirmed and dismissed actions", () => {
  const existing = {
    agendaStatus: [
      { question: "A", closed: true, note: "вручную", manual: true },
      { question: "B", closed: true, note: "live", active: false },
    ],
    actions: [
      { id: "1", task: "Прислать спецификацию", owner: "Вася", due: "", state: "confirmed" as const },
      { id: "2", task: "Согласовать сроки релиза", owner: "", due: "", state: "dismissed" as const },
      { id: "3", task: "Ложная задача про базу", owner: "", due: "", state: "proposed" as const },
      { id: "4", task: "Завести задачу в Jira", owner: "Я", due: "", state: "proposed" as const },
    ],
  };
  const fresh = {
    agendaStatus: [
      { question: "A", closed: false, note: "" },
      { question: "B", closed: false, note: "" },
    ],
    actions: [
      { task: "Прислать спецификацию API", owner: "Вася", due: "" },
      { task: "Согласовать сроки релиза", owner: "", due: "" },
      { task: "Завести задачу в Jira", owner: "Я", due: "" },
      { task: "Обновить диаграмму", owner: "Я", due: "" },
    ],
  };
  const out = mergeSummaryAnalysis(existing, fresh, id);
  assert.equal(out.agendaStatus[0].closed, true);
  assert.equal(out.agendaStatus[0].note, "вручную");
  assert.equal(out.agendaStatus[1].closed, false);
  const tasks = out.actions.map((a) => `${a.state}:${a.task}`);
  assert.deepEqual(tasks, [
    "confirmed:Прислать спецификацию",
    "proposed:Завести задачу в Jira",
    "proposed:Обновить диаграмму",
    "dismissed:Согласовать сроки релиза",
  ]);
  assert.equal(out.actions[1].id, "4");
});
