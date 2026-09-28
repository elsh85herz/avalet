import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTrackerReply,
  buildTrackerSystemPrompt,
  locateQuote,
  mergeSummaryAnalysis,
  parseTrackerReply,
  reconcileAgenda,
  sameTask,
  shouldRunTracker,
  TRACKER_MAX_GAP_MS,
  TRACKER_MIN_GAP_MS,
} from "./live-tracker-logic.js";
import type { ActionItem, AgendaStatusItem } from "./summary-format.js";
import type { TranscriptSegment } from "./shared/ipc-contract.js";
import { MEETING_MODES } from "./modes.js";

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

// --- quotes: what was actually said, next to the short verdict ---

const T0 = 1_700_000_000_000;
const segments: TranscriptSegment[] = [
  { at: T0 + 1_000, speaker: "me", text: "Кто подтверждает изменение лимита выше порога?" },
  { at: T0 + 6_000, speaker: "other", text: "Выше пятидесяти тысяч подтверждает" },
  { at: T0 + 9_000, speaker: "other", text: "дежурный риск-менеджер, в течение часа." },
  { at: T0 + 15_000, speaker: "me", text: "Хорошо. Я пришлю описание процесса до пятницы." },
];
const locate = (quote: string) => locateQuote(quote, segments);

test("parseTrackerReply captures a quote on agenda changes and actions, and strips wrapping quote marks", () => {
  const reply = parseTrackerReply(
    '{"agenda":[{"index":1,"state":"closed","note":"риск-менеджер, выше 50 тыс.","quote":"«Выше пятидесяти тысяч подтверждает дежурный риск-менеджер»"}],"actions":[{"task":"Прислать описание процесса","owner":"Я","due":"до пятницы","quote":"Я пришлю описание процесса до пятницы."}]}',
  );
  assert.equal(reply?.agenda[0]?.quote, "Выше пятидесяти тысяч подтверждает дежурный риск-менеджер");
  assert.equal(reply?.actions[0]?.quote, "Я пришлю описание процесса до пятницы.");
});

test("parseTrackerReply still works when the model omits the quote or sends junk in it", () => {
  const reply = parseTrackerReply(
    '{"agenda":[{"index":1,"state":"closed","note":"да"},{"index":2,"state":"active","note":"","quote":42},{"index":3,"state":"active","note":"","quote":"  "}],"actions":[{"task":"Сделать","owner":"","due":"","quote":null}]}',
  );
  assert.deepEqual(reply?.agenda, [
    { index: 1, state: "closed", note: "да" },
    { index: 2, state: "active", note: "" },
    { index: 3, state: "active", note: "" },
  ]);
  assert.deepEqual(reply?.actions, [{ task: "Сделать", owner: "", due: "" }]);
});

test("locateQuote finds a sentence split across two segments: time of the first, speaker of the best match", () => {
  const found = locate("Выше пятидесяти тысяч подтверждает дежурный риск-менеджер, в течение часа");
  assert.equal(found?.at, T0 + 6_000);
  assert.equal(found?.speaker, "other");
  const action = locate("Я пришлю описание процесса до пятницы");
  assert.equal(action?.at, T0 + 15_000);
  assert.equal(action?.speaker, "me");
});

test("locateQuote tolerates small wording differences but drops a quote nobody said", () => {
  assert.ok(locate("выше пятидесяти тысяч подтверждает дежурный риск-менеджер"));
  assert.equal(locate("Лимит утверждает финансовый директор раз в квартал"), null);
  assert.equal(locate(""), null);
  assert.equal(locateQuote("что угодно", []), null);
});

test("applyTrackerReply stores a grounded quote with speaker and time, drops an ungrounded one", () => {
  const statuses: AgendaStatusItem[] = [
    { question: "Кто подтверждает выше порога", closed: false, note: "" },
    { question: "Сроки интеграции", closed: false, note: "" },
  ];
  const out = applyTrackerReply(
    statuses,
    [],
    {
      agenda: [
        { index: 1, state: "closed", note: "риск-менеджер", quote: "Выше пятидесяти тысяч подтверждает дежурный риск-менеджер" },
        { index: 2, state: "active", note: "ждут ответа", quote: "Интеграцию запустим в третьем квартале" },
      ],
      actions: [{ task: "Прислать описание процесса", owner: "Я", due: "до пятницы", quote: "Я пришлю описание процесса до пятницы." }],
    },
    id,
    locate,
  );
  assert.equal(out.agendaStatus[0].quote, "Выше пятидесяти тысяч подтверждает дежурный риск-менеджер");
  assert.equal(out.agendaStatus[0].speaker, "other");
  assert.equal(out.agendaStatus[0].at, T0 + 6_000);
  assert.equal(out.agendaStatus[1].active, true);
  assert.equal(out.agendaStatus[1].quote, undefined, "not in the transcript: dropped");
  assert.equal(out.actions[0].quote, "Я пришлю описание процесса до пятницы.");
  assert.equal(out.actions[0].speaker, "me");
  assert.equal(out.actions[0].state, "proposed");
});

test("quotes do not change the old rules: forward only, manual untouched, closed kept, no duplicate tasks", () => {
  const statuses: AgendaStatusItem[] = [
    { question: "A", closed: true, note: "done", quote: "старая цитата", speaker: "other", at: T0 },
    { question: "B", closed: false, note: "", manual: true },
    { question: "C", closed: false, note: "", active: true, quote: "что обсуждали", speaker: "me", at: T0 },
  ];
  const out = applyTrackerReply(
    statuses,
    [{ id: "a", task: "Прислать описание процесса", owner: "Я", due: "", state: "confirmed" }],
    {
      agenda: [
        { index: 1, state: "active", note: "x", quote: "Выше пятидесяти тысяч подтверждает" },
        { index: 2, state: "closed", note: "x", quote: "Выше пятидесяти тысяч подтверждает" },
        { index: 3, state: "closed", note: "решили" },
      ],
      actions: [{ task: "Прислать описание процесса заказчику", owner: "Я", due: "", quote: "Я пришлю описание процесса до пятницы." }],
    },
    id,
    locate,
  );
  assert.equal(out.agendaStatus[0].quote, "старая цитата", "closed item is not touched");
  assert.equal(out.agendaStatus[1].closed, false, "manual item is not touched");
  assert.equal(out.agendaStatus[1].quote, undefined);
  assert.equal(out.agendaStatus[2].closed, true);
  assert.equal(out.agendaStatus[2].quote, "что обсуждали", "no new quote: the old one stays");
  assert.equal(out.actions.length, 1, "sameTask still de-duplicates");
  assert.equal(out.actions[0].quote, undefined);
});

test("mergeSummaryAnalysis keeps live quotes the summary does not have", () => {
  const out = mergeSummaryAnalysis(
    {
      agendaStatus: [{ question: "A", closed: true, note: "live", quote: "сказали так", speaker: "other", at: T0 }],
      actions: [{ id: "4", task: "Завести задачу в Jira", owner: "Я", due: "", state: "proposed", quote: "заведу задачу", speaker: "me", at: T0 }],
    },
    { agendaStatus: [{ question: "A", closed: true, note: "из итогов" }], actions: [{ task: "Завести задачу в Jira", owner: "Я", due: "" }] },
    id,
  );
  assert.equal(out.agendaStatus[0].note, "из итогов");
  assert.equal(out.agendaStatus[0].quote, "сказали так");
  assert.equal(out.agendaStatus[0].at, T0);
  assert.equal(out.actions[0].quote, "заведу задачу");
});

test("the tracker prompt asks for verbatim quotes with a hint for every mode", () => {
  const prompts = MEETING_MODES.map((mode) => buildTrackerSystemPrompt(mode));
  for (const prompt of prompts) {
    assert.match(prompt, /'quote'/);
    assert.match(prompt, /do not paraphrase/);
    assert.match(prompt, /12 words/);
  }
  assert.match(buildTrackerSystemPrompt("review"), /remark or question about the document/);
  assert.match(buildTrackerSystemPrompt("requirements"), /stakeholder's own sentence/);
});
