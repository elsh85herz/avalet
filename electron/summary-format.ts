import type { Meeting } from "./meetings-store.js";
import type { ActionItem, ActionState, AgendaStatusItem } from "./shared/ipc-contract.js";

// The summary call returns the protocol text first and, after this marker, a
// small JSON block with the machine-readable part: which agenda questions got
// an answer and the action points. One call instead of two, so a long
// transcript is only sent once.
export const ANALYSIS_MARKER = "@@AVALET_JSON@@";

export type { ActionItem, ActionState, AgendaStatusItem };
export type MeetingAnalysis = { agendaStatus: AgendaStatusItem[]; actions: ActionItem[] };

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
    const data = JSON.parse(tail.slice(start, end + 1)) as { agenda?: unknown; actions?: unknown };
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
    return { protocol, analysis: { agendaStatus, actions } };
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
};

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
  lines.push(`${labels.participants}: `, "");

  const status = meeting.agendaStatus ?? [];
  if (status.length > 0) {
    lines.push(`## ${labels.agenda}`, "");
    for (const item of status) {
      lines.push(`- [${item.closed ? "x" : " "}] ${item.question}${item.note ? ` (${item.note})` : ""}`);
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
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
