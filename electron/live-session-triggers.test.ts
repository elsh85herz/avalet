import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { LiveSession, type LiveSessionEvents } from "./live-session.js";
import type { PythonRuntime } from "./python-runtime.js";
import { setAutoDetectEnabled, setSelectedProviderId, updateProviderSettings } from "./settings-store.js";
import { configureAvaletProvider } from "./provider-credentials.js";
import { setupStores } from "./testing/stores.js";

// When a suggestion is generated: the other side pausing, a question or
// change cue, never twice within 6 s, a fallback after 45 s of plain speech;
// nothing while paused or with auto-suggest off.

const realFetch = globalThis.fetch;
let modelCalls = 0;

function sse(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`;
}

beforeEach(() => {
  setupStores({});
  setSelectedProviderId("custom");
  updateProviderSettings("custom", { baseUrl: "http://model.test/v1", model: "llama3.1" });
  modelCalls = 0;
  globalThis.fetch = (async (_url: unknown, init?: { signal?: AbortSignal }) => {
    modelCalls += 1;
    if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return new Response(sse("Уточните порог."), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  configureAvaletProvider(null);
});

type Recorder = { events: string[]; blocks: Map<string, string>; errors: Array<{ message: string; code?: string }> };

function session(options: { transcribe?: (audio: string) => Promise<{ text: string }> } = {}) {
  const clock = { now: 1_000_000 };
  const rec: Recorder = { events: [], blocks: new Map(), errors: [] };
  const problems: string[] = [];
  const sidecar = {
    call: async (_cmd: string, params: { audio_base64: string }) =>
      options.transcribe ? options.transcribe(params.audio_base64) : { text: Buffer.from(params.audio_base64, "base64").toString("utf8") },
  } as unknown as PythonRuntime;
  const events: LiveSessionEvents = {
    onBlockStart: (b) => {
      rec.events.push("start");
      rec.blocks.set(b.id, "");
    },
    onBlockDelta: (id, d) => rec.blocks.set(id, (rec.blocks.get(id) ?? "") + d),
    onBlockDone: () => rec.events.push("done"),
    onBlockError: (_id, message, code) => rec.errors.push({ message, code }),
    onStateChange: (s) => rec.events.push(`state:${s}`),
    onTranscriptionError: (m) => rec.events.push(`transcription-error:${m}`),
    onTranscriptionRecovered: () => rec.events.push("recovered"),
    onTranscriptSegment: () => rec.events.push("segment"),
    onAccessProblem: (p) => problems.push(p),
  };
  const live = new LiveSession(sidecar, events, async () => null, async () => null, () => clock.now);
  const say = async (text: string, endedBySilence: boolean) => {
    await live.ingestAudioChunk(Buffer.from(text).toString("base64"), "other", {
      startedAt: clock.now - 1000,
      endedAt: clock.now,
      endedBySilence,
    });
    await new Promise((r) => setTimeout(r, 20));
  };
  return { live, clock, rec, say, problems };
}

const starts = (rec: Recorder) => rec.events.filter((e) => e === "start").length;

test("a pause of the other side triggers a suggestion", async () => {
  const s = session();
  s.live.start();
  await s.say("Нам нужно менять дневной лимит в приложении", true);
  assert.equal(starts(s.rec), 1);
  assert.equal([...s.rec.blocks.values()][0], "Уточните порог.");
});

test("no pause and no cue: nothing; a question mark is a cue", async () => {
  const s = session();
  s.live.start();
  await s.say("Нам нужно менять дневной лимит", false);
  assert.equal(starts(s.rec), 0);
  await s.say("а кто подтверждает выше порога?", false);
  assert.equal(starts(s.rec), 1);
});

test("a change cue triggers too", async () => {
  const s = session();
  s.live.start();
  await s.say("давай поменяем схему, добавим поле статус", false);
  assert.equal(starts(s.rec), 1);
});

test("never two suggestions within 6 seconds", async () => {
  const s = session();
  s.live.start();
  await s.say("первый вопрос?", true);
  s.clock.now += 5_000;
  await s.say("второй вопрос?", true);
  assert.equal(starts(s.rec), 1);
  s.clock.now += 1_000;
  await s.say("третий вопрос?", true);
  assert.equal(starts(s.rec), 2);
});

test("long plain speech falls back to a suggestion after 45 seconds", async () => {
  const s = session();
  s.live.start();
  await s.say("начало разговора?", true);
  const plain = "Мы обсуждаем процесс изменения лимитов и порядок согласования с отделом рисков ".repeat(4);
  s.clock.now += 30_000;
  await s.say(plain, false);
  assert.equal(starts(s.rec), 1, "long but only 30 s later");
  s.clock.now += 15_000;
  await s.say("и ещё немного деталей про интеграцию", false);
  assert.equal(starts(s.rec), 2);
});

test("auto-suggest off: speech only accumulates; Process now uses it", async () => {
  setAutoDetectEnabled(false);
  const s = session();
  s.live.start();
  await s.say("вопрос?", true);
  assert.equal(starts(s.rec), 0);
  await s.live.processNow();
  assert.equal(starts(s.rec), 1);
});

test("paused: audio is ignored", async () => {
  const s = session();
  await s.say("вопрос?", true);
  assert.equal(s.rec.events.includes("segment"), false);
  assert.equal(s.live.getState(), "idle");
});

test("two failed transcriptions in a row are reported once, recovery is reported", async () => {
  let fail = 3;
  const s = session({
    transcribe: async (audio) => {
      if (fail-- > 0) throw new Error("sidecar busy");
      return { text: Buffer.from(audio, "base64").toString("utf8") };
    },
  });
  s.live.start();
  await s.say("a", false);
  assert.equal(s.rec.events.filter((e) => e.startsWith("transcription-error")).length, 0, "one blip is normal");
  await s.say("b", false);
  await s.say("c", false);
  assert.equal(s.rec.events.filter((e) => e.startsWith("transcription-error")).length, 1);
  await s.say("теперь работает", false);
  assert.ok(s.rec.events.includes("recovered"));
});

test("the built-in provider without access gives the paywall, not an error text", async () => {
  setSelectedProviderId("avalet");
  configureAvaletProvider({ proxyBaseUrl: () => "http://x.test/v1/llm", token: () => null });
  const s = session();
  s.live.start();
  await s.say("вопрос?", true);
  assert.equal(modelCalls, 0, "nothing sent without a usable token");
  assert.deepEqual(s.rec.errors, [{ message: "", code: "paywall" }]);
  assert.deepEqual(s.problems, ["blocked"]);
  assert.ok(s.rec.events.includes("segment"), "the transcript keeps going");
});

test("stop aborts a streaming suggestion and freezes; reset forgets the call", async () => {
  const s = session();
  s.live.start();
  await s.say("вопрос?", true);
  s.live.stop();
  assert.equal(s.live.getState(), "paused");
  s.live.reset();
  assert.equal(s.live.getState(), "idle");
});
