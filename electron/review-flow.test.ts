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
  // Back to the original.
  const reverted = (await h.call("avalet:artifact-apply", meeting.id, []))!;
  assert.equal(reverted.artifactResult, undefined);
  await assert.rejects(async () => h.call("avalet:artifact-apply", meeting.id, [5]));
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
