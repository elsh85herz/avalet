import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AppCore, type HandlerTable } from "./app-core.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { MemoryKV } from "./platform/kv.js";
import { buildSystemPrompt, sectionForQuestion } from "./live-session.js";
import { getCurrentMeeting } from "./meetings-store.js";
import { ARTIFACT_INDEX_CHAR_CAP, LIVE_INDEX_OVERHEAD_CHARS } from "./shared/artifact.js";
import { fixturePath, setupStores } from "./testing/stores.js";
import type { InvokeChannel, InvokeResult } from "./shared/ipc-contract.js";

// Review mode: the document field, its copy on the meeting, and what live
// calls get of it (CLOUD_TASK_5 phase 1).

const SPEC = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8");

/** A complete fake "small" model, so Start works (same layout as e2e/harness.ts). */
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

function setup(): { core: AppCore; call: <C extends InvokeChannel>(channel: C, ...args: unknown[]) => Promise<InvokeResult<C>> } {
  const { dir } = setupStores({ onboardingDone: true, meetingMode: "review" });
  const hfCache = path.join(dir, "hf");
  placeReadyModel(hfCache);
  const core = new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: [fixturePath("fake-sidecar.mjs")] }), 10_000),
    models: new SpeechModelManager({ cacheDir: () => hfCache, spawnDownload: () => { throw new Error("no download"); }, onChange: () => {} }),
    ledger: new UsageLedger(new MemoryKV()),
    emit: () => {},
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async () => null,
  });
  const handlers = core.handlers as HandlerTable;
  const call = async <C extends InvokeChannel>(channel: C, ...args: unknown[]) =>
    (await (handlers[channel] as (...a: unknown[]) => unknown)(...args)) as InvokeResult<C>;
  return { core, call };
}

test("the document field: saved with its name, refused above the cap, cleared by an empty text", async () => {
  const { core, call } = setup();
  assert.deepEqual(await call("avalet:artifact-set", { name: "spec.md", text: SPEC }), { ok: true });
  assert.deepEqual(await call("avalet:artifact-get"), { name: "spec.md", text: SPEC });
  const snapshot = await core.settingsSnapshot();
  assert.equal(snapshot.artifactName, "spec.md");
  assert.equal(snapshot.artifactChars, SPEC.length);

  const tooBig = await call("avalet:artifact-set", { name: "big.md", text: "x".repeat(200_001) });
  assert.deepEqual(tooBig, { ok: false, reason: "too-large", chars: 200_001 });
  assert.equal((await call("avalet:artifact-get")).text, SPEC, "a refused document leaves the old one");

  await call("avalet:artifact-set", { name: "spec.md", text: "" });
  assert.deepEqual(await call("avalet:artifact-get"), { name: "", text: "" });
  await assert.rejects(async () => call("avalet:artifact-set", { name: "x", text: 5 }));
});

test("Start copies the document onto a review meeting only; it is fixed until End", async () => {
  const { core, call } = setup();
  await call("avalet:artifact-set", { name: "spec.md", text: SPEC });
  assert.deepEqual(await call("avalet:session-start"), { ok: true });
  assert.deepEqual(getCurrentMeeting()?.artifact, { name: "spec.md", text: SPEC });
  const refused = await call("avalet:artifact-set", { name: "other.md", text: "другой" });
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.reason, "meeting-running");
  await call("avalet:session-reset");

  await call("avalet:meeting-mode-set", "requirements");
  await call("avalet:session-start");
  assert.equal(getCurrentMeeting()?.artifact, undefined, "other modes do not keep the document");
  // Switched to review during the call: the loaded document comes along.
  await call("avalet:meeting-mode-set", "review");
  assert.equal(getCurrentMeeting()?.artifact?.text, SPEC);
  await call("avalet:session-reset");
  await core.shutdown();
});

test("live calls carry a bounded index, never the document; other modes carry nothing", async () => {
  const { core, call } = setup();
  const big = Array.from({ length: 900 }, (_, i) => `## ${i + 1}. Раздел ${i + 1}\nПервая строка раздела ${i + 1}.\n${"Подробный текст, который в живые подсказки не попадает. ".repeat(2)}\n`).join("\n");
  assert.ok(big.length >= 100_000 && big.length <= 200_000, `${big.length}`);
  await call("avalet:session-start");
  const withoutDocument = buildSystemPrompt();
  await call("avalet:session-reset");

  await call("avalet:artifact-set", { name: "big.md", text: big });
  await call("avalet:session-start");
  const prompt = buildSystemPrompt();
  assert.match(prompt, /<document_index>/);
  assert.doesNotMatch(prompt, /Подробный текст/);
  assert.ok(
    prompt.length <= withoutDocument.length + ARTIFACT_INDEX_CHAR_CAP + LIVE_INDEX_OVERHEAD_CHARS,
    `live prompt grew by ${prompt.length - withoutDocument.length} chars`,
  );
  await call("avalet:meeting-mode-set", "requirements");
  assert.doesNotMatch(buildSystemPrompt(), /document_index/);
  await call("avalet:session-reset");
  await core.shutdown();
});

test("a typed question naming a section gets that section; nothing else does", () => {
  assert.match(sectionForQuestion("что сейчас в разделе 3.1?", SPEC), /не более 50 записей/);
  assert.doesNotMatch(sectionForQuestion("что сейчас в разделе 3.1?", SPEC), /export/);
  assert.equal(sectionForQuestion("какой лимит страницы?", SPEC), "");
  assert.equal(sectionForQuestion("раздел 3.1", ""), "");
  assert.equal(sectionForQuestion("раздел 9", SPEC), "");
});
