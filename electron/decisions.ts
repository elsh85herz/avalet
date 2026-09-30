import type { Decision, DecisionLabels, DecisionStatus, Meeting } from "./shared/ipc-contract.js";
import { DECISION_STATUSES } from "./shared/ipc-contract.js";
import { SECTION_UNKNOWN, findSection, parseSections, sectionLabel } from "./shared/artifact.js";
import { locateQuote, sameTask } from "./live-tracker-logic.js";
import { meetingClock, parseAsked, type RawDecision } from "./summary-format.js";
import { termsProblem } from "./shared/decision-terms.js";
import { visibleSegments } from "./transcript-clean.js";

// Review mode decisions (CLOUD_TASK_5): the summary's list checked against
// what was actually said and against the document, then merged with what the
// analyst already edited by hand.

/**
 * The model's decisions, held to the transcript and the document:
 * - the quote is kept only when it is found in the transcript, and `at` and
 *   the speaker then come from the transcript, not from the model;
 * - an accepted decision without a found quote is kept but `ungrounded`, and
 *   its checkbox starts off: acceptance has to rest on words that were said;
 * - a section that is not in the document's index becomes "не определён";
 * - an accepted decision about a structure whose terms are not pinned (or
 *   "не уточнено") starts unchecked too: applying it would mean choosing a
 *   reading nobody gave (CLOUD_TASK_6).
 */
export function groundDecisions(
  raw: RawDecision[],
  meeting: Pick<Meeting, "transcript" | "startedAt" | "endedAt" | "artifact">,
  makeId: () => string,
): Decision[] {
  const artifact = meeting.artifact?.text ?? "";
  const sections = artifact ? parseSections(artifact).filter((s) => s.number) : [];
  const lastAt = meeting.transcript.at(-1)?.at ?? meeting.endedAt ?? meeting.startedAt;
  // Only the lines a person reads: a quote never lands on a hidden echo copy (CLOUD_TASK_6).
  const visible = visibleSegments(meeting.transcript);
  return raw.map((item) => {
    const found = item.quote ? locateQuote(item.quote, visible) : null;
    const ungrounded = item.quote ? !found : item.status === "accepted";
    // Acceptance resting on words the recognizer was unsure of is not evidence.
    const weakQuote = Boolean(found && item.status === "accepted" && visible.find((seg) => seg.at === found.at)?.lowConfidence);
    let at: number | undefined = found?.at;
    // Only a jump target when the words were not found: never beyond the call.
    if (at === undefined && item.atSeconds !== null) {
      const guess = meeting.startedAt + item.atSeconds * 1000;
      if (guess <= lastAt + 60_000) at = guess;
    }
    let section = item.section.trim();
    if (artifact) {
      const match = findSection(sections, section);
      section = match ? sectionLabel(match) : SECTION_UNKNOWN;
    } else if (!section) {
      section = SECTION_UNKNOWN;
    }
    return {
      id: makeId(),
      text: item.text,
      status: item.status,
      by: item.by,
      section,
      before: item.before,
      after: item.after,
      include: item.status === "accepted" && !ungrounded && !weakQuote && !termsProblem(item),
      ...(found ? { quote: found.quote, speaker: found.speaker } : {}),
      ...(at !== undefined ? { at } : {}),
      ...(ungrounded ? { ungrounded: true } : {}),
      ...(weakQuote ? { weakQuote: true } : {}),
      ...(item.asked ? { asked: item.asked } : {}),
      ...(item.terms ? { terms: item.terms } : {}),
    };
  });
}

/**
 * A new summary replaces the decisions it found last time, but rows the
 * analyst edited, added or deleted stay as they are, and a fresh decision
 * that repeats one of them is dropped.
 */
export function mergeDecisions(existing: Decision[] | undefined, fresh: Decision[]): Decision[] {
  const kept = (existing ?? []).filter((d) => d.manual || d.removed);
  const out = kept.filter((d) => !d.removed);
  for (const decision of fresh) {
    if (kept.some((d) => sameTask(d.text, decision.text))) continue;
    if (out.some((d) => sameTask(d.text, decision.text))) continue;
    out.push(decision);
  }
  return [...out, ...kept.filter((d) => d.removed)];
}

const MAX_DECISIONS = 300;
const MAX_FIELD = 4_000;

/** Decisions sent by the renderer after an edit: untrusted, so every field is checked and cut. */
export function sanitizeDecisions(value: unknown): Decision[] {
  if (!Array.isArray(value)) throw new Error("decisions must be an array");
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_FIELD) : "");
  return value.slice(0, MAX_DECISIONS).map((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    if (typeof d.id !== "string" || !/^[\w-]{1,64}$/.test(d.id)) throw new Error("invalid decision id");
    const status: DecisionStatus = DECISION_STATUSES.includes(d.status as DecisionStatus) ? (d.status as DecisionStatus) : "proposed";
    const out: Decision = {
      id: d.id,
      text: str(d.text),
      status,
      by: str(d.by),
      section: str(d.section) || SECTION_UNKNOWN,
      before: str(d.before),
      after: str(d.after),
      include: d.include === true,
    };
    if (d.manual === true) out.manual = true;
    if (d.removed === true) out.removed = true;
    if (d.ungrounded === true) out.ungrounded = true;
    if (d.weakQuote === true) out.weakQuote = true;
    if (typeof d.quote === "string" && d.quote) out.quote = str(d.quote);
    if (d.speaker === "me" || d.speaker === "other") out.speaker = d.speaker;
    if (typeof d.at === "number" && Number.isFinite(d.at)) out.at = d.at;
    if (typeof d.terms === "string" && d.terms.trim()) out.terms = str(d.terms);
    const asked = parseAsked(d.asked);
    if (asked) out.asked = asked;
    return out;
  });
}

/**
 * The decisions file (README "Review mode"): stable headings, one block per
 * checked decision, then the protocol's action points. Meant to be handed,
 * with the original document, to someone (or something) else to apply.
 */
export function buildDecisionsMarkdown(meeting: Meeting, labels: DecisionLabels): string {
  const none = labels.none;
  const value = (text: string) => (text.trim() ? text.replace(/\r?\n/g, " ").trim() : none);
  const lines = [`# ${labels.title}: ${meeting.title}`, ""];
  lines.push(`${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`);
  lines.push(`${labels.document}: ${meeting.artifact?.name || none}`, "");
  const chosen = (meeting.decisions ?? []).filter((d) => d.include && !d.removed && d.text.trim());
  chosen.forEach((d, i) => {
    const who = d.speaker === "me" ? labels.me : d.speaker === "other" ? labels.other : "";
    const when = typeof d.at === "number" ? meetingClock(d.at, meeting.startedAt) : "";
    const source = [who, when].filter(Boolean).join(", ");
    lines.push(`## ${i + 1}. ${value(d.text)}`, "");
    lines.push(`- ${labels.section}: ${value(d.section)}`);
    lines.push(`- ${labels.status}: ${labels.statuses[d.status] ?? d.status}`);
    lines.push(`- ${labels.before}: ${value(d.before)}`);
    lines.push(`- ${labels.after}: ${value(d.after)}`);
    lines.push(`- ${labels.terms}: ${value(d.terms ?? "")}`);
    lines.push(`- ${labels.by}: ${value(d.by)}`);
    lines.push(`- ${labels.quote}: ${d.quote ? `«${value(d.quote)}»${source ? ` (${source})` : ""}` : source ? `(${source})` : none}`, "");
  });
  if (chosen.length === 0) lines.push(none, "");
  lines.push(`## ${labels.actions}`, "");
  const actions = (meeting.actions ?? []).filter((a) => a.state !== "dismissed");
  if (actions.length === 0) lines.push(`- ${none}`);
  for (const a of actions) lines.push(`- ${value(a.task)} (${[a.owner, a.due].map((x) => x?.trim()).filter(Boolean).join(", ") || none})`);
  lines.push("");
  return lines.join("\n");
}
