import type { Meeting } from "./meetings-store.js";
import type { ActionItem, ActionState, AgendaStatusItem, DecisionStatus, Participant, QuoteRef } from "./shared/ipc-contract.js";
import { formatParticipants, parseParticipants } from "./shared/participants.js";

// The summary call returns the protocol text first and, after this marker, a
// small JSON block with the machine-readable part: which agenda questions got
// an answer and the action points. One call instead of two, so a long
// transcript is only sent once.
export const ANALYSIS_MARKER = "@@AVALET_JSON@@";

export type { ActionItem, ActionState, AgendaStatusItem };
export type MeetingAnalysis = { agendaStatus: AgendaStatusItem[]; actions: ActionItem[]; decisions?: RawDecision[]; participants?: Participant[] };

/**
 * A decision as the review summary returns it (CLOUD_TASK_5), before it is
 * checked against the transcript and the document (electron/decisions.ts).
 */
export type RawDecision = {
  text: string;
  status: DecisionStatus;
  by: string;
  section: string;
  before: string;
  after: string;
  quote: string;
  /** Seconds from the meeting start, from "mm:ss" / "hh:mm:ss"; null when absent or unreadable. */
  atSeconds: number | null;
  /** An open question asked more than once: how many times (CLOUD_TASK_6). */
  asked?: number;
  /** Pinned subject terms of a structure decision, or "не уточнено: ..."; "" when none (CLOUD_TASK_6). */
  terms: string;
};

/** A repeat count of 2 or more, else undefined: once is the default and says nothing. */
export function parseAsked(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isInteger(n) && n >= 2 && n <= 99 ? n : undefined;
}

const STATUSES: DecisionStatus[] = ["accepted", "proposed", "rejected", "open"];

/** "12:04" or "01:12:04" as seconds; null for anything else. */
export function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Tolerant: a missing or broken list gives [], an entry without text is dropped, an unknown status is "proposed". */
export function parseDecisions(value: unknown): RawDecision[] {
  if (!Array.isArray(value)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && str((item as Record<string, unknown>).text) !== "")
    .map((item) => ({
      text: str(item.text).replace(/\s*\r?\n\s*/g, " "),
      // Never "accepted" by accident: only the exact value counts.
      status: STATUSES.includes(item.status as DecisionStatus) ? (item.status as DecisionStatus) : "proposed",
      by: str(item.by),
      section: str(item.section),
      before: str(item.before),
      after: str(item.after),
      quote: str(item.quote),
      terms: str(item.terms).replace(/\s*\r?\n\s*/g, " "),
      atSeconds: parseClock(item.at),
      ...(parseAsked(item.asked) ? { asked: parseAsked(item.asked) } : {}),
    }));
}

/** One agenda question per line; list bullets and numbering are stripped. */
export function parseAgendaText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Splits the raw model output into the protocol text and the parsed JSON tail. */
export function splitSummary(raw: string, agenda: string[]): { protocol: string; analysis: MeetingAnalysis | null } {
  const at = raw.indexOf(ANALYSIS_MARKER);
  if (at < 0) return { protocol: raw.trim(), analysis: null };
  const protocol = raw.slice(0, at).trim();
  const tail = raw
    .slice(at + ANALYSIS_MARKER.length)
    .replace(/```(?:json)?/gi, "")
    .trim();
  try {
    const start = tail.indexOf("{");
    const end = tail.lastIndexOf("}");
    const data = JSON.parse(tail.slice(start, end + 1)) as { agenda?: unknown; actions?: unknown; decisions?: unknown; participants?: unknown };
    const agendaStatus: AgendaStatusItem[] = agenda.map((question, i) => {
      const found = Array.isArray(data.agenda)
        ? (data.agenda as { index?: unknown; closed?: unknown; note?: unknown }[]).find((item) => Number(item?.index) === i + 1)
        : undefined;
      return { question, closed: found?.closed === true, note: typeof found?.note === "string" ? found.note.trim() : "" };
    });
    const actions: ActionItem[] = Array.isArray(data.actions)
      ? (data.actions as { task?: unknown; owner?: unknown; due?: unknown }[])
          .filter((item) => typeof item?.task === "string" && item.task.trim())
          .map((item) => ({
            task: String(item.task).trim(),
            owner: typeof item.owner === "string" ? item.owner.trim() : "",
            due: typeof item.due === "string" ? item.due.trim() : "",
          }))
      : [];
    const analysis: MeetingAnalysis = { agendaStatus, actions };
    if (data.decisions !== undefined) analysis.decisions = parseDecisions(data.decisions);
    if (data.participants !== undefined) analysis.participants = parseParticipants(data.participants);
    return { protocol, analysis };
  } catch {
    return { protocol, analysis: null };
  }
}

/**
 * Forwards streamed text to the UI but stops at the JSON marker, so the user
 * never sees the machine-readable tail. A few trailing characters are held
 * back while they could still turn out to be the start of the marker.
 */
export class VisibleTextStream {
  private raw = "";
  private emitted = 0;

  push(delta: string): string {
    this.raw += delta;
    const markerAt = this.raw.indexOf(ANALYSIS_MARKER);
    let safeEnd: number;
    if (markerAt >= 0) {
      safeEnd = markerAt;
    } else {
      safeEnd = this.raw.length;
      // Longest suffix of raw that is a prefix of the marker stays buffered.
      for (let keep = Math.min(ANALYSIS_MARKER.length - 1, this.raw.length); keep > 0; keep--) {
        if (ANALYSIS_MARKER.startsWith(this.raw.slice(this.raw.length - keep))) {
          safeEnd = this.raw.length - keep;
          break;
        }
      }
    }
    if (safeEnd <= this.emitted) return "";
    const out = this.raw.slice(this.emitted, safeEnd);
    this.emitted = safeEnd;
    return out;
  }
}

export type ProtocolLabels = {
  date: string;
  mode: string;
  participants: string;
  agenda: string;
  discussions: string;
  actions: string;
  actionTask: string;
  actionOwner: string;
  actionDue: string;
  agendaClosed: string;
  agendaOpen: string;
  /** Participants line: "from the call: ..." and "not in the call: ..." (review, CLOUD_TASK_6). */
  participantsInferred: string;
  participantsThird: string;
  /** Speaker names for quotes. */
  me: string;
  other: string;
};

/** Time from the meeting start, as in the transcript export: 00:12:04. */
export function meetingClock(at: number, startedAt: number): string {
  const s = Math.max(0, Math.floor((at - startedAt) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** «exact words» (Speaker, 00:12:04), or "" when the item has no quote. */
function quoteLine(item: QuoteRef, meeting: Meeting, labels: ProtocolLabels): string {
  if (!item.quote) return "";
  const who = item.speaker === "me" ? labels.me : item.speaker === "other" ? labels.other : "";
  const when = typeof item.at === "number" ? meetingClock(item.at, meeting.startedAt) : "";
  const source = [who, when].filter(Boolean).join(", ");
  return `«${item.quote.replace(/\r?\n/g, " ")}»${source ? ` (${source})` : ""}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * The downloadable protocol: agenda with checkmarks, the discussion summary
 * (plain-text headings turned into markdown ones), and the action table.
 * Deliberately has no transcript: that is a separate raw export.
 */
export function buildProtocolMarkdown(
  meeting: Meeting,
  labels: ProtocolLabels,
  modeLabel: string,
  knownHeadings: string[],
): string {
  const lines: string[] = [`# ${meeting.title}`, ""];
  lines.push(`${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`);
  lines.push(`${labels.mode}: ${modeLabel}`);
  const participants = formatParticipants(meeting.participants, { inferred: labels.participantsInferred, thirdParty: labels.participantsThird });
  lines.push(`${labels.participants}: ${participants}`, "");

  const status = meeting.agendaStatus ?? [];
  if (status.length > 0) {
    lines.push(`## ${labels.agenda}`, "");
    for (const item of status) {
      lines.push(`- [${item.closed ? "x" : " "}] ${item.question}${item.note ? ` (${item.note})` : ""}`);
      const quote = quoteLine(item, meeting, labels);
      if (quote) lines.push(`  > ${quote}`);
    }
    lines.push("");
  }

  if (meeting.summary) {
    lines.push(`## ${labels.discussions}`, "");
    for (const raw of meeting.summary.trim().split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (knownHeadings.includes(line.trim())) {
        lines.push("", `### ${line.trim()}`, "");
      } else if (/^(Тема|Topic):\s*/.test(line)) {
        lines.push("", `**${line.replace(/^(Тема|Topic):\s*/, "").trim()}**`, "");
      } else {
        lines.push(line);
      }
    }
    lines.push("");
  }

  const actions = (meeting.actions ?? []).filter((a) => a.state !== "dismissed");
  if (actions.length > 0) {
    lines.push(`## ${labels.actions}`, "");
    lines.push(`| ${labels.actionTask} | ${labels.actionOwner} | ${labels.actionDue} |`, "|---|---|---|");
    for (const a of actions) lines.push(`| ${escapeCell(a.task)} | ${escapeCell(a.owner || "-")} | ${escapeCell(a.due || "-")} |`);
    lines.push("");
    // What was said when each task was given or accepted, under the table.
    for (const a of actions) {
      const quote = quoteLine(a, meeting, labels);
      if (quote) lines.push(`> **${a.task}**: ${quote}`, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
