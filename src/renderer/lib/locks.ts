import { MEETING_MODES, type AccessState, type MeetingMode } from "../../../electron/shared/ipc-contract.js";
import { featureGate } from "../../../electron/shared/tiers.js";
import type { UiStrings } from "./i18n.js";

// What the renderer shows for plan limits of the built-in provider. Every
// component that draws a lock, a preview or upgrade text goes through here,
// so the own-key rule (electron/shared/tiers.ts) holds for the UI as well:
// with an own key or without a billing server all of this is inert.

export type LockedFeature = { kind: "mode"; mode: MeetingMode } | { kind: "checklist" };

export type ModeOption = { mode: MeetingMode; label: string; locked: boolean };

/** The mode picker's options: a locked mode keeps its place and says where it is included. */
export function modeOptions(access: AccessState | null, strings: UiStrings): ModeOption[] {
  const gate = featureGate(access);
  return MEETING_MODES.map((mode) => {
    const locked = gate.modeLocked(mode);
    const name = strings.modes[mode];
    return { mode, locked, label: locked ? strings.locks.modeBadge.replace("{mode}", name) : name };
  });
}

/** The modes the current plan includes, as a readable list for the preview. */
export function includedModesText(access: AccessState | null, strings: UiStrings): string {
  const gate = featureGate(access);
  return MEETING_MODES.filter((mode) => !gate.modeLocked(mode))
    .map((mode) => strings.modes[mode])
    .join(", ");
}

/** Plan limits apply at all (the built-in provider with a billing server): only then may plan UI appear. */
export function planLimitsApply(access: AccessState | null): boolean {
  return featureGate(access).gated;
}

/** The live checklist is shown as locked (a row with a preview) instead of its switch. */
export function checklistLocked(access: AccessState | null): boolean {
  return featureGate(access).checklistLocked;
}

/** Whether a feature is available right now (a preview that stays open sees it unlock after payment). */
export function isUnlocked(access: AccessState | null, feature: LockedFeature): boolean {
  const gate = featureGate(access);
  return feature.kind === "mode" ? !gate.modeLocked(feature.mode) : !gate.checklistLocked;
}
