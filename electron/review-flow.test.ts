import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { AppCore, type Emit } from "./app-core.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { MemoryKV } from "./platform/kv.js";
import { setSelectedProviderId, updateProviderSettings } from "./settings-store.js";
import { fixturePath, setupStores, startMockServer, type MockServer } from "./testing/stores.js";
import type { EventChannel, EventMap, InvokeChannel, InvokeResult, Meeting } from "./shared/ipc-contract.js";

// Review mode end to end through AppCore's handlers (CLOUD_TASK_5): a document
// loaded before Start, a scripted call, the summary's decisions, hand edits,
// the patch proposal, apply, exports. Fake recognizer, mock model over HTTP.

const SPEC = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8");
const SCRIPT: Array<[string, "me" | "other"]> = [
  ["По разделу 3.1: пятидесяти записей на страницу мало, предлагаю поднять лимит до 100.", "other"],
  ["Согласен, поднимаем до 100 записей.", "me"],
  ["И ещё давайте добавим выгрузку в XLSX, не только CSV.", "other"],
  ["Срок хранения 180 дней пока не трогаем, это надо согласовать с безопасностью.", "other"],
];

const LABELS = {
  title: "Решения",
  date: "Дата",
  document: "Документ",
  section: "Раздел",
  status: "Статус",
  before: "Было",
  after: "Стало",
  terms: "Термины",
  by: "Кто",
  quote: "Цитата",
  actions: "Поручения",
  none: "нет",
  me: "Я",
  other: "Собеседник",
  statuses: { accepted: "Принято", proposed: "Предложено", rejected: "Отклонено", open: "Не решено" },
};

let mock: MockServer;
before(async () => {
  mock = await startMockServer();
});
after(async () => {
  await mock.close();
});

function placeReadyModel(hfCache: string): void {
  const root = path.join(hfCache, "models--Systran--faster-whisper-small");
  const blobs = path.join(root, "blobs");
  const snap = path.join(root, "snapshots", "rev1");
  fs.mkdirSync(blobs, { recursive: true });
  fs.mkdirSync(snap, { recursive: true });
  for (const [blob, file] of [["w", "model.bin"], ["c", "config.json"], ["t", "tokenizer.json"]]) {
    fs.writeFileSync(path.join(blobs, blob!), "{}");
    fs.symlinkSync(`../../blobs/${blob}`, path.join(snap, file!));
  }
}

export function reviewHarness() {
  const { dir } = setupStores({ onboardingDone: true, meetingMode: "review", autoDetectEnabled: false });
  const hfCache = path.join(dir, "hf");
  placeReadyModel(hfCache);
  const exports = path.join(dir, "exports");
  fs.mkdirSync(exports, { recursive: true });
  const events: Array<{ channel: EventChannel; payload: unknown }> = [];
  const emit: Emit = (channel, payload) => void events.push({ channel, payload });
  const ledger = new UsageLedger(new MemoryKV());
  const core = new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: [fixturePath("fake-sidecar.mjs")] }), 10_000),
    models: new SpeechModelManager({ cacheDir: () => hfCache, spawnDownload: () => { throw new Error("no download"); }, onChange: () => {} }),
    ledger,
    emit,
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async (name, _filter, ext) => path.join(exports, `${name}.${ext}`),
  });
  setSelectedProviderId("custom");
  updateProviderSettings("custom", { baseUrl: `${mock.url}/openai/v1`, model: "local-model" });
  async function call<C extends InvokeChannel>(channel: C, ...args: unknown[]): Promise<InvokeResult<C>> {
    const handler = core.handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (await handler(...args)) as InvokeResult<C>;
  }
  const of = <C extends EventChannel>(channel: C) => events.filter((e) => e.channel === channel).map((e) => e.payload as EventMap[C]);
  const say = (text: string, channel: "me" | "other") =>
    call("avalet:capture-audio-chunk", Buffer.from(`TEXT:${text}`).toString("base64"), channel, {
      startedAt: Date.now() - 1_000,
      endedAt: Date.now(),
      endedBySilence: true,
    });
  /** Loads the document, runs the scripted call, ends it, returns the saved meeting. */
  async function runCall(): Promise<Meeting> {
    assert.deepEqual(await call("avalet:artifact-set", { name: "spec-activity-journal.md", text: SPEC }), { ok: true });
    assert.deepEqual(await call("avalet:session-start"), { ok: true });
    for (const [line, channel] of SCRIPT) await say(line, channel);
    const id = of("avalet:event:meeting-started")[0]!.id;
    await call("avalet:session-reset");
    return (await call("avalet:meetings-get", id))!;
  }
  return { core, call, of, say, runCall, exports, ledger };
}

test("the review summary returns decisions checked against the call; hand edits survive a new summary", async () => {
  const h = reviewHarness();
  const meeting = await h.runCall();
  assert.equal(meeting.transcript.length, 4);
  assert.equal(meeting.artifact?.text, SPEC);

  await h.call("avalet:meetings-summarize", meeting.id);
  const done = h.of("avalet:event:summary-done").at(-1)!;
  assert.equal(done.decisions?.length, 3);
  const [raise, xlsx, storage] = done.decisions!;
  assert.deepEqual([raise!.status, raise!.include, raise!.section], ["accepted", true, "3.1 GET /activities"]);
  // Time and speaker come from the transcript line the quote was found in.
  assert.equal(raise!.at, meeting.transcript[1]!.at);
  assert.equal(raise!.speaker, "me");
  assert.deepEqual([xlsx!.status, xlsx!.include, xlsx!.section], ["proposed", false, "3.2 POST /activities/export"]);
  assert.deepEqual([storage!.status, storage!.include], ["open", false]);
  // The summary with the document was metered like any summary.
  assert.equal((await h.call("avalet:usage-get")).byPurpose.summary.calls, 1);

  // The analyst includes the proposal and deletes the open question.
  const edited = done.decisions!.map((d) =>
    d.id === xlsx!.id ? { ...d, include: true, manual: true } : d.id === storage!.id ? { ...d, removed: true, manual: true } : d,
  );
  const saved = await h.call("avalet:meetings-set-decisions", meeting.id, edited);
  assert.equal(saved?.decisions?.find((d) => d.id === xlsx!.id)?.include, true);

  await h.call("avalet:meetings-summarize", meeting.id);
  const again = (await h.call("avalet:meetings-get", meeting.id))!.decisions!;
  const visible = again.filter((d) => !d.removed);
  assert.equal(visible.length, 2, "the deleted one does not come back, nothing is doubled");
  assert.equal(visible.find((d) => /XLSX/.test(d.text))?.include, true, "the hand edit survives");
  await h.core.shutdown();
});

test("a review meeting without a document gets the plain summary: no decisions, no document in the request", async () => {
  const h = reviewHarness();
  assert.deepEqual(await h.call("avalet:session-start"), { ok: true });
  for (const [line, channel] of SCRIPT) await h.say(line, channel);
  const id = h.of("avalet:event:meeting-started")[0]!.id;
  await h.call("avalet:session-reset");
  await h.call("avalet:meetings-summarize", id);
  assert.equal(h.of("avalet:event:summary-done").at(-1)!.decisions, null);
  const summaryCall = mock.llmCalls.at(-1)!;
  assert.doesNotMatch(summaryCall.system, /<document>|"decisions"/);
  await h.core.shutdown();
});

test("update the document: one metered call, patches checked against the original, only the chosen ones applied, undo", async () => {
  const h = reviewHarness();
  const meeting = await h.runCall();
  await h.call("avalet:meetings-summarize", meeting.id);
  const decisions = (await h.call("avalet:meetings-get", meeting.id))!.decisions!;
  // Include the XLSX proposal too: it has no "before", so the mock inserts a line under 3.2.
  await h.call(
    "avalet:meetings-set-decisions",
    meeting.id,
    decisions.map((d) => (/XLSX/.test(d.text) ? { ...d, include: true, manual: true } : d)),
  );

  const proposed = await h.call("avalet:artifact-propose", meeting.id);
  assert.equal(proposed.ok, true);
  const proposal = proposed.ok ? proposed.proposal : null;
  assert.equal(proposal!.decisionIds.length, 2);
  const [replace, insert] = proposal!.patches;
  assert.deepEqual([replace!.op, replace!.ok, replace!.oldFragment, replace!.newFragment], ["replace", true, "не более 50 записей", "не более 100 записей"]);
  assert.equal(insert!.op, "insert_after");
  assert.equal(insert!.ok, true);
  // The patch call sent the document and only the checked decisions, and was metered as "artifact".
  const request = mock.llmCalls.at(-1)!;
  assert.match(request.system, /turn confirmed decisions into patches/);
  assert.equal((await h.call("avalet:usage-get")).byPurpose.artifact.calls, 1);
  const stored = (await h.call("avalet:meetings-get", meeting.id))!;
  assert.equal(stored.artifactProposal?.patches.length, 2);
  assert.equal(stored.artifactResult, undefined, "nothing is applied before Apply");

  // Apply only the first one.
  const applied = (await h.call("avalet:artifact-apply", meeting.id, [replace!.id]))!;
  assert.deepEqual(applied.artifactResult?.patchIds, [replace!.id]);
  assert.equal(applied.artifactResult!.text, SPEC.replace("не более 50 записей", "не более 100 записей"));
  assert.equal(applied.artifact?.text, SPEC, "the original is kept");
  // Both.
  const both = (await h.call("avalet:artifact-apply", meeting.id, [replace!.id, insert!.id]))!;
  assert.match(both.artifactResult!.text, /### 3\.2 POST \/activities\/export\n\nВ разделе 3\.2 добавить выгрузку в XLSX\.\n\nГотовит/);
  // Download: exactly the computed text, nothing added.
  const docFile = await h.call("avalet:meetings-export-artifact", meeting.id);
  assert.equal(path.basename(docFile!), "spec-activity-journal (updated).md");
  assert.equal(fs.readFileSync(docFile!, "utf8"), both.artifactResult!.text);
  const decisionsFile = await h.call("avalet:meetings-export-decisions", meeting.id, LABELS);
  const exported = fs.readFileSync(decisionsFile!, "utf8");
  assert.match(exported, /^# Решения: Встреча /);
  assert.match(exported, /\nДокумент: spec-activity-journal\.md\n/);
  assert.match(
    exported,
    /## 1\. В разделе 3\.1 поднять размер страницы до 100 записей\n\n- Раздел: 3\.1 GET \/activities\n- Статус: Принято\n- Было: не более 50 записей\n- Стало: не более 100 записей\n- Термины: нет\n- Кто: Собеседник предложил, Я согласился\n- Цитата: «Согласен, поднимаем до 100 записей\.» \(Я, 00:00:0\d\)\n/,
  );
  assert.match(exported, /## 2\. В разделе 3\.2 добавить выгрузку в XLSX\n\n- Раздел: 3\.2 POST \/activities\/export\n- Статус: Предложено\n- Было: нет\n/);
  assert.doesNotMatch(exported, /Срок хранения 180 дней согласовать/, "an unchecked decision is not exported");
  assert.match(exported, /## Поручения\n\n- Согласовать срок хранения 180 дней с безопасностью \(Я, срок не назван\)\n$/);

  // Back to the original.
  const reverted = (await h.call("avalet:artifact-apply", meeting.id, []))!;
  assert.equal(reverted.artifactResult, undefined);
  await assert.rejects(async () => h.call("avalet:artifact-apply", meeting.id, [5]));
  await assert.rejects(async () => h.call("avalet:meetings-export-artifact", meeting.id), /not been updated/);
  await h.core.shutdown();
});

test("update is refused without a checked decision; the decisions of the call are the only source", async () => {
  const h = reviewHarness();
  const meeting = await h.runCall();
  await h.call("avalet:meetings-summarize", meeting.id);
  const decisions = (await h.call("avalet:meetings-get", meeting.id))!.decisions!;
  await h.call("avalet:meetings-set-decisions", meeting.id, decisions.map((d) => ({ ...d, include: false, manual: true })));
  const refused = await h.call("avalet:artifact-propose", meeting.id);
  assert.equal(refused.ok, false);
  await h.core.shutdown();
});

// CLOUD_TASK_6 phase 2: the optional check, only on request, metered as part of the summary.
test("check against the quotes: one metered call over the accepted decisions, results folded without raising anything", async () => {
  const h = reviewHarness();
  const meeting = await h.runCall();
  const none = await h.call("avalet:decisions-check", meeting.id);
  assert.deepEqual(none, { ok: false, message: "no accepted decision with a quote", code: "nothing" });
  assert.equal((await h.call("avalet:usage-get")).byPurpose.summary.calls, 0, "nothing to check, nothing spent");

  await h.call("avalet:meetings-summarize", meeting.id);
  const result = await h.call("avalet:decisions-check", meeting.id);
  assert.ok(result.ok);
  assert.equal(result.checked, 1);
  const rows = result.meeting.decisions!;
  const raise = rows.find((d) => d.status === "accepted")!;
  assert.equal(raise.check?.verdict, "ok");
  assert.equal(raise.include, true);
  // The proposal and the open question were not sent and are unchanged.
  assert.ok(rows.filter((d) => d.status !== "accepted").every((d) => !d.check));
  assert.equal((await h.call("avalet:usage-get")).byPurpose.summary.calls, 2);
  await h.core.shutdown();
});

// CLOUD_TASK_6 phase 4: the live path keeps when the words ended and how sure the recognizer was.
test("a saved segment carries its end time and the recognizer's low confidence; the summary tags it", async () => {
  const h = reviewHarness();
  assert.deepEqual(await h.call("avalet:session-start"), { ok: true });
  const chunk = (payload: string, channel: "me" | "other") =>
    h.call("avalet:capture-audio-chunk", Buffer.from(payload).toString("base64"), channel, { startedAt: Date.now() - 2_000, endedAt: Date.now(), endedBySilence: true });
  await chunk("TEXT:Давай позиции посылки хранить мапой.", "other");
  await chunk("UNSURE:Согласен, делаем мапу.", "other");
  const id = h.of("avalet:event:meeting-started")[0]!.id;
  await h.call("avalet:session-reset");
  const meeting = (await h.call("avalet:meetings-get", id))!;
  assert.equal(meeting.transcript.length, 2);
  assert.ok(meeting.transcript.every((seg) => typeof seg.end === "number" && seg.end >= seg.at));
  assert.equal(meeting.transcript[0]!.lowConfidence, undefined);
  assert.equal(meeting.transcript[1]!.lowConfidence, true);
  await h.call("avalet:meetings-summarize", id);
  assert.match(mock.lastPrompt.user, /\[Собеседник\] \(неразборчиво\): Согласен, делаем мапу/);
  assert.match(mock.lastPrompt.system, /were recognized with low confidence/);
  await h.core.shutdown();
});

// CLOUD_TASK_6 phase 5: the synthetic parcel call, end to end through the
// app core. A doubled line gets past the live filter (short hold, as when the
// clean copy arrives late), a credit line comes in a quiet stretch; the mock
// model's fixed answer has an unpinned map decision, a question asked three
// times and deferred, a contradiction with the briefing and a name nobody said.
const PARCEL = JSON.parse(fs.readFileSync(fixturePath("parcel-call.json"), "utf8")) as {
  briefing: string;
  lines: Array<{ channel: "me" | "other"; text: string; echo?: boolean; sameTime?: boolean; quiet?: boolean }>;
};

test("the fake capture's parcel plan matches the scripted lines", async () => {
  const { FAKE_PLANS } = await import("./fake-capture.js");
  assert.deepEqual(
    FAKE_PLANS.parcel!.map((c) => [c.channel, Boolean(c.sameTime)]),
    PARCEL.lines.map((l) => [l.channel, Boolean(l.sameTime)]),
  );
});

test("parcel call: one line per utterance, the credit line kept but out of the summary, unpinned terms and the open question marked, the role mismatch listed, no invented name", async () => {
  process.env.AVALET_TEST_ECHO_HOLD_MS = "0";
  const h = reviewHarness();
  delete process.env.AVALET_TEST_ECHO_HOLD_MS;
  try {
    const spec = fs.readFileSync(fixturePath("spec-parcel.md"), "utf8");
    await h.call("avalet:context-set", PARCEL.briefing);
    assert.deepEqual(await h.call("avalet:artifact-set", { name: "spec-parcel.md", text: spec }), { ok: true });
    assert.deepEqual(await h.call("avalet:session-start"), { ok: true });
    const base = Date.now();
    let window = { startedAt: base, endedAt: base };
    for (const [i, line] of PARCEL.lines.entries()) {
      if (!line.sameTime) window = { startedAt: base + i * 3_000, endedAt: base + i * 3_000 + 2_500 };
      const payload = `${line.quiet ? "QUIET" : "TEXT"}:${line.text}`;
      await h.call("avalet:capture-audio-chunk", Buffer.from(payload).toString("base64"), line.channel, { ...window, endedBySilence: true });
      // The mic copy is committed before its clean copy arrives (hold 0).
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const id = h.of("avalet:event:meeting-started")[0]!.id;
    const live = h.of("avalet:event:transcript-segment");
    assert.equal(live.length, PARCEL.lines.length, "live, both copies got through");
    await h.call("avalet:session-reset");

    const saved = (await h.call("avalet:meetings-get", id))!;
    assert.equal(saved.transcript.length, PARCEL.lines.length, "nothing deleted from the record");
    const visible = saved.transcript.filter((s) => !s.filtered);
    assert.equal(visible.length, PARCEL.lines.length - 3);
    assert.deepEqual(
      saved.transcript.filter((s) => s.filtered).map((s) => s.filtered),
      ["echo", "echo", "noise"],
    );
    // One line per utterance: no text appears twice among the visible lines.
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
    assert.equal(new Set(visible.map((s) => norm(s.text))).size, visible.length);

    await h.call("avalet:meetings-summarize", id);
    // The summary input: no doubled line, no credit line.
    assert.doesNotMatch(mock.lastPrompt.user, /Редактор субтитров/);
    assert.equal(mock.lastPrompt.user.match(/сделать мапу/g)?.length, 1);
    assert.match(mock.lastPrompt.system, /Вопрос без ответа/);
    assert.match(mock.lastPrompt.system, /Расхождение с контекстом/);

    const done = h.of("avalet:event:summary-done").at(-1)!;
    assert.match(done.text, /Вопрос без ответа: что является ключом мапы[^\n]*\(задан 3 раз\)/);
    assert.match(done.text, /Вопрос без ответа: сохраняется ли обратная совместимость/);
    assert.match(done.text, /Расхождение с контекстом: в контексте разработчик и владелец продукта один человек/);
    const [map, key, compat] = done.decisions!;
    // The accepted map decision: terms not pinned, so it starts unchecked.
    assert.equal(map!.status, "accepted");
    assert.equal(map!.terms, undefined);
    assert.equal(map!.include, false);
    assert.equal(map!.section, "2.1 Посылка");
    assert.equal(map!.speaker, "me");
    // The question asked three times and deferred: open, with its count and terms, never checked.
    assert.deepEqual([key!.status, key!.asked, key!.include], ["open", 3, false]);
    assert.match(key!.terms!, /^не уточнено/);
    assert.deepEqual([compat!.status, compat!.include], ["open", false]);
    // The name nobody said is gone; roles from the call stay.
    assert.deepEqual(done.participants, [
      { who: "", role: "разработчик, предлагает решение", kind: "inferred" },
      { who: "", role: "аналитик, ведёт ревью", kind: "inferred" },
      { who: "", role: "владелец продукта, ему передан вопрос", kind: "third_party" },
    ]);
    const protocol = h.core.renderProtocol(id, { participants: "Участники", participantsInferred: "по ходу встречи", participantsThird: "третьи лица, не на встрече" }, "Ревью");
    assert.match(protocol, /Участники: по ходу встречи: разработчик, предлагает решение, аналитик, ведёт ревью; третьи лица, не на встрече: владелец продукта, ему передан вопрос/);

    // The optional check marks the unpinned map decision too (mock verdict), and never raises the open ones.
    const map2 = { ...map!, include: true };
    await h.call("avalet:meetings-set-decisions", id, [map2, key, compat]);
    const checked = await h.call("avalet:decisions-check", id);
    assert.ok(checked.ok);
    const after = checked.meeting.decisions!;
    assert.equal(after[0]!.check?.verdict, "terms_unclear");
    assert.equal(after[0]!.include, false);
    assert.match(after[0]!.terms!, /^не уточнено/);
    assert.equal(after[1]!.status, "open");
  } finally {
    await h.core.shutdown();
  }
});
