import type { ActionItem, ActionState, AgendaStatusItem, MeetingAnalysis } from "./summary-format.js";
import type { MeetingMode, QuoteRef, TranscriptSegment } from "./shared/ipc-contract.js";

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
/** Longest quote kept; the model is asked for at most 30 words. */
export const QUOTE_MAX_CHARS = 280;
/** Share of a quote's word stems a transcript passage must contain to count as its source. */
export const QUOTE_MIN_MATCH = 0.6;

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

function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .map((w) => w.slice(0, 5));
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

/**
 * Which sentence counts as the evidence for an item, per meeting mode. The
 * data shape is the same everywhere; only what is worth quoting differs.
 */
const QUOTE_HINTS: Record<MeetingMode, string> = {
  free: "The quote is the sentence that gives the answer.",
  requirements: "The quote is the stakeholder's own sentence with the value, rule or condition (thresholds, who confirms, what happens on failure), not the analyst's question.",
  grooming: "The quote is the sentence with what the team agreed on (scope, done criteria, a split) or the assumption an estimate depends on.",
  demo: "The quote is what was said when the thing was shown, or when it turned out to be missing or different from what was agreed.",
  review: "The quote is the remark or question about the document as it was said, or the sentence with the decision on it.",
  // Interview meetings have no live checklist (live-tracker.ts); kept for completeness.
  interview: "The quote is the sentence that gives the answer.",
};

export function buildTrackerSystemPrompt(mode: MeetingMode = "free"): string {
  return [
    "You keep a live checklist for a systems analyst during a call. You get the agenda questions with their current state, the action points already found, and the newest part of the transcript ('[Я]' is the analyst, '[Собеседник]' is everyone else).",
    "Reply with ONE JSON object and nothing else:",
    '{"agenda":[{"index":1,"state":"closed","note":"...","quote":"..."}],"actions":[{"task":"...","owner":"...","due":"...","quote":"..."}]}',
    "'agenda': list only the questions whose state changed or that are being discussed right now. state is 'closed' only if the transcript contains a clear answer or decision for the question; 'active' if it is being discussed now without an answer yet. Never move a question back. note is your short verdict: the answer in at most 12 words when closed, or what is still missing when active. All text in Russian.",
    "'actions': only NEW concrete tasks that somebody was assigned or agreed to in this excerpt and that are not in the list already found (a rewording of a known task is not new). task is a short imperative phrase; owner is the person or role named in the call (the analyst is 'Я'), or 'не назван'; due is the deadline as said, or 'срок не назван'. A task somebody only proposed and nobody accepted is not a task. Do not invent anything the transcript does not say.",
    `'quote' (in both lists): the exact words from the transcript excerpt that back the item, copied character for character without the speaker tag: do not paraphrase, shorten inside, translate or fix the wording. At most 30 words. ${QUOTE_HINTS[mode]} For an action it is the sentence where the task was given or accepted. Use an empty string when no sentence in the excerpt says it.`,
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
  agenda: { index: number; state: "open" | "active" | "closed"; note: string; quote?: string }[];
  actions: { task: string; owner: string; due: string; quote?: string }[];
};

/** A quote as the model wrote it: trimmed, without wrapping quote marks; "" when absent or not text. */
function quoteOf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^["'«»“”„]+|["'«»“”„]+$/g, "")
    .trim()
    .slice(0, QUOTE_MAX_CHARS);
}

export function parseTrackerReply(raw: string): TrackerReply | null {
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as { agenda?: unknown; actions?: unknown };
    const agenda = Array.isArray(data.agenda)
      ? (data.agenda as { index?: unknown; state?: unknown; note?: unknown; quote?: unknown }[])
          .filter((item) => Number.isInteger(Number(item?.index)) && (item.state === "closed" || item.state === "active" || item.state === "open"))
          .map((item) => {
            const quote = quoteOf(item.quote);
            return {
              index: Number(item.index),
              state: item.state as "open" | "active" | "closed",
              note: typeof item.note === "string" ? item.note.trim() : "",
              ...(quote ? { quote } : {}),
            };
          })
      : [];
    const actions = Array.isArray(data.actions)
      ? (data.actions as { task?: unknown; owner?: unknown; due?: unknown; quote?: unknown }[])
          .filter((item) => typeof item?.task === "string" && item.task.trim())
          .map((item) => {
            const quote = quoteOf(item.quote);
            return {
              task: String(item.task).trim(),
              owner: typeof item.owner === "string" ? item.owner.trim() : "",
              due: typeof item.due === "string" ? item.due.trim() : "",
              ...(quote ? { quote } : {}),
            };
          })
      : [];
    return { agenda, actions };
  } catch {
    return null;
  }
}

/**
 * Finds where a quote was said: the run of 1 to 3 consecutive segments that
 * holds the largest share of the quote's word stems (segments are cut at
 * pauses or every few seconds, so one sentence can span two or three). Below
 * QUOTE_MIN_MATCH the quote is not backed by the transcript and null comes
 * back: the caller drops it rather than show words nobody said. `at` is the
 * run's first segment, `speaker` the segment that shares the most stems.
 */
export function locateQuote(quote: string, segments: TranscriptSegment[]): Required<QuoteRef> | null {
  const wanted = [...new Set(stems(quote))];
  if (wanted.length === 0 || segments.length === 0) return null;
  const segmentStems = segments.map((seg) => new Set(stems(seg.text)));
  let best: { score: number; start: number; size: number } | null = null;
  // Shorter runs first, and only a strictly better score replaces the best:
  // at an equal score the shortest, then the earliest run wins, so a
  // neighbouring segment that merely repeats a word does not move `at`.
  for (let size = 1; size <= 3; size++) {
    for (let start = 0; start + size <= segments.length; start++) {
      const run = segmentStems.slice(start, start + size);
      const shared = wanted.filter((stem) => run.some((set) => set.has(stem))).length;
      const score = shared / wanted.length;
      if (!best || score > best.score + 1e-9) best = { score, start, size };
    }
  }
  if (!best || best.score < QUOTE_MIN_MATCH) return null;
  let speakerIndex = best.start;
  let most = -1;
  for (let i = best.start; i < best.start + best.size; i++) {
    const shared = wanted.filter((stem) => segmentStems[i]!.has(stem)).length;
    if (shared > most) {
      most = shared;
      speakerIndex = i;
    }
  }
  return { quote, at: segments[best.start]!.at, speaker: segments[speakerIndex]!.speaker };
}

/** Grounded quote fields for an item, or nothing (no quote, or not found in the transcript). */
function groundedQuote(quote: string | undefined, locate: ((quote: string) => QuoteRef | null) | undefined): QuoteRef {
  if (!quote || !locate) return {};
  const found = locate(quote);
  return found?.quote ? { quote: found.quote, speaker: found.speaker, at: found.at } : {};
}

/**
 * Folds one reply into the current state. Marks only move forward
 * (open, active, closed): the reply sees a short excerpt, so it cannot judge
 * a step back. A question the analyst marked by hand is never touched.
 * A quote comes along only when `locate` finds it in the transcript; a change
 * without one keeps whatever quote the item already had.
 */
export function applyTrackerReply(
  statuses: AgendaStatusItem[],
  actions: ActionItem[],
  reply: TrackerReply,
  makeId: () => string,
  locate?: (quote: string) => QuoteRef | null,
): { agendaStatus: AgendaStatusItem[]; actions: ActionItem[] } {
  const agendaStatus = statuses.map((item) => ({ ...item }));
  for (const change of reply.agenda) {
    const item = agendaStatus[change.index - 1];
    if (!item || item.manual || item.closed) continue;
    if (change.state === "closed") {
      item.closed = true;
      item.active = false;
      if (change.note) item.note = change.note;
      Object.assign(item, groundedQuote(change.quote, locate));
    } else if (change.state === "active") {
      item.active = true;
      if (change.note) item.note = change.note;
      Object.assign(item, groundedQuote(change.quote, locate));
    }
  }
  const next = actions.map((a) => ({ ...a }));
  for (const found of reply.actions) {
    if (next.some((a) => sameTask(a.task, found.task))) continue;
    next.push({ id: makeId(), task: found.task, owner: found.owner, due: found.due, state: "proposed", ...groundedQuote(found.quote, locate) });
  }
  return { agendaStatus, actions: next };
}

/**
 * Combines what the live checklist collected with the final summary, which
 * reads the whole transcript. Marks set by hand win over the summary. Action
 * points: the analyst's confirmed ones stay, dismissed ones stay dismissed
 * (and are not re-added), tasks the summary found and the live pass missed
 * come in as proposed, and proposed ones the summary does not back are dropped.
 * Quotes come only from the live pass (the summary has none), so an item or
 * action keeps the quote it had.
 */
export function mergeSummaryAnalysis(
  existing: { agendaStatus?: AgendaStatusItem[]; actions?: ActionItem[] },
  fresh: MeetingAnalysis,
  makeId: () => string,
): MeetingAnalysis {
  const manual = new Map((existing.agendaStatus ?? []).filter((s) => s.manual).map((s) => [s.question, s]));
  const quoted = new Map((existing.agendaStatus ?? []).filter((s) => s.quote).map((s) => [s.question, s]));
  const agendaStatus = fresh.agendaStatus.map((item) => {
    const hand = manual.get(item.question);
    if (hand) return hand;
    const live = quoted.get(item.question);
    return live && !item.quote ? { ...item, active: false, quote: live.quote, speaker: live.speaker, at: live.at } : { ...item, active: false };
  });

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
