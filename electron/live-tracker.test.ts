import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { LiveTracker } from "./live-tracker.js";
import { appendSegment, getCurrentMeeting, startMeeting } from "./meetings-store.js";
import { setLiveTrackerEnabled, setUiLevel, getLiveTrackerEnabled } from "./settings-store.js";
import type { GenerateRequest } from "./providers/types.js";
import { setupStores } from "./testing/stores.js";

// The live checklist's trigger rules, exercised on the real class with a fake
// model and a fake clock: pause of the other side, at least 30 s between
// calls, at most 90 s without one, at least 80 new characters, marks only
// move forward, hand-set marks are never overwritten.

type Harness = {
  tracker: LiveTracker;
  calls: GenerateRequest[];
  clock: { now: number };
  reply: { text: string };
  say: (text: string, endsWithPause?: boolean) => boolean;
  settle: () => Promise<void>;
};

function harness(agenda: string[] = ["Какой лимит", "Кто подтверждает"]): Harness {
  const calls: GenerateRequest[] = [];
  const clock = { now: 0 };
  const reply = { text: '{"agenda":[],"actions":[]}' };
  let pending: Promise<unknown> = Promise.resolve();
  const tracker = new LiveTracker({
    onUpdate: () => {},
    isEnabled: getLiveTrackerEnabled,
    now: () => clock.now,
    generate: async (request) => {
      calls.push(request);
      const done = Promise.resolve().then(() => request.onDelta(reply.text));
      pending = done;
      await done;
      return reply.text;
    },
  });
  const meeting = startMeeting({ mode: "requirements", context: "", agenda });
  // 30 s into the meeting: the first call is allowed from here on.
  clock.now = meeting.startedAt + 30_000;
  let at = 0;
  const say = (text: string, endsWithPause = false) => {
    appendSegment({ at: ++at, speaker: "other", text });
    return tracker.note(endsWithPause);
  };
  const settle = async () => {
    await pending;
    await new Promise((r) => setImmediate(r));
  };
  return { tracker, calls, clock, reply, say, settle };
}

const LONG = "Дневной лимит меняется в приложении, выше порога нужен звонок из колл-центра, это уже есть."; // > 80 chars

beforeEach(() => {
  setupStores({}, { forceAdvanced: true });
});

test("nothing in the first 30 s of a meeting", async () => {
  const h = harness();
  h.clock.now -= 1_000;
  assert.equal(h.say(LONG, true), false);
});

test("runs on a pause of the other side once there is enough new speech", async () => {
  const h = harness();
  assert.equal(h.say("Коротко.", true), false, "too little new speech");
  assert.equal(h.say(LONG, false), false, "no pause and the 90 s cap not reached");
  assert.equal(h.say("И ещё.", true), true);
  await h.settle();
  assert.equal(h.calls.length, 1);
});

test("never twice within 30 s, even when the other side keeps pausing", async () => {
  const h = harness();
  h.say(LONG, true);
  await h.settle();
  h.clock.now += 29_000;
  assert.equal(h.say(LONG, true), false);
  h.clock.now += 1_000;
  assert.equal(h.say("Ещё немного.", true), true);
  await h.settle();
  assert.equal(h.calls.length, 2);
});

test("without any pause it still runs after 90 s", async () => {
  const h = harness();
  h.say(LONG, true);
  await h.settle();
  h.clock.now += 60_000;
  assert.equal(h.say(LONG, false), false, "60 s, no pause: wait");
  h.clock.now += 30_000;
  assert.equal(h.say("Продолжаем.", false), true, "90 s cap reached");
});

test("counts only speech since the last call (80 characters minimum)", async () => {
  const h = harness();
  h.say(LONG, true);
  await h.settle();
  h.clock.now += 120_000;
  assert.equal(h.say("Да.", true), false, "3 new characters after the last call");
  assert.equal(h.say("Хорошо, договорились по срокам и по владельцу, записываю себе задачу на пятницу.", true), true);
});

test("agenda marks only move forward and hand-set marks are never overwritten", async () => {
  const h = harness(["Какой лимит", "Кто подтверждает", "Сроки"]);
  h.reply.text = JSON.stringify({
    agenda: [
      { index: 1, state: "closed", note: "дневной" },
      { index: 2, state: "active", note: "" },
    ],
    actions: [],
  });
  h.say(LONG, true);
  await h.settle();
  let state = h.tracker.getState();
  assert.equal(state.agendaStatus[0].closed, true);
  assert.equal(state.agendaStatus[1].active, true);

  // The analyst marks question 3 closed by hand.
  state = h.tracker.toggleAgenda(2);
  assert.equal(state.agendaStatus[2].closed, true);
  assert.equal(state.agendaStatus[2].manual, true);

  // Next reply tries to reopen question 1 and to touch the hand-set question 3.
  h.reply.text = JSON.stringify({
    agenda: [
      { index: 1, state: "open", note: "" },
      { index: 1, state: "active", note: "снова обсуждают" },
      { index: 3, state: "active", note: "модель считает, что не закрыт" },
    ],
    actions: [],
  });
  h.clock.now += 31_000;
  h.say(LONG, true);
  await h.settle();
  state = h.tracker.getState();
  assert.equal(state.agendaStatus[0].closed, true, "closed stays closed");
  assert.equal(state.agendaStatus[0].note, "дневной");
  assert.equal(state.agendaStatus[2].closed, true, "hand mark kept");
  assert.equal(state.agendaStatus[2].note, "", "hand-marked question untouched");
});

test("background calls use the cheaper model of the provider", async () => {
  const h = harness();
  h.say(LONG, true);
  await h.settle();
  assert.equal(h.calls[0].model, "claude-haiku-4-5");
});

test("switched off: no automatic call, no refresh, hand marks still work", async () => {
  setLiveTrackerEnabled(false);
  const h = harness();
  assert.equal(h.say(LONG, true), false);
  await h.tracker.refresh();
  assert.equal(h.calls.length, 0);
  assert.equal(h.tracker.getState().enabled, false);
  const state = h.tracker.toggleAgenda(0);
  assert.equal(state.agendaStatus[0].closed, true);
  assert.ok(getCurrentMeeting());
});

test("default: on in Advanced, off in Simple, an explicit choice wins", () => {
  setupStores({});
  assert.equal(getLiveTrackerEnabled(), false, "new user: Simple, off");
  setUiLevel("advanced");
  assert.equal(getLiveTrackerEnabled(), true);
  setLiveTrackerEnabled(false);
  assert.equal(getLiveTrackerEnabled(), false);
  setUiLevel("simple");
  setLiveTrackerEnabled(true);
  assert.equal(getLiveTrackerEnabled(), true);
});
