import assert from "node:assert/strict";
import { test } from "node:test";
import { problemsOf, problemText, readinessOf, topProblem, PROBLEM_ORDER, type ProblemInput } from "../src/renderer/lib/problems.js";
import { UI_STRINGS } from "../src/renderer/lib/i18n.js";
import type { AccessState, AccessStatus, SpeechModelRow } from "../electron/shared/ipc-contract.js";

// The Simple home shows one problem at a time, most blocking first, and never
// a wrong one: budget or limit wording only for a really exhausted Avalet plan.

function access(over: Partial<AccessState> = {}): AccessState {
  return {
    mode: "own",
    tier: "own",
    status: "ok",
    canUseAvalet: false,
    activated: false,
    plan: null,
    budget: 0,
    used: 0,
    remaining: 0,
    periodEnd: null,
    renews: false,
    lastSyncAt: null,
    graceEndsAt: null,
    price: { amount: 990, currency: "RUB", period: "month" },
    proBudget: 5_000_000,
    trialBudget: 500_000,
    checkoutPending: false,
    syncError: null,
    builtInAvailable: false,
    keyCheck: "ok",
    ...over,
  };
}

function row(over: Partial<SpeechModelRow> = {}): SpeechModelRow {
  return { name: "small", state: "ready", bytes: 484_000_000, sizeBytes: 484_000_000, percent: 100, ...over };
}

function input(over: Partial<ProblemInput> = {}): ProblemInput {
  return {
    model: row(),
    waitingForModel: false,
    permissions: { mic: "granted", screen: "granted" },
    micBlockedOnStart: false,
    access: access(),
    startError: null,
    transcriptionError: false,
    audioDegraded: { me: false, other: false },
    capturing: true,
    ...over,
  };
}

test("everything ready: no problem, every readiness item ok", () => {
  assert.equal(topProblem(input()), null);
  assert.deepEqual(
    readinessOf(input()).map((r) => r.state),
    ["ok", "ok", "ok", "ok"],
  );
});

test("order: model, permissions, access, transcription, audio, budget", () => {
  const all = input({
    model: row({ state: "absent", bytes: 0, percent: 0 }),
    permissions: { mic: "denied", screen: "denied" },
    access: access({ mode: "avalet", tier: "trial", status: "exhausted", keyCheck: null, builtInAvailable: true }),
    startError: "boom",
    transcriptionError: true,
    audioDegraded: { me: true, other: false },
  });
  assert.deepEqual(
    problemsOf(all).map((p) => p.kind),
    ["model-missing", "mic-blocked", "screen-blocked", "start-failed", "transcription", "audio-degraded", "avalet-exhausted"],
  );
  // Peel them off one by one: the next most blocking one comes up.
  assert.equal(topProblem({ ...all, model: row() })?.kind, "mic-blocked");
  assert.equal(topProblem({ ...all, model: row(), permissions: { mic: "granted", screen: "denied" } })?.kind, "screen-blocked");
  const noKey = { ...all, model: row(), permissions: { mic: "granted" as const, screen: "granted" as const }, access: access({ status: "no-key", keyCheck: null }) };
  assert.equal(topProblem(noKey)?.kind, "need-key");
  assert.equal(topProblem({ ...noKey, access: access(), startError: null })?.kind, "transcription");
  assert.equal(topProblem({ ...noKey, access: access(), startError: null, transcriptionError: false })?.kind, "audio-degraded");
  // The declared order is complete and has no duplicates.
  assert.equal(new Set(PROBLEM_ORDER).size, PROBLEM_ORDER.length);
});

test("speech model: missing says Download, partial says Continue, downloading shows the percent", () => {
  const t = UI_STRINGS.en;
  const missing = topProblem(input({ model: row({ state: "absent", bytes: 0, percent: 0 }) }))!;
  assert.equal(missing.kind, "model-missing");
  assert.equal(problemText(missing, t).action, t.models.download);
  const partial = topProblem(input({ model: row({ state: "absent", bytes: 100_000_000, percent: 20 }) }))!;
  assert.equal(partial.kind, "model-partial");
  assert.equal(problemText(partial, t).action, t.models.continue);
  const downloading = topProblem(input({ model: row({ state: "downloading", bytes: 200_000_000, percent: 41 }) }))!;
  assert.match(problemText(downloading, t).text, /41%/);
  assert.equal(problemText(downloading, t).action, null);
  const waiting = topProblem(input({ model: row({ state: "downloading", percent: 41 }), waitingForModel: true }))!;
  assert.match(problemText(waiting, UI_STRINGS.ru).text, /начнётся сама/);
  assert.equal(readinessOf(input({ model: row({ state: "downloading" }) }))[0].state, "pending");
});

test("a key that is saved but not checked says so, with a Check button, not 'no access'", () => {
  const t = UI_STRINGS.ru;
  const p = topProblem(input({ access: access({ keyCheck: "unchecked" }) }))!;
  assert.equal(p.kind, "key-unchecked");
  assert.deepEqual(problemText(p, t), { text: "Ключ ещё не проверен.", action: "Проверить" });
  assert.equal(topProblem(input({ access: access({ keyCheck: "failed" }) }))?.kind, "key-failed");
  assert.equal(readinessOf(input({ access: access({ keyCheck: "unchecked" }) }))[1].state, "pending");
});

// Words that talk about a budget or a limit, in both languages.
const LIMIT_WORDS = /limit|budget|used up|tokens? (are|is) |лимит|бюджет|закончил|израсходова|токены/i;

test("own key: no state can produce limit, budget or 'tokens used up' text", () => {
  const statuses: AccessStatus[] = ["ok", "no-key", "not-activated", "exhausted", "expired", "offline-grace", "offline-expired", "invalid"];
  const checks = ["unchecked", "ok", "failed", null] as const;
  const models: SpeechModelRow[] = [
    row(),
    row({ state: "absent", bytes: 0, percent: 0 }),
    row({ state: "absent", bytes: 5, percent: 1 }),
    row({ state: "downloading", percent: 50 }),
    row({ state: "error" }),
  ];
  let checked = 0;
  for (const status of statuses) {
    for (const keyCheck of checks) {
      for (const model of models) {
        for (const builtInAvailable of [true, false]) {
          const state = input({
            model,
            transcriptionError: true,
            audioDegraded: { me: true, other: true },
            startError: null,
            access: access({ mode: "own", status, keyCheck, builtInAvailable, remaining: 0, budget: 500_000, used: 500_000 }),
          });
          for (const problem of problemsOf(state)) {
            assert.ok(!problem.kind.startsWith("avalet-"), `own key produced ${problem.kind} for status ${status}`);
            for (const language of ["ru", "en"] as const) {
              const { text, action } = problemText(problem, UI_STRINGS[language]);
              assert.doesNotMatch(`${text} ${action ?? ""}`, LIMIT_WORDS, `own key, ${status}, ${language}: "${text}"`);
              checked += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 100);
});

test("Avalet: the used-up text appears only for a really exhausted plan", () => {
  const exhausted = problemsOf(input({ access: access({ mode: "avalet", status: "exhausted", keyCheck: null, builtInAvailable: true }) }));
  assert.deepEqual(exhausted.map((p) => p.kind), ["avalet-exhausted"]);
  assert.match(problemText(exhausted[0], UI_STRINGS.ru).text, /закончились/);
  for (const status of ["ok", "offline-grace"] as const) {
    assert.deepEqual(problemsOf(input({ access: access({ mode: "avalet", status, canUseAvalet: true, keyCheck: null }) })), []);
  }
  for (const status of ["expired", "offline-expired", "invalid", "not-activated"] as const) {
    for (const problem of problemsOf(input({ access: access({ mode: "avalet", status, keyCheck: null }) }))) {
      assert.doesNotMatch(problemText(problem, UI_STRINGS.en).text, /used up/i, status);
    }
  }
});

test("lost audio is only a problem while capturing; permissions not asked yet are not blocked", () => {
  assert.equal(topProblem(input({ capturing: false, audioDegraded: { me: true, other: true } })), null);
  assert.equal(topProblem(input({ permissions: { mic: "not-determined", screen: "not-determined" } })), null);
  assert.deepEqual(
    readinessOf(input({ permissions: { mic: "not-determined", screen: "denied" } })).slice(2).map((r) => r.state),
    ["pending", "missing"],
  );
  assert.equal(topProblem(input({ micBlockedOnStart: true }))?.kind, "mic-blocked");
});
