import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { groundDecisions, mergeDecisions, sanitizeDecisions } from "./decisions.js";
import type { Decision, Meeting } from "./shared/ipc-contract.js";
import type { RawDecision } from "./summary-format.js";
import { fixturePath } from "./testing/stores.js";

// Decisions from the review summary, held to the transcript and the document (CLOUD_TASK_5 phase 2).

const SPEC = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8");
const T0 = Date.UTC(2026, 8, 30, 10, 0, 0);
const meeting: Pick<Meeting, "transcript" | "startedAt" | "endedAt" | "artifact"> = {
  startedAt: T0,
  endedAt: T0 + 600_000,
  artifact: { name: "spec.md", text: SPEC },
  transcript: [
    { at: T0 + 10_000, speaker: "other", text: "По разделу 3.1: пятидесяти записей на страницу мало, предлагаю поднять лимит до 100." },
    { at: T0 + 20_000, speaker: "me", text: "Согласен, поднимаем до 100 записей." },
    { at: T0 + 30_000, speaker: "other", text: "И ещё давайте добавим выгрузку в XLSX, не только CSV." },
  ],
};
let n = 0;
const id = () => `id-${++n}`;
const raw = (patch: Partial<RawDecision>): RawDecision => ({
  text: "В разделе 3.1 поднять лимит страницы до 100",
  status: "accepted",
  by: "Собеседник предложил, Я согласился",
  section: "3.1",
  before: "не более 50 записей",
  after: "не более 100 записей",
  quote: "Согласен, поднимаем до 100 записей",
  terms: "",
  atSeconds: 99,
  ...patch,
});

test("a quote found in the transcript sets the time and the speaker from the transcript", () => {
  const [d] = groundDecisions([raw({})], meeting, id);
  assert.equal(d!.at, T0 + 20_000);
  assert.equal(d!.speaker, "me");
  assert.equal(d!.quote, "Согласен, поднимаем до 100 записей");
  assert.equal(d!.section, "3.1 GET /activities");
  assert.equal(d!.include, true);
  assert.equal(d!.ungrounded, undefined);
});

test("an accepted decision whose words are not in the transcript is flagged and not included by default", () => {
  const [invented, unquoted] = groundDecisions(
    [raw({ quote: "Да, делаем бесконечную прокрутку вместо страниц", atSeconds: 40 }), raw({ quote: "" })],
    meeting,
    id,
  );
  for (const d of [invented!, unquoted!]) {
    assert.equal(d.ungrounded, true);
    assert.equal(d.include, false);
    assert.equal(d.quote, undefined, "a quote that was not said is not shown as words");
  }
  // The model's timestamp stays only as a place to look.
  assert.equal(invented!.at, T0 + 40_000);
});

test("only accepted decisions start checked; a section not in the document becomes 'не определён'", () => {
  const out = groundDecisions(
    [
      raw({ status: "proposed", text: "Добавить выгрузку в XLSX", section: "3.2", quote: "давайте добавим выгрузку в XLSX" }),
      raw({ status: "open", text: "Кто согласует хранение", section: "раздел 7.4", quote: "" }),
      raw({ status: "rejected", section: "Хранение", quote: "" }),
    ],
    meeting,
    id,
  );
  assert.deepEqual(out.map((d) => [d.status, d.include, d.section, Boolean(d.ungrounded)]), [
    ["proposed", false, "3.2 POST /activities/export", false],
    ["open", false, "не определён", false],
    ["rejected", false, "4 Хранение", false],
  ]);
  // A timestamp far beyond the end of the call is not a jump target.
  assert.equal(groundDecisions([raw({ quote: "", atSeconds: 99_999 })], meeting, id)[0]!.at, undefined);
});

test("a new summary keeps hand-edited, hand-added and deleted rows, and does not bring deleted ones back", () => {
  const base = (patch: Partial<Decision>): Decision => ({
    id: "x",
    text: "",
    status: "proposed",
    by: "",
    section: "не определён",
    before: "",
    after: "",
    include: false,
    ...patch,
  });
  const existing: Decision[] = [
    base({ id: "a", text: "В разделе 3.1 поднять лимит страницы до 100", status: "accepted", include: true, manual: true, after: "не более 100" }),
    base({ id: "b", text: "Добавить выгрузку в XLSX", removed: true }),
    base({ id: "c", text: "Старое решение прошлых итогов" }),
    base({ id: "d", text: "Добавлено вручную", manual: true }),
  ];
  const fresh = [
    base({ id: "f1", text: "в разделе 3.1 поднять лимит страницы до 100!", after: "другое" }),
    base({ id: "f2", text: "Добавить выгрузку в XLSX" }),
    base({ id: "f3", text: "Новое решение" }),
  ];
  const merged = mergeDecisions(existing, fresh);
  assert.deepEqual(merged.map((d) => d.id), ["a", "d", "f3", "b"]);
  assert.equal(merged[0]!.after, "не более 100", "the hand edit wins");
  assert.equal(merged.at(-1)!.removed, true);
});

test("decisions from the renderer are checked field by field", () => {
  const [d] = sanitizeDecisions([{ id: "ok-1", text: "x", status: "weird", include: "yes", at: "later", speaker: "robot", manual: true }]);
  assert.deepEqual(d, { id: "ok-1", text: "x", status: "proposed", by: "", section: "не определён", before: "", after: "", include: false, manual: true });
  assert.throws(() => sanitizeDecisions("nope"));
  assert.throws(() => sanitizeDecisions([{ id: "../../etc" }]));
});

// CLOUD_TASK_6 phase 1: an unanswered question repeated in the call.
test("an open question keeps its repeat count and never starts checked", () => {
  const [d] = groundDecisions([raw({ status: "open", text: "Как быть с выгрузкой в XLSX?", quote: "добавим выгрузку в XLSX", asked: 3 })], meeting, id);
  assert.equal(d!.status, "open");
  assert.equal(d!.asked, 3);
  assert.equal(d!.include, false);
  const [clean] = sanitizeDecisions([{ ...d, asked: 3 }]);
  assert.equal(clean!.asked, 3);
  assert.equal(sanitizeDecisions([{ ...d, asked: "many" }])[0]!.asked, undefined);
});

// CLOUD_TASK_6 phase 2: a structure decision is usable only with its terms pinned.
test("an accepted structure decision without terms, or with 'не уточнено', starts unchecked and keeps its terms", () => {
  const text = "Значение items становится мапой: ключ - массив количеств";
  const quote = "Согласен, поднимаем до 100 записей";
  const [missing, unclear, pinned, plain] = groundDecisions(
    [
      raw({ text, quote }),
      raw({ text, quote, terms: "не уточнено: ключ мапы, название поля или значение типа" }),
      raw({ text, quote, terms: "ключ - тип вложения (значение поля type); значение - массив количеств" }),
      raw({ quote }),
    ],
    meeting,
    id,
  );
  assert.equal(missing!.include, false);
  assert.equal(missing!.terms, undefined);
  assert.equal(unclear!.include, false);
  assert.match(unclear!.terms!, /^не уточнено/);
  assert.equal(pinned!.include, true);
  assert.match(pinned!.terms!, /тип вложения/);
  // A decision that shapes no structure needs no terms.
  assert.equal(plain!.include, true);
  const [clean] = sanitizeDecisions([{ ...pinned, terms: "ключ - id" }]);
  assert.equal(clean!.terms, "ключ - id");
});

test("the decisions file carries a terms line for every checked decision", async () => {
  const { buildDecisionsMarkdown } = await import("./decisions.js");
  const labels = {
    title: "Решения", date: "Дата", document: "Документ", section: "Раздел", status: "Статус", before: "Было", after: "Стало",
    terms: "Термины", by: "Кто", quote: "Цитата", actions: "Поручения", none: "нет", me: "Я", other: "Собеседник",
    statuses: { accepted: "Принято", proposed: "Предложено", rejected: "Отклонено", open: "Не решено" },
  };
  const base: Decision = { id: "a", text: "Хранить items мапой", status: "accepted", by: "", section: "3", before: "", after: "", include: true };
  const full = { ...meeting, id: "m", title: "Разбор", mode: "review", context: "" } as Meeting;
  const md = buildDecisionsMarkdown({ ...full, decisions: [{ ...base, terms: "ключ - тип; значение - массив" }, { ...base, id: "b", text: "Второе" }] }, labels);
  assert.match(md, /- Термины: ключ - тип; значение - массив/);
  assert.match(md, /## 2\. Второе[\s\S]*- Термины: нет/);
});
