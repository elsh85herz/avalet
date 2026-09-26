import type { ActionItem, ActionState, AgendaStatusItem, MeetingAnalysis } from "./summary-format.js";

// Live checklist: every so often a small model call reads the freshest part of
// the transcript and updates the agenda marks and the list of action points.
// Everything here is pure (no Electron, no network) so it can be tested.

/** Below this much new speech a call is not worth the tokens. */
export const TRACKER_MIN_NEW_CHARS = 80;
/** Never more often than this, even when the other side keeps pausing. */
export const TRACKER_MIN_GAP_MS = 30_000;
/** With speech going on and no pause, still refresh after this long. */
export const TRACKER_MAX_GAP_MS = 90_000;
/** Newest part of the transcript sent to the model. */
export const TRACKER_EXCERPT_CHARS = 4_500;

export function shouldRunTracker(input: {
  now: number;
  lastRunAt: number;
  newChars: number;
  endsWithPause: boolean;
}): boolean {
  if (input.newChars < TRACKER_MIN_NEW_CHARS) return false;
  const since = input.now - input.lastRunAt;
  if (since < TRACKER_MIN_GAP_MS) return false;
  return input.endsWithPause || since >= TRACKER_MAX_GAP_MS;
}

/** One status per agenda question, in agenda order; what is already known about a question is kept. */
export function reconcileAgenda(agenda: string[], previous: AgendaStatusItem[] | undefined): AgendaStatusItem[] {
  const byQuestion = new Map((previous ?? []).map((item) => [item.question, item]));
  return agenda.map((question) => byQuestion.get(question) ?? { question, closed: false, note: "" });
}

export function actionState(action: ActionItem): ActionState {
  return action.state ?? "confirmed";
}

function taskTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .map((w) => w.slice(0, 5));
  return new Set(words);
}

/** Same task worded differently by two calls: enough shared word stems. */
export function sameTask(a: string, b: string): boolean {
  const ta = taskTokens(a);
  const tb = taskTokens(b);
  if (ta.size === 0 || tb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  const union = ta.size + tb.size - shared;
  if (shared / union >= 0.5) return true;
  return Math.min(ta.size, tb.size) >= 2 && shared / Math.min(ta.size, tb.size) >= 0.75;
}

export function buildTrackerSystemPrompt(): string {
  return [
    "You keep a live checklist for a systems analyst during a call. You get the agenda questions with their current state, the action points already found, and the newest part of the transcript ('[Я]' is the analyst, '[Собеседник]' is everyone else).",
    "Reply with ONE JSON object and nothing else:",
    '{"agenda":[{"index":1,"state":"closed","note":"..."}],"actions":[{"task":"...","owner":"...","due":"..."}]}',
    "'agenda': list only the questions whose state changed or that are being discussed right now. state is 'closed' only if the transcript contains a clear answer or decision for the question; 'active' if it is being discussed now without an answer yet. Never move a question back. note is the answer in at most 12 words when closed, or what is still missing when active. All text in Russian.",
    "'actions': only NEW concrete tasks that somebody was assigned or agreed to in this excerpt and that are not in the list already found (a rewording of a known task is not new). task is a short imperative phrase; owner is the person or role named in the call (the analyst is 'Я'), or 'не назван'; due is the deadline as said, or 'срок не назван'. A task somebody only proposed and nobody accepted is not a task. Do not invent anything the transcript does not say.",
    "If nothing changed, reply {\"agenda\":[],\"actions\":[]}.",
  ].join("\n");
}

export function buildTrackerUserPrompt(statuses: AgendaStatusItem[], actions: ActionItem[], excerpt: string): string {
  const agenda =
    statuses.length > 0
      ? statuses
          .map((s, i) => `${i + 1}. ${s.question} [${s.closed ? "closed" : s.active ? "active" : "open"}${s.note ? `: ${s.note}` : ""}]`)
          .join("\n")
      : "(no agenda)";
  const known = actions.filter((a) => actionState(a) !== "dismissed");
  const found = known.length > 0 ? known.map((a) => `- ${a.task}`).join("\n") : "(none yet)";
  return `Agenda:\n${agenda}\n\nAction points already found:\n${found}\n\nTranscript excerpt:\n${excerpt}`;
}

export type TrackerReply = {
  agenda: { index: number; state: "open" | "active" | "closed"; note: string }[];
  actions: { task: string; owner: string; due: string }[];
};

export function parseTrackerReply(raw: string): TrackerReply | null {
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as { agenda?: unknown; actions?: unknown };
    const agenda = Array.isArray(data.agenda)
      ? (data.agenda as { index?: unknown; state?: unknown; note?: unknown }[])
          .filter((item) => Number.isInteger(Number(item?.index)) && (item.state === "closed" || item.state === "active" || item.state === "open"))
          .map((item) => ({
            index: Number(item.index),
            state: item.state as "open" | "active" | "closed",
            note: typeof item.note === "string" ? item.note.trim() : "",
          }))
      : [];
    const actions = Array.isArray(data.actions)
      ? (data.actions as { task?: unknown; owner?: unknown; due?: unknown }[])
          .filter((item) => typeof item?.task === "string" && item.task.trim())
          .map((item) => ({
            task: String(item.task).trim(),
            owner: typeof item.owner === "string" ? item.owner.trim() : "",
            due: typeof item.due === "string" ? item.due.trim() : "",
          }))
      : [];
    return { agenda, actions };
  } catch {
    return null;
  }
}

/**
 * Folds one reply into the current state. Marks only move forward
 * (open, active, closed): the reply sees a short excerpt, so it cannot judge
 * a step back. A question the analyst marked by hand is never touched.
 */
export function applyTrackerReply(
  statuses: AgendaStatusItem[],
  actions: ActionItem[],
  reply: TrackerReply,
  makeId: () => string,
): { agendaStatus: AgendaStatusItem[]; actions: ActionItem[] } {
  const agendaStatus = statuses.map((item) => ({ ...item }));
  for (const change of reply.agenda) {
    const item = agendaStatus[change.index - 1];
    if (!item || item.manual || item.closed) continue;
    if (change.state === "closed") {
      item.closed = true;
      item.active = false;
      if (change.note) item.note = change.note;
    } else if (change.state === "active") {
      item.active = true;
      if (change.note) item.note = change.note;
    }
  }
  const next = actions.map((a) => ({ ...a }));
  for (const found of reply.actions) {
    if (next.some((a) => sameTask(a.task, found.task))) continue;
    next.push({ id: makeId(), task: found.task, owner: found.owner, due: found.due, state: "proposed" });
  }
  return { agendaStatus, actions: next };
}

/**
 * Combines what the live checklist collected with the final summary, which
 * reads the whole transcript. Marks set by hand win over the summary. Action
 * points: the analyst's confirmed ones stay, dismissed ones stay dismissed
 * (and are not re-added), tasks the summary found and the live pass missed
 * come in as proposed, and proposed ones the summary does not back are dropped.
 */
export function mergeSummaryAnalysis(
  existing: { agendaStatus?: AgendaStatusItem[]; actions?: ActionItem[] },
  fresh: MeetingAnalysis,
  makeId: () => string,
): MeetingAnalysis {
  const manual = new Map((existing.agendaStatus ?? []).filter((s) => s.manual).map((s) => [s.question, s]));
  const agendaStatus = fresh.agendaStatus.map((item) => manual.get(item.question) ?? { ...item, active: false });

  const old = existing.actions ?? [];
  const confirmed = old.filter((a) => actionState(a) === "confirmed");
  const dismissed = old.filter((a) => actionState(a) === "dismissed");
  const proposed = old.filter((a) => actionState(a) === "proposed");
  const out: ActionItem[] = confirmed.map((a) => ({ ...a, id: a.id ?? makeId(), state: "confirmed" as const }));
  for (const found of fresh.actions) {
    if (dismissed.some((a) => sameTask(a.task, found.task))) continue;
    if (out.some((a) => sameTask(a.task, found.task))) continue;
    const backed = proposed.find((a) => sameTask(a.task, found.task));
    out.push(backed ? { ...backed } : { ...found, id: makeId(), state: "proposed" });
  }
  out.push(...dismissed);
  return { agendaStatus, actions: out };
}
