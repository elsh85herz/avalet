import type { AccessState, PermissionStatus, SpeechModelRow } from "../../../electron/shared/ipc-contract.js";
import type { UiStrings } from "./i18n.js";

// What stands between the user and a working meeting, as data: the Simple
// home shows the first problem (one sentence, one button) and a one-line
// readiness summary. Pure, so the order and the wording rules are unit-tested
// (test/problems.test.ts).

export type Problem =
  | { kind: "model-missing" | "model-partial" | "model-error"; model: SpeechModelRow["name"] }
  | { kind: "model-downloading"; model: SpeechModelRow["name"]; percent: number; waiting: boolean }
  | { kind: "mic-blocked" | "screen-blocked" }
  | { kind: "need-key" | "key-unchecked" | "key-failed" | "need-access" }
  | { kind: "start-failed"; message: string }
  | { kind: "transcription" }
  | { kind: "audio-degraded"; channel: "me" | "other" | "both" }
  | { kind: "avalet-exhausted" | "avalet-expired" | "avalet-offline" | "avalet-invalid" };

export type ProblemKind = Problem["kind"];

/**
 * Most blocking first: without the speech model nothing is transcribed;
 * without permissions nothing is heard; without access there are no
 * suggestions; then a failing recognizer, lost audio, and last a used-up
 * Avalet budget (the transcript keeps recording through that one).
 */
export const PROBLEM_ORDER: ProblemKind[] = [
  "model-missing",
  "model-partial",
  "model-error",
  "model-downloading",
  "mic-blocked",
  "screen-blocked",
  "need-key",
  "key-failed",
  "key-unchecked",
  "need-access",
  "start-failed",
  "transcription",
  "audio-degraded",
  "avalet-exhausted",
  "avalet-expired",
  "avalet-offline",
  "avalet-invalid",
];

export type ProblemInput = {
  /** Row of the selected speech model; null while it loads. */
  model: SpeechModelRow | null;
  /** Start was pressed while the model is still downloading: the meeting starts when it is ready. */
  waitingForModel: boolean;
  permissions: { mic: PermissionStatus; screen: PermissionStatus } | null;
  /** The last Start failed on the microphone (permission refused by the system). */
  micBlockedOnStart: boolean;
  access: AccessState | null;
  /** The last Start failed for another reason. */
  startError: string | null;
  transcriptionError: boolean;
  audioDegraded: { me: boolean; other: boolean };
  capturing: boolean;
};

const BLOCKED: PermissionStatus[] = ["denied", "restricted"];

/** Every current problem, most blocking first. */
export function problemsOf(input: ProblemInput): Problem[] {
  const found: Problem[] = [];
  const model = input.model;
  if (model && model.state !== "ready") {
    if (model.state === "downloading") {
      found.push({ kind: "model-downloading", model: model.name, percent: model.percent, waiting: input.waitingForModel });
    } else if (model.state === "error") {
      found.push({ kind: "model-error", model: model.name });
    } else {
      found.push({ kind: model.bytes > 0 ? "model-partial" : "model-missing", model: model.name });
    }
  }
  if (input.micBlockedOnStart || (input.permissions && BLOCKED.includes(input.permissions.mic))) found.push({ kind: "mic-blocked" });
  if (input.permissions && BLOCKED.includes(input.permissions.screen)) found.push({ kind: "screen-blocked" });

  const access = input.access;
  if (access?.mode === "own") {
    if (access.status === "no-key") found.push({ kind: "need-key" });
    else if (access.keyCheck === "failed") found.push({ kind: "key-failed" });
    else if (access.keyCheck === "unchecked") found.push({ kind: "key-unchecked" });
  } else if (access?.mode === "avalet" && access.status === "not-activated") {
    found.push({ kind: "need-access" });
  }
  if (input.startError) found.push({ kind: "start-failed", message: input.startError });
  if (input.transcriptionError) found.push({ kind: "transcription" });
  if (input.capturing && (input.audioDegraded.me || input.audioDegraded.other)) {
    const { me, other } = input.audioDegraded;
    found.push({ kind: "audio-degraded", channel: me && other ? "both" : other ? "other" : "me" });
  }
  // Budget and plan messages exist only for the built-in provider. An own key has no Avalet limit.
  if (access?.mode === "avalet") {
    if (access.status === "exhausted") found.push({ kind: "avalet-exhausted" });
    else if (access.status === "expired") found.push({ kind: "avalet-expired" });
    else if (access.status === "offline-expired") found.push({ kind: "avalet-offline" });
    else if (access.status === "invalid") found.push({ kind: "avalet-invalid" });
  }
  return found.sort((a, b) => PROBLEM_ORDER.indexOf(a.kind) - PROBLEM_ORDER.indexOf(b.kind));
}

export function topProblem(input: ProblemInput): Problem | null {
  return problemsOf(input)[0] ?? null;
}

/** One sentence and the label of its one button (null: nothing to press, it resolves by itself). */
export function problemText(problem: Problem, t: UiStrings): { text: string; action: string | null } {
  const s = t.simple;
  switch (problem.kind) {
    case "model-missing":
      return { text: t.models.missingForStart, action: t.models.download };
    case "model-partial":
      return { text: s.modelPartial, action: t.models.continue };
    case "model-error":
      return { text: s.modelError, action: t.models.retry };
    case "model-downloading":
      return {
        text: (problem.waiting ? s.modelDownloadingWait : s.modelDownloading).replace("{percent}", String(problem.percent)),
        action: problem.waiting ? s.dontWait : null,
      };
    case "mic-blocked":
      return { text: s.micBlocked, action: s.openSystemSettings };
    case "screen-blocked":
      return { text: s.screenBlocked, action: s.openSystemSettings };
    case "need-key":
      return { text: s.needKey, action: s.setUpAccess };
    case "key-failed":
      return { text: s.keyFailed, action: s.setUpAccess };
    case "key-unchecked":
      return { text: s.keyUnchecked, action: s.check };
    case "need-access":
      return { text: s.needAccess, action: s.setUpAccess };
    case "start-failed":
      return { text: problem.message, action: s.tryAgain };
    case "transcription":
      return { text: s.speechBroken, action: s.reconnect };
    case "audio-degraded":
      return {
        text: problem.channel === "both" ? t.settings.audioLostBoth : problem.channel === "other" ? t.settings.audioLostOther : t.settings.audioLostMe,
        action: s.reconnect,
      };
    case "avalet-exhausted":
      return { text: t.access.exhausted, action: s.setUpAccess };
    case "avalet-expired":
      return { text: t.access.expired, action: s.setUpAccess };
    case "avalet-offline":
      return { text: t.access.offlineExpired, action: s.setUpAccess };
    case "avalet-invalid":
      return { text: t.access.invalid, action: s.setUpAccess };
  }
}

export type Readiness = { item: "model" | "access" | "mic" | "screen"; state: "ok" | "missing" | "pending" };

/** The one-line summary: what is ready and what is missing. */
export function readinessOf(input: ProblemInput): Readiness[] {
  const model = input.model;
  const access = input.access;
  const perm = (value: PermissionStatus | undefined, blockedOnStart = false): Readiness["state"] =>
    blockedOnStart || (value && BLOCKED.includes(value)) ? "missing" : value === "granted" ? "ok" : "pending";
  const accessState: Readiness["state"] = !access
    ? "pending"
    : access.mode === "own"
      ? access.status === "no-key" || access.keyCheck === "failed"
        ? "missing"
        : access.keyCheck === "unchecked"
          ? "pending"
          : "ok"
      : access.canUseAvalet
        ? "ok"
        : "missing";
  return [
    { item: "model", state: !model ? "pending" : model.state === "ready" ? "ok" : model.state === "downloading" ? "pending" : "missing" },
    { item: "access", state: accessState },
    { item: "mic", state: perm(input.permissions?.mic, input.micBlockedOnStart) },
    { item: "screen", state: perm(input.permissions?.screen) },
  ];
}
