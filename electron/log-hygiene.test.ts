import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { AppCore, type Emit } from "./app-core.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { MemoryKV } from "./platform/kv.js";
import { configureLog, logLine, redactSecrets } from "./log.js";
import { setApiKey, setSelectedProviderId, updateProviderSettings } from "./settings-store.js";
import { fixturePath, setupStores, startMockServer, tempDir, type MockServer } from "./testing/stores.js";
import type { EventChannel, InvokeChannel, InvokeResult } from "./shared/ipc-contract.js";

// The log never contains meeting text or keys, and does not repeat itself.

const TEXT_CANARY = "КАНАРЕЙКА-7f3a-CANARY";
const KEY_CANARY = "sk-canary-91b2c4d6e8f0a1b3c5d7";

let mock: MockServer;
before(async () => {
  mock = await startMockServer();
});
after(async () => {
  await mock.close();
  configureLog(null);
});

function readLog(dir: string): string {
  const file = path.join(dir, "avalet.log");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

test("identical warnings are written once per ten minutes, with a count", () => {
  const dir = tempDir();
  configureLog(dir);
  const t0 = Date.UTC(2026, 8, 26, 10, 0, 0);
  for (let i = 0; i < 6; i++) logLine("[billing] network: billing server unreachable", t0 + i * 60_000);
  logLine("[models] small: download finished", t0 + 7 * 60_000);
  logLine("[billing] network: billing server unreachable", t0 + 11 * 60_000);
  const lines = readLog(dir).trim().split("\n");
  assert.equal(lines.filter((l) => l.includes("unreachable")).length, 2);
  assert.match(lines.at(-1)!, /5 identical lines skipped/);
});

test("key-shaped strings are cut out of every line", () => {
  assert.equal(redactSecrets(`401: Incorrect API key provided: ${KEY_CANARY}`), "401: Incorrect API key provided: sk-[redacted]");
  assert.doesNotMatch(redactSecrets("authorization: Bearer abcdefghijklmnop123"), /abcdefghijklmnop123/);
  assert.equal(redactSecrets("[timing] block done 812ms, 140 chars"), "[timing] block done 812ms, 140 chars");
});

test("a whole meeting with an own key leaves neither the meeting text nor the key in the log", async () => {
  const logDir = tempDir();
  configureLog(logDir);
  const { dir } = setupStores({ onboardingDone: true });
  const hfCache = path.join(dir, "hf");
  const exports = path.join(dir, "exports");
  fs.mkdirSync(exports, { recursive: true });
  const events: Array<{ channel: EventChannel; payload: unknown }> = [];
  const emit: Emit = (channel, payload) => void events.push({ channel, payload });
  const models = new SpeechModelManager({
    cacheDir: () => hfCache,
    spawnDownload: (model) =>
      spawn(process.execPath, [fixturePath("fake-model-download.mjs"), model], {
        env: { ...process.env, HF_HUB_CACHE: hfCache, FAKE_DOWNLOAD_STEP_MS: "5" },
        stdio: ["ignore", "ignore", "pipe"],
      }),
    onChange: () => {},
    pollMs: 10,
  });
  const core = new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: [fixturePath("fake-sidecar.mjs")] }), 10_000),
    models,
    ledger: new UsageLedger(new MemoryKV()),
    emit,
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async (name, _filter, ext) => path.join(exports, `${name}.${ext}`),
  });
  const call = async <C extends InvokeChannel>(channel: C, ...args: unknown[]) => (await core.handlers[channel]!(...args)) as InvokeResult<C>;
  const until = async (check: () => boolean) => {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > 10_000) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 15));
    }
  };
  const say = (text: string, channel: "me" | "other" = "other") =>
    call("avalet:capture-audio-chunk", Buffer.from(`TEXT:${text}`).toString("base64"), channel, {
      startedAt: Date.now() - 1_000,
      endedAt: Date.now(),
      endedBySilence: true,
    });

  try {
    setSelectedProviderId("openai");
    updateProviderSettings("openai", { baseUrl: `${mock.url}/openai/v1`, model: "gpt-4.1-mini" });
    setApiKey("openai", KEY_CANARY);
    await call("avalet:context-set", `Проект ${TEXT_CANARY}`);
    await call("avalet:speech-model-download", "small");
    await until(() => models.isReady("small"));
    assert.deepEqual(await call("avalet:session-start"), { ok: true });
    await say(`Нужно ли ${TEXT_CANARY} менять в приложении?`);
    await until(() => events.some((e) => e.channel === "avalet:event:block-done"));
    await say(`Я отвечу про ${TEXT_CANARY} позже`, "me");
    await call("avalet:session-ask", `Что спросить про ${TEXT_CANARY}?`);
    await call("avalet:session-stop");
    const meeting = await call("avalet:meetings-current");
    await call("avalet:meetings-summarize", meeting!.id);
    await call("avalet:meetings-export", meeting!.id, {}, "free");
    await call("avalet:meetings-export-transcript", meeting!.id, {});
    // Failures are logged too: a provider that cannot be reached, with the key set.
    updateProviderSettings("openai", { baseUrl: "http://127.0.0.1:9/v1" });
    await call("avalet:provider-test", "openai");
    await say(`Ещё раз ${TEXT_CANARY}?`);
    await call("avalet:session-reset");
  } finally {
    await core.shutdown();
  }
  const log = readLog(logDir);
  assert.ok(log.length > 0, "the meeting wrote timings to the log");
  assert.ok(!log.includes(TEXT_CANARY), "meeting text in the log");
  assert.ok(!log.includes("canary-91b2"), "the key in the log");
  // The exports do carry the text: the canary really went through the meeting.
  assert.ok(fs.readdirSync(exports).some((f) => fs.readFileSync(path.join(exports, f), "utf8").includes(TEXT_CANARY)));
});

test("a review meeting with a document: neither the document nor the key reaches the log", async () => {
  const logDir = tempDir();
  configureLog(logDir);
  const { dir } = setupStores({ onboardingDone: true, meetingMode: "review", autoDetectEnabled: false });
  const hfCache = path.join(dir, "hf");
  const exports = path.join(dir, "exports");
  fs.mkdirSync(exports, { recursive: true });
  const models = new SpeechModelManager({
    cacheDir: () => hfCache,
    spawnDownload: (model) =>
      spawn(process.execPath, [fixturePath("fake-model-download.mjs"), model], {
        env: { ...process.env, HF_HUB_CACHE: hfCache, FAKE_DOWNLOAD_STEP_MS: "5" },
        stdio: ["ignore", "ignore", "pipe"],
      }),
    onChange: () => {},
    pollMs: 10,
  });
  const core = new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: [fixturePath("fake-sidecar.mjs")] }), 10_000),
    models,
    ledger: new UsageLedger(new MemoryKV()),
    emit: () => {},
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async (name, _filter, ext) => path.join(exports, `${name}.${ext}`),
  });
  const call = async <C extends InvokeChannel>(channel: C, ...args: unknown[]) => (await core.handlers[channel]!(...args)) as InvokeResult<C>;
  const say = (text: string, channel: "me" | "other" = "other") =>
    call("avalet:capture-audio-chunk", Buffer.from(`TEXT:${text}`).toString("base64"), channel, {
      startedAt: Date.now() - 1_000,
      endedAt: Date.now(),
      endedBySilence: true,
    });
  const doc = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8").replace("## 2. Термины", `## 2. Термины ${TEXT_CANARY}`);
  try {
    setSelectedProviderId("openai");
    updateProviderSettings("openai", { baseUrl: `${mock.url}/openai/v1`, model: "gpt-4.1-mini" });
    setApiKey("openai", KEY_CANARY);
    await call("avalet:speech-model-download", "small");
    for (let i = 0; i < 400 && !models.isReady("small"); i++) await new Promise((r) => setTimeout(r, 15));
    assert.deepEqual(await call("avalet:artifact-set", { name: `spec-${TEXT_CANARY}.md`, text: doc }), { ok: true });
    assert.deepEqual(await call("avalet:session-start"), { ok: true });
    await say("По разделу 3.1: пятидесяти записей на страницу мало, предлагаю поднять лимит до 100.");
    await say("Согласен, поднимаем до 100 записей.", "me");
    await call("avalet:session-ask", "что сейчас в разделе 2?");
    const meeting = await call("avalet:meetings-current");
    await call("avalet:session-reset");
    await call("avalet:meetings-summarize", meeting!.id);
    const proposed = await call("avalet:artifact-propose", meeting!.id);
    assert.equal(proposed.ok, true);
    const ids = proposed.ok ? proposed.proposal.patches.filter((p) => p.ok).map((p) => p.id) : [];
    await call("avalet:artifact-apply", meeting!.id, ids);
    await call("avalet:meetings-export-artifact", meeting!.id);
  } finally {
    await core.shutdown();
  }
  const log = readLog(logDir);
  assert.ok(log.length > 0);
  assert.ok(!log.includes(TEXT_CANARY), "document text or name in the log");
  assert.ok(!log.includes("canary-91b2"), "the key in the log");
  // The canary really went through: it is in the downloaded document.
  assert.ok(fs.readdirSync(exports).some((f) => fs.readFileSync(path.join(exports, f), "utf8").includes(TEXT_CANARY)));
});
