// Which meeting modes and features a plan of the built-in "Avalet" provider
// includes. Shared by the main process (it refuses a mode that is not in the
// plan and keeps the live checklist quiet) and the renderer (it shows a lock
// and a preview instead). docs/dev/mode-tiers-plan.md explains the table.
//
// The rule above everything: an own key, or a build without a billing server,
// unlocks everything. featureGate() checks that first, before any plan logic.

import { MEETING_MODES, type AccessState, type Feature, type MeetingMode } from "./ipc-contract.js";

export type { Feature };

export const ALL_FEATURES: Feature[] = [...MEETING_MODES.map((mode) => `mode:${mode}` as Feature), "live-checklist"];

/** Always included, whatever a plan or the server says: the fallback mode. */
export const ALWAYS_INCLUDED: Feature[] = ["mode:free"];

/**
 * Default content of each plan, used when the entitlement token carries no
 * `features` list. A plan that is not listed (no usable plan) shows the Trial
 * row. The top plan always has everything, so an upgrade always means Pro.
 */
export const PLAN_FEATURES: Record<"trial" | "pro", Feature[]> = {
  trial: ["mode:free", "mode:interview", "mode:requirements", "mode:grooming"],
  pro: ALL_FEATURES,
};

/** The plan an upgrade prompt offers. */
export const UPGRADE_PLAN = "pro" as const;

export function isFeature(value: unknown): value is Feature {
  return typeof value === "string" && (ALL_FEATURES as string[]).includes(value);
}

export type FeatureGate = {
  /** False: nothing is locked and no lock, preview or upgrade text may be shown. */
  gated: boolean;
  unlocked: (feature: Feature) => boolean;
  modeLocked: (mode: MeetingMode) => boolean;
  checklistLocked: boolean;
};

const OPEN: FeatureGate = { gated: false, unlocked: () => true, modeLocked: () => false, checklistLocked: false };

type GateInput = Pick<AccessState, "mode" | "builtInAvailable" | "tier" | "features">;

/**
 * What is locked right now. `null` (access not known yet) counts as open: the
 * main process still refuses what the plan lacks, the renderer just never
 * flashes a lock before it knows.
 */
export function featureGate(access: GateInput | null | undefined): FeatureGate {
  // Own key or no billing server: everything, always. Keep this first.
  if (!access || access.mode !== "avalet" || !access.builtInAvailable) return OPEN;
  const listed = access.features ?? PLAN_FEATURES[access.tier === "pro" ? "pro" : "trial"];
  const included = new Set<Feature>([...listed.filter(isFeature), ...ALWAYS_INCLUDED]);
  const unlocked = (feature: Feature) => included.has(feature);
  return {
    gated: true,
    unlocked,
    modeLocked: (mode) => !unlocked(`mode:${mode}`),
    checklistLocked: !unlocked("live-checklist"),
  };
}
