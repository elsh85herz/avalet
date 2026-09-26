import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { AppCore, type Emit } from "./app-core.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { BillingService } from "./billing/service.js";
import { HttpBillingProvider } from "./billing/http-provider.js";
import { MemoryKV, fakeSecretBox } from "./platform/kv.js";
import { getSelectedProviderId, setSelectedProviderId, updateProviderSettings } from "./settings-store.js";
import { fixturePath, mockPost, setupStores, startMockServer, tempDir, type MockServer } from "./testing/stores.js";
import type { EventChannel, EventMap, InvokeChannel, InvokeResult } from "./shared/ipc-contract.js";

// The main process without Electron: AppCore's real IPC handlers, the
// recognizer as a separate process (fake sidecar speaking the same JSON-RPC),
// the model download as a separate process (fake), billing and the model
// behind HTTP (server-mock). One full meeting, then the paywall.

let mock: MockServer;
before(async () => {
  mock = await startMockServer();
});
after(async () => {
  await mock.close();
});

type Recorded = { channel: EventChannel; payload: unknown };

function harness() {
  const { dir } = setupStores({ onboardingDone: true });
  const hfCache = path.join(dir, "hf");
  const exports = path.join(dir, "exports");
  fs.mkdirSync(exports, { recursive: true });
  const events: Recorded[] = [];
  const emit: Emit = (channel, payload) => {
    events.push({ channel, payload });
  };
  const sidecar = new PythonRuntime(() => ({ command: process.execPath, args: [fixturePath("fake-sidecar.mjs")] }), 10_000);
  const models = new SpeechModelManager({
    cacheDir: () => hfCache,
    spawnDownload: (model) =>
      spawn(process.execPath, [fixturePath("fake-model-download.mjs"), model], {
        env: { ...process.env, HF_HUB_CACHE: hfCache, FAKE_DOWNLOAD_STEP_MS: "5" },
        stdio: ["ignore", "ignore", "pipe"],
      }),
    onChange: (rows) => emit("avalet:event:models-changed", rows),
    pollMs: 10,
  });
  const billing = new BillingService({
    kv: new MemoryKV(),
    secrets: fakeSecretBox,
    publicKeys: [mock.publicKeyPem],
    makeProvider: (identity) => new HttpBillingProvider(mock.url, identity),
    selectedProviderId: getSelectedProviderId,
    ownKeyReady: () => AppCore.ownKeyReady(getSelectedProviderId()),
    onChange: (state) => emit("avalet:event:access-changed", state),
    openExternal: () => {},
  });
  const core = new AppCore({
    sidecar,
    models,
    ledger: new UsageLedger(new MemoryKV()),
    billing,
    avaletProxyUrl: `${mock.url}/v1/llm`,
    emit,
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async (name, _filter, ext) => path.join(exports, `${name}.${ext}`),
  });
  async function call<C extends InvokeChannel>(channel: C, ...args: unknown[]): Promise<InvokeResult<C>> {
    const handler = core.handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (await handler(...args)) as InvokeResult<C>;
  }
  const of = <C extends EventChannel>(channel: C) => events.filter((e) => e.channel === channel).map((e) => e.payload as EventMap[C]);
  async function until(check: () => boolean, ms = 10_000) {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > ms) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  const say = (text: string, channel: "me" | "other" = "other") =>
    call("avalet:capture-audio-chunk", Buffer.from(`TEXT:${text}`).toString("base64"), channel, {
      startedAt: Date.now() - 1_000,
      endedAt: Date.now(),
      endedBySilence: true,
    });
  return { core, call, of, until, say, exports, events };
}

test("full meeting on an own-key provider: start, transcript, suggestion, stop, summary, export .md and .txt", async () => {
  const h = harness();
  setSelectedProviderId("custom");
  updateProviderSettings("custom", { baseUrl: `${mock.url}/openai/v1`, model: "local-model" });
  await h.call("avalet:agenda-set", "Какой лимит: дневной или разовый\nКто подтверждает");
  await h.call("avalet:context-set", "Проект лимитов по картам");
  try {
    // No speech model yet: Start explains instead of downloading silently.
    assert.deepEqual(await h.call("avalet:session-start"), { ok: false, reason: "model-missing", model: "small" });
    assert.equal(h.of("avalet:event:meeting-started").length, 0);
    await h.call("avalet:speech-model-download", "small");
    await h.until(() => h.of("avalet:event:models-changed").some((rows) => rows.find((r) => r.name === "small")?.state === "ready"));

    assert.deepEqual(await h.call("avalet:session-start"), { ok: true });
    const meeting = h.of("avalet:event:meeting-started")[0];
    assert.deepEqual(meeting.agenda, ["Какой лимит: дневной или разовый", "Кто подтверждает"]);
    assert.equal(await h.call("avalet:session-get-state"), "listening");

    await h.say("Нам нужно, чтобы клиент мог менять дневной лимит в приложении?");
    await h.until(() => h.of("avalet:event:block-done").length === 1);
    const text = h
      .of("avalet:event:block-delta")
      .map((d) => d.delta)
      .join("");
    assert.match(text, /Уточните/);
    assert.equal(h.of("avalet:event:transcript-segment").length, 1);
    const usage = await h.call("avalet:usage-get");
    assert.equal(usage.own.calls, 1);
    assert.equal(usage.own.estimatedCalls, 0, "the mock model reports real usage");
    assert.equal(usage.meeting?.calls, 1);

    await h.say("Дневной, выше трёхсот тысяч подтверждает колл-центр.");
    await h.call("avalet:session-stop");
    assert.equal(await h.call("avalet:session-get-state"), "paused");
    // Audio after Stop is ignored.
    await h.say("это уже не должно попасть в расшифровку");
    const current = await h.call("avalet:meetings-current");
    assert.equal(current?.transcript.length, 2);

    const summary = await h.call("avalet:meetings-summarize", meeting.id);
    assert.match(summary, /Обсуждения/);
    assert.doesNotMatch(summary, /@@AVALET_JSON@@/, "the machine-readable tail never reaches the text");
    const done = h.of("avalet:event:summary-done")[0];
    assert.equal(done.agendaStatus?.[0].closed, true);
    assert.equal(done.actions?.[0].task, "Прислать описание процесса колл-центра");

    const labels = { me: "Я", other: "Собеседник", date: "Дата", agenda: "Повестка", actions: "Поручения", actionTask: "Задача", actionOwner: "Кто", actionDue: "Срок" };
    const mdPath = await h.call("avalet:meetings-export", meeting.id, labels, "Требования");
    const txtPath = await h.call("avalet:meetings-export-transcript", meeting.id, labels);
    assert.ok(mdPath && txtPath);
    const md = fs.readFileSync(mdPath!, "utf8");
    assert.match(md, /^# Встреча/);
    assert.match(md, /- \[x\] Какой лимит: дневной или разовый \(дневной\)/);
    assert.match(md, /\| Прислать описание процесса колл-центра \| Собеседник \| до пятницы \|/);
    assert.doesNotMatch(md, /Нам нужно, чтобы клиент/, "the protocol carries no transcript");
    const txt = fs.readFileSync(txtPath!, "utf8");
    assert.match(txt, /\[00:00:0\d\] Собеседник: Нам нужно, чтобы клиент мог менять дневной лимит/);
    assert.equal(path.dirname(mdPath!), h.exports);

    await h.call("avalet:session-reset");
    assert.equal(await h.call("avalet:session-get-state"), "idle");
    assert.equal(h.of("avalet:event:meeting-ended")[0]?.id, meeting.id);
    assert.equal((await h.call("avalet:meetings-list")).length, 1);
  } finally {
    await h.core.shutdown();
  }
});

test("export file names cannot escape the chosen folder", async () => {
  const { safeFileName } = await import("./app-core.js");
  // No path separators survive, so path.join(folder, name) stays in the folder.
  assert.equal(safeFileName("../../etc/passwd"), "-..-etc-passwd");
  assert.equal(safeFileName("..hidden"), "hidden");
  assert.equal(safeFileName('a/b\\c:d*e?f"g<h>i|j'), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(safeFileName("\u0000\u0007"), "meeting");
  assert.equal(safeFileName("x".repeat(200)).length, 80);
});

test("built-in provider: trial suggestions through the proxy, then the budget runs out and the paywall shows", async () => {
  const h = harness();
  try {
    await h.call("avalet:settings-select-provider", "avalet");
    const access = await h.call("avalet:billing-activate-trial");
    assert.equal(access.tier, "trial");
    await h.call("avalet:speech-model-download", "small");
    await h.until(() => h.of("avalet:event:models-changed").some((rows) => rows.find((r) => r.name === "small")?.state === "ready"));
    assert.deepEqual(await h.call("avalet:session-start"), { ok: true });

    await h.say("Какой лимит нужен клиенту?");
    await h.until(() => h.of("avalet:event:block-done").length === 1);
    const usage = await h.call("avalet:usage-get");
    assert.equal(usage.avalet.calls, 1);
    assert.ok(usage.trialWeighted > 0);
    const installId = [...mock.installs.keys()].at(-1)!;
    assert.ok(mock.installs.get(installId)!.used > 0, "the server metered the proxied call");

    // The server's budget runs out between refreshes: the proxy answers 402.
    await mockPost(mock, "/mock/usage", { installId, weighted: 500_000 });
    await new Promise((r) => setTimeout(r, 6_100)); // the 6 s minimum between suggestions
    await h.say("А кто подтверждает изменение?");
    await h.until(() => h.of("avalet:event:paywall").length > 0);
    const blockErrors = h.of("avalet:event:block-error");
    assert.equal(blockErrors.at(-1)?.code, "paywall");
    await h.until(() => h.of("avalet:event:access-changed").some((a) => a.status === "exhausted"));
    const current = await h.call("avalet:meetings-current");
    assert.equal(current?.transcript.length, 2, "the transcript keeps recording");

    // While exhausted, calls are held back locally: nothing more reaches the proxy.
    const callsBefore = mock.llmCalls.length;
    await h.call("avalet:session-ask", "Что спросить?");
    assert.equal(mock.llmCalls.length, callsBefore);
  } finally {
    await h.core.shutdown();
  }
});
