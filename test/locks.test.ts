import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistLocked, includedModesText, isUnlocked, modeOptions, planLimitsApply } from "../src/renderer/lib/locks.js";
import { UI_STRINGS } from "../src/renderer/lib/i18n.js";
import { MEETING_MODES, type AccessState, type AccessStatus, type AccessTier, type Feature } from "../electron/shared/ipc-contract.js";

// The renderer side of CLOUD_TASK_3 section 1: with an own key, or in a build
// without a billing server, no picker option is marked, no lock row or preview
// can be shown, and no upgrade wording appears, for any field combination.

function access(over: Partial<AccessState>): AccessState {
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
    builtInAvailable: true,
    keyCheck: "ok",
    features: null,
    ...over,
  };
}

const TIERS: AccessTier[] = ["own", "trial", "pro", "none"];
const STATUSES: AccessStatus[] = ["ok", "no-key", "not-activated", "exhausted", "expired", "offline-grace", "offline-expired", "invalid"];
const FEATURES: Array<Feature[] | null> = [null, [], ["mode:interview"], ["live-checklist"]];

function* unaffected(): Generator<AccessState> {
  for (const tier of TIERS)
    for (const status of STATUSES)
      for (const features of FEATURES)
        for (const activated of [true, false]) {
          yield access({ mode: "own", tier, status, features, activated, builtInAvailable: true });
          yield access({ mode: "own", tier, status, features, activated, builtInAvailable: false });
          yield access({ mode: "avalet", tier, status, features, activated, builtInAvailable: false });
        }
}

test("invariant: own key or no billing server never renders a lock, a preview or upgrade wording", () => {
  let checked = 0;
  for (const state of unaffected()) {
    for (const language of ["ru", "en"] as const) {
      const strings = UI_STRINGS[language];
      const options = modeOptions(state, strings);
      assert.deepEqual(
        options.map((o) => o.label),
        MEETING_MODES.map((m) => strings.modes[m]),
        JSON.stringify(state),
      );
      assert.ok(options.every((o) => !o.locked));
      assert.ok(options.every((o) => !/Pro/.test(o.label)));
      assert.equal(checklistLocked(state), false);
      assert.equal(planLimitsApply(state), false);
      for (const mode of MEETING_MODES) assert.equal(isUnlocked(state, { kind: "mode", mode }), true);
      assert.equal(isUnlocked(state, { kind: "checklist" }), true);
    }
    checked++;
  }
  assert.ok(checked > 200);
  assert.equal(checklistLocked(null), false);
  assert.ok(modeOptions(null, UI_STRINGS.ru).every((o) => !o.locked));
});

test("trial: review and demo are marked in the picker, the checklist is locked; pro: nothing", () => {
  const trial = access({ mode: "avalet", tier: "trial", activated: true });
  const options = modeOptions(trial, UI_STRINGS.ru);
  assert.deepEqual(
    options.filter((o) => o.locked).map((o) => o.mode),
    ["demo", "review"],
  );
  assert.equal(options.find((o) => o.mode === "review")!.label, "Ревью документа (в Pro)");
  assert.equal(modeOptions(trial, UI_STRINGS.en).find((o) => o.mode === "demo")!.label, "Demo / acceptance (Pro)");
  assert.equal(checklistLocked(trial), true);
  assert.equal(includedModesText(trial, UI_STRINGS.ru), "Свободный, Сбор требований, Груминг и оценка, Интервью");

  const pro = access({ mode: "avalet", tier: "pro", activated: true });
  assert.ok(modeOptions(pro, UI_STRINGS.en).every((o) => !o.locked));
  assert.equal(checklistLocked(pro), false);
});
