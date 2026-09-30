import type { Decision, DecisionStatus, Meeting } from "./shared/ipc-contract.js";
import { DECISION_STATUSES } from "./shared/ipc-contract.js";
import { SECTION_UNKNOWN, findSection, parseSections, sectionLabel } from "./shared/artifact.js";
import { locateQuote, sameTask } from "./live-tracker-logic.js";
import type { RawDecision } from "./summary-format.js";

// Review mode decisions (CLOUD_TASK_5): the summary's list checked against
// what was actually said and against the document, then merged with what the
// analyst already edited by hand.

/**
 * The model's decisions, held to the transcript and the document:
 * - the quote is kept only when it is found in the transcript, and `at` and
 *   the speaker then come from the transcript, not from the model;
 * - an accepted decision without a found quote is kept but `ungrounded`, and
 *   its checkbox starts off: acceptance has to rest on words that were said;
 * - a section that is not in the document's index becomes "не определён".
 */
export function groundDecisions(
  raw: RawDecision[],
  meeting: Pick<Meeting, "transcript" | "startedAt" | "endedAt" | "artifact">,
  makeId: () => string,
): Decision[] {
  const artifact = meeting.artifact?.text ?? "";
  const sections = artifact ? parseSections(artifact).filter((s) => s.number) : [];
  const lastAt = meeting.transcript.at(-1)?.at ?? meeting.endedAt ?? meeting.startedAt;
  return raw.map((item) => {
    const found = item.quote ? locateQuote(item.quote, meeting.transcript) : null;
    const ungrounded = item.quote ? !found : item.status === "accepted";
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
      include: item.status === "accepted" && !ungrounded,
      ...(found ? { quote: found.quote, speaker: found.speaker } : {}),
      ...(at !== undefined ? { at } : {}),
      ...(ungrounded ? { ungrounded: true } : {}),
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
    if (typeof d.quote === "string" && d.quote) out.quote = str(d.quote);
    if (d.speaker === "me" || d.speaker === "other") out.speaker = d.speaker;
    if (typeof d.at === "number" && Number.isFinite(d.at)) out.at = d.at;
    return out;
  });
}
