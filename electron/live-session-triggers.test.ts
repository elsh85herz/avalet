import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  AUTO_PACING,
  BALANCED_PACING,
  LIVE_PACING,
  LiveSession,
  QUIET_PACING,
  shouldAutoSuggest,
  type AutoPacing,
  type LiveSessionEvents,
} from "./live-session.js";
import type { PythonRuntime } from "./python-runtime.js";
import { setAutoDetectEnabled, setMeetingMode, setSelectedProviderId, updateProviderSettings } from "./settings-store.js";
import { MEETING_MODES } from "./modes.js";
import { configureAvaletProvider } from "./provider-credentials.js";
import { setupStores } from "./testing/stores.js";

// When a suggestion is generated: the other side pausing, a question or
// change cue, never twice within the mode's minimum gap, a fallback after long
// plain speech; nothing while paused or with auto-suggest off. The session
// tests below run in interview mode (the live pace: 6 s, any pause, 45 s);
// the calmer paces of the other modes are tested further down.

const realFetch = globalThis.fetch;
let modelCalls = 0;

function sse(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`;
}

beforeEach(() => {
  setupStores({});
  setSelectedProviderId("custom");
  setMeetingMode("interview");
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

// --- quieter defaults (CLOUD_TASK_4 phase 3) ---

test("pace per mode: interview live, free balanced, modes with a board quiet", () => {
  assert.equal(AUTO_PACING.interview, LIVE_PACING);
  assert.equal(AUTO_PACING.free, BALANCED_PACING);
  for (const mode of ["requirements", "grooming", "demo", "review"] as const) assert.equal(AUTO_PACING[mode], QUIET_PACING);
  for (const mode of MEETING_MODES) assert.ok(AUTO_PACING[mode], mode);
  // Interview keeps the tuned 0.1 numbers.
  assert.deepEqual(LIVE_PACING, { minIntervalMs: 6_000, pauseMinChars: 0, maxIntervalMs: 45_000, fallbackChars: 260 });
  // Each step is at least as calm as the one before on every knob.
  const order: AutoPacing[] = [LIVE_PACING, BALANCED_PACING, QUIET_PACING];
  for (let i = 1; i < order.length; i++) {
    for (const key of ["minIntervalMs", "pauseMinChars", "maxIntervalMs", "fallbackChars"] as const) {
      assert.ok(order[i]![key] >= order[i - 1]![key], key);
    }
  }
});

test("quiet pace: a short remark with a pause waits, a substantial one or a question after 25 s fires", () => {
  const short = "Лимит меняется в приложении.";
  const long = "Лимит меняется в приложении клиентом самостоятельно, выше порога нужен звонок из колл-центра, а для корпоративных карт отдельный процесс согласования с менеджером и риск-офицером, который смотрит историю операций за последний месяц и решает в течение рабочего дня. Для зарплатных карт порог выше, а для новых клиентов первые три месяца ниже.";
  assert.ok(long.length >= QUIET_PACING.pauseMinChars);
  const q = (heard: string, sinceLastMs: number, otherJustPaused = true) => shouldAutoSuggest({ pacing: QUIET_PACING, heard, sinceLastMs, otherJustPaused });
  assert.equal(q(short, 60_000), false, "a pause after a short remark is not enough");
  assert.equal(q(long, 60_000), true);
  assert.equal(q(long, 20_000), false, "never within 25 s");
  assert.equal(q("а кто подтверждает?", 20_000), false);
  assert.equal(q("а кто подтверждает?", 26_000), true);
  assert.equal(q(long, 89_000, false), false, "no pause, no cue: waits for the 90 s safety net");
  assert.equal(q(long + " " + long, 91_000, false), true);
  assert.equal(q("", 120_000), false);
});

test("balanced pace (free): a pause fires after 120 characters and 15 s", () => {
  const b = (heard: string, sinceLastMs: number, otherJustPaused = true) => shouldAutoSuggest({ pacing: BALANCED_PACING, heard, sinceLastMs, otherJustPaused });
  const medium = "Нам нужно, чтобы клиент мог менять дневной лимит по карте прямо в приложении, без звонка в банк и без похода в отделение.";
  assert.ok(medium.length >= 120);
  assert.equal(b("Коротко о лимитах.", 30_000), false);
  assert.equal(b(medium, 30_000), true);
  assert.equal(b(medium, 10_000), false);
  assert.equal(b("давай поменяем схему", 16_000, false), true, "a change cue");
});

test("in a requirements meeting the session waits 25 s between automatic suggestions; asking stays instant", async () => {
  setMeetingMode("requirements");
  const s = session();
  s.live.start();
  await s.say("первый вопрос?", true);
  assert.equal(starts(s.rec), 1);
  s.clock.now += 10_000;
  await s.say("второй вопрос?", true);
  assert.equal(starts(s.rec), 1, "10 s later: too soon for the quiet pace");
  await s.live.askManual("Что спросить дальше?");
  assert.equal(starts(s.rec), 2, "a direct ask ignores the pace");
  s.clock.now += 26_000;
  await s.say("третий вопрос?", true);
  assert.equal(starts(s.rec), 3);
});

/**
 * A made-up 10-minute call (deterministic): phrases of 3 to 9 s at about 14
 * characters a second, the other side and the analyst taking turns, a question
 * in about one phrase of four, every phrase ending on a pause. Used to show
 * the saving of the quieter paces in numbers (auto-hints-plan.md).
 */
export function simulateCall(pacing: AutoPacing, minutes = 10, generationMs = 3_000): number {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let t = 0;
  let lastAt = -Infinity;
  let busyUntil = -Infinity;
  let heard = "";
  let calls = 0;
  let turn = 0;
  while (t < minutes * 60_000) {
    const seconds = 3 + Math.floor(rand() * 7);
    t += seconds * 1_000;
    const speaker = turn++ % 3 === 2 ? "me" : "other";
    const question = rand() < 0.25;
    heard = `${heard} ${"слово ".repeat(Math.round((seconds * 14) / 6)).trim()}${question ? " как это сделать?" : "."}`.trim();
    if (t < busyUntil) continue;
    if (shouldAutoSuggest({ pacing, heard, sinceLastMs: t - lastAt, otherJustPaused: speaker === "other" })) {
      calls += 1;
      lastAt = t;
      busyUntil = t + generationMs;
      heard = "";
    }
  }
  return calls;
}

test("on a simulated 10-minute call the quiet pace makes well under half the automatic calls of the old pace", () => {
  const old = simulateCall(LIVE_PACING);
  const balanced = simulateCall(BALANCED_PACING);
  const quiet = simulateCall(QUIET_PACING);
  assert.ok(balanced < old, `balanced ${balanced} vs old ${old}`);
  assert.ok(quiet < balanced, `quiet ${quiet} vs balanced ${balanced}`);
  assert.ok(quiet <= old * 0.4, `quiet ${quiet} vs old ${old}`);
  assert.ok(quiet >= 10, `quiet still helps along the way: ${quiet} in 10 min`);
});
