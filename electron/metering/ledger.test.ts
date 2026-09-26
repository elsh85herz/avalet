import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEntry, emptyLedger, monthKey, summarize, UsageLedger, type LedgerEntry } from "./ledger.js";
import { modelWeight, weightedTokens, WEIGHT_FLASH, WEIGHT_PREMIUM } from "./model-weights.js";
import { configureMetering, meteredGenerate } from "./metered.js";
import { MemoryKV } from "../platform/kv.js";
import type { GenerateRequest } from "../providers/types.js";

const at = new Date(2026, 8, 15, 12).getTime(); // 15 Sep 2026

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at,
    providerId: "anthropic",
    model: "claude-haiku-4-5",
    purpose: "suggestion",
    inputTokens: 1000,
    outputTokens: 100,
    estimated: false,
    tier: "own",
    trial: false,
    meetingId: "m1",
    ...over,
  };
}

test("model weights: flash x1, premium x4, unknown counts as premium", () => {
  assert.equal(modelWeight("claude-haiku-4-5"), WEIGHT_FLASH);
  assert.equal(modelWeight("gpt-4.1-mini"), WEIGHT_FLASH);
  assert.equal(modelWeight("deepseek-flash"), WEIGHT_FLASH);
  assert.equal(modelWeight("avalet-fast"), WEIGHT_FLASH);
  assert.equal(modelWeight("claude-sonnet-5"), WEIGHT_PREMIUM);
  assert.equal(modelWeight("gpt-4.1"), WEIGHT_PREMIUM);
  assert.equal(modelWeight("avalet-premium"), WEIGHT_PREMIUM);
  assert.equal(modelWeight("something-new"), WEIGHT_PREMIUM);
  assert.equal(weightedTokens(100, 50, "claude-sonnet-5"), 600);
});

test("ledger totals per month, per tier and per purpose", () => {
  let state = emptyLedger();
  state = applyEntry(state, entry());
  state = applyEntry(state, entry({ purpose: "tracker", model: "claude-sonnet-5", inputTokens: 10, outputTokens: 5 }));
  state = applyEntry(state, entry({ tier: "avalet", trial: true, model: "avalet-fast", purpose: "summary" }));
  const summary = summarize(state, at, "m1");
  assert.equal(summary.month, "2026-09");
  assert.deepEqual(summary.own, { inputTokens: 1010, outputTokens: 105, weighted: 1100 + 60, calls: 2, estimatedCalls: 0 });
  assert.equal(summary.avalet.weighted, 1100);
  assert.equal(summary.trialWeighted, 1100);
  assert.equal(summary.byPurpose.tracker.weighted, 60);
  assert.equal(summary.byPurpose.summary.calls, 1);
  assert.equal(summary.meeting?.calls, 3);
});

test("a new month starts from zero; estimated calls are counted", () => {
  let state = applyEntry(emptyLedger(), entry({ estimated: true }));
  const october = new Date(2026, 9, 1, 9).getTime();
  assert.equal(monthKey(october), "2026-10");
  assert.equal(summarize(state, october, null).own.calls, 0);
  state = applyEntry(state, entry({ at: october }));
  assert.equal(summarize(state, october, null).own.calls, 1);
  assert.equal(summarize(state, at, null).own.estimatedCalls, 1);
});

test("bounded: last 100 calls and last 50 meetings", () => {
  let state = emptyLedger();
  for (let i = 0; i < 130; i++) state = applyEntry(state, entry({ meetingId: `m${i}` }));
  assert.equal(state.recent.length, 100);
  assert.equal(Object.keys(state.meetings).length, 50);
  assert.ok(state.meetings.m129);
  assert.equal(state.meetings.m0, undefined);
});

test("stored ledger survives a reload and ignores garbage", () => {
  const kv = new MemoryKV();
  const ledger = new UsageLedger(kv);
  let changes = 0;
  ledger.onChange(() => changes++);
  ledger.record(entry());
  assert.equal(new UsageLedger(kv).summary(at, null).own.calls, 1);
  assert.equal(changes, 1);
  kv.set("ledger", "junk");
  assert.equal(new UsageLedger(kv).summary(at, null).own.calls, 0);
});

test("metered calls record real usage, with tier from billing", async () => {
  const kv = new MemoryKV();
  const ledger = new UsageLedger(kv);
  configureMetering({
    ledger,
    tierOf: (id) => (id === "avalet" ? { tier: "avalet", trial: true } : { tier: "own", trial: false }),
    currentMeetingId: () => "meet",
    now: () => at,
  });
  const request: GenerateRequest = {
    providerId: "avalet",
    apiKey: "",
    model: "avalet-fast",
    systemPrompt: "s",
    transcript: "t",
    signal: new AbortController().signal,
    onDelta: () => {},
  };
  await meteredGenerate("tracker", request, async (r) => {
    r.onDelta("x");
    return { text: "x", usage: { inputTokens: 50, outputTokens: 5, estimated: false } };
  });
  const summary = ledger.summary(at, "meet");
  assert.equal(summary.avalet.weighted, 55);
  assert.equal(summary.trialWeighted, 55);
  assert.equal(summary.byPurpose.tracker.calls, 1);
  configureMetering(null);
});

test("a stream stopped halfway is still recorded, as an estimate", async () => {
  const ledger = new UsageLedger(new MemoryKV());
  configureMetering({ ledger, tierOf: () => ({ tier: "own", trial: false }), currentMeetingId: () => null, now: () => at });
  const request: GenerateRequest = {
    providerId: "openai",
    apiKey: "k",
    model: "gpt-4.1",
    systemPrompt: "s".repeat(300),
    transcript: "t".repeat(300),
    signal: new AbortController().signal,
    onDelta: () => {},
  };
  await assert.rejects(
    meteredGenerate("suggestion", request, async (r) => {
      r.onDelta("partial answer");
      const abort = new Error("aborted");
      abort.name = "AbortError";
      throw abort;
    }),
  );
  const summary = ledger.summary(at, null);
  assert.equal(summary.own.calls, 1);
  assert.equal(summary.own.estimatedCalls, 1);
  assert.equal(summary.own.inputTokens, 200);
  // A failure before any output (e.g. 401) costs nothing and is not recorded.
  await assert.rejects(meteredGenerate("suggestion", request, async () => { throw new Error("401"); }));
  assert.equal(ledger.summary(at, null).own.calls, 1);
  configureMetering(null);
});
