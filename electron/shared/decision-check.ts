import type { Decision, DecisionCheck, TranscriptSegment } from "./ipc-contract.js";
import { CHARS_PER_TOKEN, roundTokens } from "./artifact.js";

// CLOUD_TASK_6 phase 2: the optional second look at accepted decisions. It
// gets only the accepted decisions, each with its quote and the transcript
// lines right around it, and asks two things: does the quote say what the
// decision claims, and are the subject terms pinned. The answer can only
// lower a decision (accepted to proposed) or mark its terms "не уточнено";
// `applyCheck` enforces that in code, whatever the model returns.
// Shared with the renderer, which shows the cost before anything is sent.

/** Lines before and after the quoted one: an example given a sentence later is still in view. */
export const CHECK_CONTEXT_LINES = 2;
/** Expected answer per decision (verdict, a short reason, maybe terms). */
export const CHECK_REPLY_CHARS_PER_DECISION = 350;

export const CHECK_SYSTEM_PROMPT = [
  "You check decisions taken on a call against what was actually said. You never add or improve a decision.",
  'Return ONLY one JSON object: {"checks":[{"id":"c1","verdict":"ok","terms":"","reason":"..."}]}',
  "For each decision below you get its text, its pinned terms (may be empty), the quote that is supposed to support it, and the transcript lines around that quote.",
  "verdict 'not_supported': the quote and the lines around it do not show an explicit agreement to exactly this decision (a proposal nobody accepted, agreement to something else, or the decision says more than was said).",
  "verdict 'terms_unclear': the decision defines or changes a data or interface structure and the lines do not make clear what its key, value or unit is, or the wording and an example point to different readings; 'terms' then says which term and the readings, starting with 'не уточнено: '.",
  "verdict 'ok' only when both hold. When in doubt, do not say 'ok'.",
  "reason: one short sentence in Russian. Never propose a new wording, never pick a reading.",
].join("\n");

export type CheckItem = { id: string; text: string; terms: string; quote: string; context: string };

/** Accepted, visible decisions that have a quote to check against. */
export function checkableDecisions(decisions: Decision[] | undefined): Decision[] {
  return (decisions ?? []).filter((d) => d.status === "accepted" && !d.removed && d.text.trim() && d.quote && typeof d.at === "number");
}

function clock(at: number, startedAt: number): string {
  const s = Math.max(0, Math.floor((at - startedAt) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** The lines around the quoted one (the first segment at or after `at`). */
export function quoteContext(transcript: TranscriptSegment[], at: number, startedAt: number): string {
  if (transcript.length === 0) return "";
  let index = transcript.findIndex((seg) => seg.at >= at);
  if (index < 0) index = transcript.length - 1;
  const from = Math.max(0, index - CHECK_CONTEXT_LINES);
  const to = Math.min(transcript.length, index + CHECK_CONTEXT_LINES + 1);
  return transcript
    .slice(from, to)
    .map((seg) => `[${clock(seg.at, startedAt)}] [${seg.speaker === "me" ? "Я" : "Собеседник"}]: ${seg.text}`)
    .join("\n");
}

/** Short ids c1, c2 ... in the request; the caller maps them back. */
export function buildCheckItems(decisions: Decision[], transcript: TranscriptSegment[], startedAt: number): CheckItem[] {
  return decisions.map((d, i) => ({
    id: `c${i + 1}`,
    text: d.text,
    terms: d.terms ?? "",
    quote: d.quote ?? "",
    context: quoteContext(transcript, d.at!, startedAt),
  }));
}

export function buildCheckUserContent(items: CheckItem[]): string {
  return ["Decisions to check (JSON):", "<decisions>", JSON.stringify(items), "</decisions>"].join("\n");
}

/** Rough tokens of the whole check (request and answer), for the warning before it runs. */
export function checkCostTokens(items: CheckItem[]): number {
  const chars = CHECK_SYSTEM_PROMPT.length + buildCheckUserContent(items).length + items.length * CHECK_REPLY_CHARS_PER_DECISION;
  return roundTokens(Math.ceil(chars / CHARS_PER_TOKEN));
}

export type CheckResult = { id: string; verdict: DecisionCheck["verdict"]; terms: string; reason: string };

/** Tolerant: fenced or bare JSON, a bare list; an unknown verdict is dropped (never read as "ok"). */
export function parseCheckReply(raw: string): CheckResult[] | null {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  let data: unknown;
  try {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : (data as { checks?: unknown } | null)?.checks;
  if (!Array.isArray(list)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: CheckResult[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const verdict = r.verdict;
    if (verdict !== "ok" && verdict !== "not_supported" && verdict !== "terms_unclear") continue;
    if (!str(r.id)) continue;
    out.push({ id: str(r.id), verdict, terms: str(r.terms), reason: str(r.reason).slice(0, 500) });
  }
  return out;
}

/**
 * Folds the check into the decisions. It can only lower: "not_supported"
 * turns an accepted row into "proposed", "terms_unclear" writes
 * "не уточнено: ..." into its terms; both uncheck it. A row the analyst
 * edited by hand keeps its content and only gets the note. Rows that were
 * not sent are untouched.
 */
export function applyCheck(decisions: Decision[], sentIds: Map<string, string>, results: CheckResult[], at: number): Decision[] {
  const byRow = new Map<string, CheckResult>();
  for (const r of results) {
    const rowId = sentIds.get(r.id);
    if (rowId && !byRow.has(rowId)) byRow.set(rowId, r);
  }
  return decisions.map((d) => {
    const r = byRow.get(d.id);
    if (!r) return d;
    const check: DecisionCheck = { verdict: r.verdict, reason: r.reason, at };
    if (d.manual || d.status !== "accepted" || r.verdict === "ok") return { ...d, check };
    if (r.verdict === "not_supported") return { ...d, status: "proposed", include: false, check };
    const said = r.terms.replace(/^\s*не\s+уточнено\s*:?\s*/iu, "").trim() || r.reason;
    // What the summary had pinned stays readable next to the doubt.
    const before = d.terms?.trim() && !/^\s*не\s+уточнено/iu.test(d.terms) ? ` (в итогах: ${d.terms.trim()})` : "";
    return { ...d, terms: `не уточнено: ${said}${before}`.trim(), include: false, check };
  });
}
