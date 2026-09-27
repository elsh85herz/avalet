import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_FEATURES, PLAN_FEATURES, featureGate } from "./tiers.js";
import { MEETING_MODES, type AccessState, type AccessStatus, type AccessTier, type Feature } from "./ipc-contract.js";
import { deriveAccess, type AccessInput } from "../billing/access.js";
import type { EntitlementPayload } from "../billing/token.js";

const TIERS: AccessTier[] = ["own", "trial", "pro", "none"];
const STATUSES: AccessStatus[] = ["ok", "no-key", "not-activated", "exhausted", "expired", "offline-grace", "offline-expired", "invalid"];
const FEATURE_LISTS: Array<Feature[] | null> = [null, [], ["mode:interview"], ["live-checklist"], ALL_FEATURES];

type GateFields = Pick<AccessState, "mode" | "builtInAvailable" | "tier" | "features">;

function everyCombination(mode: "own" | "avalet", builtInAvailable: boolean): Array<GateFields & { status: AccessStatus }> {
  return TIERS.flatMap((tier) =>
    STATUSES.flatMap((status) => FEATURE_LISTS.map((features) => ({ mode, builtInAvailable, tier, status, features }))),
  );
}

function assertOpen(fields: GateFields, label: string) {
  const gate = featureGate(fields);
  assert.equal(gate.gated, false, `${label}: gated`);
  assert.equal(gate.checklistLocked, false, `${label}: checklist locked`);
  for (const mode of MEETING_MODES) assert.equal(gate.modeLocked(mode), false, `${label}: ${mode} locked`);
  for (const feature of ALL_FEATURES) assert.equal(gate.unlocked(feature), true, `${label}: ${feature}`);
}

// CLOUD_TASK_3 section 1: the one regression that matters most.
test("invariant: an own key unlocks every mode and the checklist, whatever the tier, status or server features say", () => {
  for (const fields of [...everyCombination("own", true), ...everyCombination("own", false)]) {
    assertOpen(fields, JSON.stringify(fields));
  }
});

test("invariant: a build without a billing server unlocks everything, even with Avalet selected", () => {
  for (const fields of everyCombination("avalet", false)) assertOpen(fields, JSON.stringify(fields));
  assertOpen({ mode: "avalet", builtInAvailable: false, tier: "trial", features: [] }, "trial, empty features");
});

test("invariant: before access is known nothing is shown as locked", () => {
  assertOpen(null as unknown as GateFields, "null");
  assert.equal(featureGate(undefined).gated, false);
});

test("invariant through the real state machine: own-key access is never gated for any token", () => {
  const now = Date.UTC(2026, 8, 1);
  const tokens: Array<EntitlementPayload | null> = [
    null,
    ...(["trial", "pro", "none"] as const).flatMap((plan) =>
      [undefined, [], ["mode:free"]].map((features) => ({
        v: 1 as const,
        iid: "i",
        plan,
        budget: 100,
        used: 100,
        periodStart: now - 1,
        periodEnd: now - 1,
        renews: false,
        iat: now - 1,
        exp: now + 1,
        ...(features ? { features } : {}),
      })),
    ),
  ];
  for (const token of tokens) {
    for (const builtInAvailable of [true, false]) {
      for (const selectedProviderId of ["anthropic", "openai", "custom"]) {
        const input: AccessInput = {
          now,
          selectedProviderId,
          ownKeyReady: true,
          token,
          tokenRejected: false,
          lastSyncAt: null,
          syncFailing: false,
          exhaustedSignal: true,
          localUsedSinceIssue: 0,
          builtInAvailable,
        };
        assertOpen(deriveAccess(input), `${selectedProviderId} ${builtInAvailable} ${JSON.stringify(token)}`);
      }
    }
  }
});

function avalet(tier: AccessTier, features: Feature[] | null = null): GateFields {
  return { mode: "avalet", builtInAvailable: true, tier, features };
}

const unlockedModes = (fields: GateFields) => MEETING_MODES.filter((mode) => !featureGate(fields).modeLocked(mode));

test("trial: free, interview, requirements, grooming; review, demo and the checklist are locked", () => {
  assert.deepEqual(unlockedModes(avalet("trial")), ["free", "requirements", "grooming", "interview"]);
  assert.equal(featureGate(avalet("trial")).checklistLocked, true);
  assert.equal(featureGate(avalet("trial")).gated, true);
  // The table is the source: every mode it lists is unlocked, nothing else.
  for (const mode of MEETING_MODES) {
    assert.equal(featureGate(avalet("trial")).modeLocked(mode), !PLAN_FEATURES.trial.includes(`mode:${mode}`), mode);
  }
});

test("pro: every mode and the checklist", () => {
  assert.deepEqual(unlockedModes(avalet("pro")), MEETING_MODES);
  assert.equal(featureGate(avalet("pro")).checklistLocked, false);
});

test("no usable plan (none, not activated) shows the trial's locks", () => {
  assert.deepEqual(unlockedModes(avalet("none")), unlockedModes(avalet("trial")));
  assert.equal(featureGate(avalet("none")).checklistLocked, true);
});

test("server features replace the table; free is always included; unknown values are ignored", () => {
  // The owner's original split: Base = interview only.
  assert.deepEqual(unlockedModes(avalet("trial", ["mode:interview"])), ["free", "interview"]);
  assert.deepEqual(unlockedModes(avalet("pro", [])), ["free"]);
  assert.equal(featureGate(avalet("trial", ["live-checklist"])).checklistLocked, false);
  assert.deepEqual(unlockedModes(avalet("trial", ["mode:nope" as Feature, "mode:demo"])), ["free", "demo"]);
});
