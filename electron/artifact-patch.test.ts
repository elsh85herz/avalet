import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { applyPatches, checkPatches, parsePatchReply } from "./artifact-patch.js";
import type { ArtifactPatch } from "./shared/ipc-contract.js";
import { fixturePath } from "./testing/stores.js";

// The patch applier: code, not the model, changes the document (CLOUD_TASK_5 phase 4).

const SPEC = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8");
let n = 0;
const patch = (p: Partial<ArtifactPatch>): ArtifactPatch => ({ id: `p${++n}`, decisionId: "d1", op: "replace", anchor: "", text: "", ...p });

/** Everything outside [start, end) of the original is unchanged. */
function unchangedAround(before: string, after: string, fragment: string, replacement: string) {
  const at = before.indexOf(fragment);
  assert.ok(at >= 0);
  assert.equal(after.slice(0, at), before.slice(0, at));
  assert.equal(after.slice(at + replacement.length), before.slice(at + fragment.length));
}

test("replace changes only the anchor, the rest is byte-identical", () => {
  const p = patch({ anchor: "не более 50 записей", text: "не более 100 записей" });
  const result = applyPatches(SPEC, [p]);
  assert.deepEqual(result.applied, [p.id]);
  assert.equal(result.notApplied.length, 0);
  assert.match(result.text, /`limit`: размер страницы, не более 100 записей\./);
  unchangedAround(SPEC, result.text, "не более 50 записей", "не более 100 записей");
  assert.equal(result.text.length, SPEC.length + 1);
});

test("insert_after starts a new line after a whole-line anchor; delete of a whole line leaves no empty line", () => {
  const insert = patch({ op: "insert_after", anchor: "- `cursor`: курсор следующей страницы.", text: "- `sort`: порядок, новые сверху." });
  const del = patch({ op: "delete", anchor: "Период выгрузки не больше 90 дней." });
  const result = applyPatches(SPEC, [insert, del]);
  assert.deepEqual(result.applied.sort(), [insert.id, del.id].sort());
  assert.match(result.text, /- `cursor`: курсор следующей страницы\.\n- `sort`: порядок, новые сверху\.\n\nОтвет:/);
  assert.doesNotMatch(result.text, /90 дней/);
  assert.match(result.text, /за выбранный период\.\n\n## 4\. Хранение/);
  // Text outside the two places is untouched.
  assert.ok(result.text.startsWith(SPEC.slice(0, SPEC.indexOf("- `cursor`"))));
  assert.ok(result.text.endsWith(SPEC.slice(SPEC.indexOf("## 4. Хранение"))));
});

test("an anchor that is missing or occurs twice is reported, and the other patches still apply", () => {
  const good = patch({ anchor: "180 дней, затем удаляются", text: "365 дней, затем удаляются" });
  const missing = patch({ anchor: "не более 75 записей", text: "x" });
  const ambiguous = patch({ anchor: "180 дней", text: "1 год" });
  const empty = patch({ anchor: "   ", text: "x" });
  const badOp = patch({ op: "rewrite" as never, anchor: "Лента", text: "x" });
  const result = applyPatches(SPEC, [good, missing, ambiguous, empty, badOp]);
  assert.deepEqual(result.applied, [good.id]);
  assert.deepEqual(
    result.notApplied.map((x) => x.problem),
    ["anchor-missing", "anchor-ambiguous", "empty-anchor", "bad-op"],
  );
  assert.match(result.text, /хранятся 365 дней/);
  assert.match(result.text, /срок хранения 180 дней\?/, "the other occurrence is untouched");
});

test("two patches on the same anchor: the first wins, the second is an overlap; unchecking the first frees it", () => {
  const first = patch({ anchor: "не более 50 записей", text: "не более 100 записей" });
  const second = patch({ decisionId: "d2", anchor: "не более 50 записей", text: "не более 200 записей" });
  const checked = checkPatches(SPEC, [first, second]);
  assert.deepEqual(checked.map((c) => [c.ok, c.problem]), [[true, undefined], [false, "overlap"]]);
  assert.equal(checked[0]!.oldFragment, "не более 50 записей");
  assert.equal(checked[0]!.newFragment, "не более 100 записей");
  const both = applyPatches(SPEC, [first, second]);
  assert.match(both.text, /не более 100 записей/);
  assert.deepEqual(both.notApplied, [{ id: second.id, problem: "overlap" }]);
  const onlySecond = applyPatches(SPEC, [first, second], [second.id]);
  assert.match(onlySecond.text, /не более 200 записей/);
  // Nothing chosen: the original, unchanged.
  assert.equal(applyPatches(SPEC, [first, second], []).text, SPEC);
});

test("a CRLF document: anchors and new text written with \\n still match, and CRLF is kept", () => {
  const crlf = SPEC.replace(/\n/g, "\r\n");
  const p = patch({ op: "insert_after", anchor: "Параметры:\n- `limit`: размер страницы, не более 50 записей.", text: "- `from`: начало периода." });
  const result = applyPatches(crlf, [p]);
  assert.deepEqual(result.applied, [p.id]);
  assert.match(result.text, /не более 50 записей\.\r\n- `from`: начало периода\.\r\n- `cursor`/);
  assert.doesNotMatch(result.text.replace(/\r\n/g, ""), /\n/, "no bare LF was introduced");
  const del = applyPatches(crlf, [patch({ op: "delete", anchor: "Период выгрузки не больше 90 дней." })]);
  assert.match(del.text, /за выбранный период\.\r\n\r\n## 4\. Хранение/);
});

test("a patch for a decision that was not sent is not applied", () => {
  const checked = checkPatches(SPEC, [patch({ decisionId: "d9", anchor: "Лента: список", text: "x" })], new Set(["d1"]));
  assert.equal(checked[0]!.problem, "unknown-decision");
});

test("a 100,000-character document with 50 patches applies fast and stays identical outside them", () => {
  const sections = Array.from({ length: 1_000 }, (_, i) => `## ${i + 1}. Раздел\nЗначение параметра ${i + 1} равно ${i * 7}.\n${"Обычный текст. ".repeat(4)}`);
  const doc = sections.join("\n");
  assert.ok(doc.length >= 100_000);
  const patches = Array.from({ length: 50 }, (_, i) => patch({ anchor: `Значение параметра ${i * 20 + 1} равно ${i * 20 * 7}.`, text: `Значение параметра ${i * 20 + 1} равно ${-i - 1}.` }));
  const t0 = performance.now();
  const result = applyPatches(doc, patches);
  const took = performance.now() - t0;
  assert.equal(result.applied.length, 50);
  assert.ok(took < 200, `took ${took.toFixed(1)} ms`);
  const lines = doc.split("\n");
  const out = result.text.split("\n");
  assert.equal(out.length, lines.length);
  const changed = lines.filter((line, i) => line !== out[i]).length;
  assert.equal(changed, 50);
});

test("the model's reply is parsed tolerantly: fenced, bare list, junk", () => {
  let k = 0;
  const id = () => `x${++k}`;
  const fenced = parsePatchReply('Вот:\n```json\n{"patches":[{"decisionId":"d1","op":"replace","anchor":"a","text":"b"}],"skipped":[{"decisionId":"d2","reason":" нет места "}]}\n```', id);
  assert.deepEqual(fenced, { patches: [{ id: "x1", decisionId: "d1", op: "replace", anchor: "a", text: "b" }], skipped: [{ decisionId: "d2", reason: "нет места" }] });
  assert.equal(parsePatchReply('[{"decisionId":"d1","op":"delete","anchor":"a"}]', id)?.patches[0]?.op, "delete");
  assert.equal(parsePatchReply("no json at all", id), null);
  assert.equal(parsePatchReply('{"patches": "nope"}', id), null);
  assert.equal(parsePatchReply('{"patches":[null, 3, {"op":"replace"}]}', id)?.patches.length, 1);
});

test("the cost note's bound covers everything the update request adds around the document and decisions", async () => {
  const { PATCH_SYSTEM_PROMPT, buildPatchUserContent } = await import("./artifact-prompt.js");
  const { PATCH_PROMPT_OVERHEAD_CHARS } = await import("./shared/artifact.js");
  const decisions = [{ id: "d1", text: "t", status: "accepted", section: "3.1", before: "", after: "" }];
  const around = PATCH_SYSTEM_PROMPT.length + buildPatchUserContent(SPEC, decisions).length - SPEC.length - JSON.stringify(decisions).length;
  assert.ok(around > 0 && around <= PATCH_PROMPT_OVERHEAD_CHARS, `adds ${around} chars`);
  // The request says the model must not rewrite the document.
  assert.match(PATCH_SYSTEM_PROMPT, /never rewrite the document and never return it whole/);
  assert.match(PATCH_SYSTEM_PROMPT, /Change nothing that no decision below asks for/);
  assert.match(PATCH_SYSTEM_PROMPT, /copied character for character/);
  assert.match(PATCH_SYSTEM_PROMPT, /do not guess: list it in 'skipped'/);
});
