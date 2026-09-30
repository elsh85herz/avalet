import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_SYSTEM_PROMPT,
  applyCheck,
  buildCheckItems,
  buildCheckUserContent,
  checkCostTokens,
  checkableDecisions,
  parseCheckReply,
  quoteContext,
} from "./shared/decision-check.js";
import type { Decision, TranscriptSegment } from "./shared/ipc-contract.js";

// CLOUD_TASK_6 phase 2: the optional check can only lower a decision.

const T0 = Date.UTC(2026, 8, 30, 10, 0, 0);
const transcript: TranscriptSegment[] = [
  { at: T0 + 5_000, speaker: "me", text: "Посылка хранит позиции двумя списками, так и оставляем?" },
  { at: T0 + 12_000, speaker: "other", text: "Нет, давайте сделаем мапу: ключ и массив количеств." },
  { at: T0 + 18_000, speaker: "me", text: "Согласен, делаем мапу." },
  { at: T0 + 25_000, speaker: "other", text: "Например, ключ box, а в значении три числа." },
  { at: T0 + 31_000, speaker: "me", text: "Понял." },
  { at: T0 + 40_000, speaker: "other", text: "Ещё про вес поговорим позже." },
];
const base: Decision = {
  id: "row-1",
  text: "Позиции посылки хранить мапой: ключ - массив количеств",
  status: "accepted",
  by: "",
  section: "3",
  before: "",
  after: "",
  include: true,
  quote: "Согласен, делаем мапу.",
  speaker: "me",
  at: T0 + 18_000,
};

test("only accepted, visible decisions with a quote are checked; each carries the lines around its quote", () => {
  const rows = checkableDecisions([
    base,
    { ...base, id: "p", status: "proposed" },
    { ...base, id: "r", removed: true },
    { ...base, id: "nq", quote: undefined, at: undefined },
  ]);
  assert.deepEqual(rows.map((d) => d.id), ["row-1"]);
  const context = quoteContext(transcript, T0 + 18_000, T0);
  assert.equal(context.split("\n").length, 5);
  assert.match(context, /^\[00:05\] \[Я\]: Посылка/);
  // The example given a sentence later is in view.
  assert.match(context, /\[00:25\] \[Собеседник\]: Например, ключ box/);
  const items = buildCheckItems(rows, transcript, T0);
  assert.equal(items[0]!.id, "c1");
  assert.match(buildCheckUserContent(items), /"quote":"Согласен, делаем мапу\."/);
  assert.ok(checkCostTokens(items) > 0);
  assert.match(CHECK_SYSTEM_PROMPT, /never add or improve a decision/);
  assert.match(CHECK_SYSTEM_PROMPT, /When in doubt, do not say 'ok'/);
});

test("the reply is read tolerantly; an unknown verdict is dropped, never read as ok", () => {
  assert.equal(parseCheckReply("no json"), null);
  const parsed = parseCheckReply('```json\n{"checks":[{"id":"c1","verdict":"ok","reason":"да"},{"id":"c2","verdict":"great"},{"verdict":"ok"}]}\n```');
  assert.deepEqual(parsed, [{ id: "c1", verdict: "ok", terms: "", reason: "да" }]);
  assert.equal(parseCheckReply('[{"id":"c1","verdict":"terms_unclear","terms":"не уточнено: ключ"}]')![0]!.verdict, "terms_unclear");
});

test("applying the check only lowers: not supported goes back to proposed, unclear terms are marked, both unchecked", () => {
  const rows: Decision[] = [base, { ...base, id: "row-2", terms: "ключ - тип вложения" }, { ...base, id: "row-3" }, { ...base, id: "row-4" }];
  const sent = new Map([
    ["c1", "row-1"],
    ["c2", "row-2"],
    ["c3", "row-3"],
  ]);
  const out = applyCheck(
    rows,
    sent,
    [
      { id: "c1", verdict: "not_supported", terms: "", reason: "согласие на другое" },
      { id: "c2", verdict: "terms_unclear", terms: "не уточнено: ключ, имя поля или значение типа", reason: "" },
      { id: "c3", verdict: "ok", terms: "", reason: "" },
      { id: "c9", verdict: "not_supported", terms: "", reason: "не отправляли" },
    ],
    123,
  );
  assert.equal(out[0]!.status, "proposed");
  assert.equal(out[0]!.include, false);
  assert.deepEqual(out[0]!.check, { verdict: "not_supported", reason: "согласие на другое", at: 123 });
  assert.equal(out[1]!.status, "accepted");
  assert.equal(out[1]!.include, false);
  assert.equal(out[1]!.terms, "не уточнено: ключ, имя поля или значение типа (в итогах: ключ - тип вложения)");
  // "ok" never raises anything: the row stays exactly as it was, with the note.
  assert.deepEqual({ ...out[2]!, check: undefined }, { ...rows[2]!, check: undefined });
  assert.equal(out[2]!.check!.verdict, "ok");
  // Not sent: untouched.
  assert.equal(out[3], rows[3]);
});

test("a row the analyst edited keeps its content and only gets the note; a proposed row is never raised", () => {
  const manual = { ...base, manual: true };
  const proposed = { ...base, id: "row-2", status: "proposed" as const, include: false };
  const out = applyCheck(
    [manual, proposed],
    new Map([
      ["c1", "row-1"],
      ["c2", "row-2"],
    ]),
    [
      { id: "c1", verdict: "not_supported", terms: "", reason: "нет" },
      { id: "c2", verdict: "ok", terms: "", reason: "" },
    ],
    1,
  );
  assert.equal(out[0]!.status, "accepted");
  assert.equal(out[0]!.include, true);
  assert.equal(out[0]!.check!.verdict, "not_supported");
  assert.equal(out[1]!.status, "proposed");
  assert.equal(out[1]!.include, false);
});
