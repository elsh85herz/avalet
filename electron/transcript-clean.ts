import type { AgendaStatusItem, Decision, Meeting, QuoteRef, TranscriptSegment } from "./shared/ipc-contract.js";
import { OVERLAP_TOLERANCE_MS, looksLikeEcho } from "./echo-filter.js";
import { isCreditLine } from "./transcript-noise.js";
import { locateQuote } from "./live-tracker-logic.js";

// The saved transcript, cleaned once more after the call (CLOUD_TASK_6,
// finding 5). The live echo filter only waits a few seconds for the clean
// copy of the other side's speech; when it arrives later, both copies are
// saved. Here the whole call is known, so the same comparison runs over all
// of it. Nothing is deleted: a line is marked `filtered` and kept in the
// record; the view hides it behind "show hidden lines", the exports and the
// summary leave it out. Pure functions; the store applies them.

/** Same-channel silence around a credit line that makes it a "quiet stretch". */
export const QUIET_GAP_MS = 2_000;
/** Speech rate used to guess when an older segment (no `end`) ended: about 14 characters a second. */
const MS_PER_CHAR = 70;
const MIN_GUESS_MS = 1_000;
const MAX_GUESS_MS = 12_000;

/** faster-whisper's own defaults for "probably wrong" and "probably not speech". */
export const LOW_LOGPROB = -1.0;
export const NO_SPEECH_PROB = 0.6;

/** Flags for a segment from the recognizer's numbers; nothing when it gave none. */
export function confidenceFlags(result: { avg_logprob?: unknown; no_speech_prob?: unknown }): Pick<TranscriptSegment, "lowConfidence" | "quiet"> {
  const out: Pick<TranscriptSegment, "lowConfidence" | "quiet"> = {};
  if (typeof result.avg_logprob === "number" && result.avg_logprob < LOW_LOGPROB) out.lowConfidence = true;
  if (typeof result.no_speech_prob === "number" && result.no_speech_prob > NO_SPEECH_PROB) out.quiet = true;
  return out;
}

/** The lines a person reads, quotes and exports: filtered ones stay in the record only. */
export function visibleSegments(transcript: TranscriptSegment[]): TranscriptSegment[] {
  return transcript.filter((seg) => !seg.filtered);
}

export function segmentEnd(seg: TranscriptSegment): number {
  if (typeof seg.end === "number" && seg.end >= seg.at) return seg.end;
  return seg.at + Math.min(MAX_GUESS_MS, Math.max(MIN_GUESS_MS, seg.text.length * MS_PER_CHAR));
}

function isolatedOnItsChannel(index: number, transcript: TranscriptSegment[], skip: Set<number>): boolean {
  const seg = transcript[index]!;
  const start = seg.at;
  const end = segmentEnd(seg);
  return transcript.every((other, i) => {
    if (i === index || skip.has(i) || other.speaker !== seg.speaker) return true;
    return segmentEnd(other) <= start - QUIET_GAP_MS || other.at >= end + QUIET_GAP_MS;
  });
}

/**
 * Marks, from scratch every time (the same input gives the same marks):
 * 1. "noise": the whole text is a known credit line and the stretch is quiet
 *    (the recognizer said "probably not speech", or nobody else on that
 *    channel spoke within 2 s either side);
 * 2. "echo": a mic line that (almost) repeats what the other side said at the
 *    same time, by the live filter's own comparison. Lines that differ in
 *    meaning (both talking at once) fail the comparison and stay.
 */
export function cleanTranscript(transcript: TranscriptSegment[]): TranscriptSegment[] {
  const base = transcript.map(({ filtered: _drop, ...seg }) => seg as TranscriptSegment);
  const credit = new Set<number>();
  base.forEach((seg, i) => {
    if (isCreditLine(seg.text)) credit.add(i);
  });
  const noise = new Set<number>();
  for (const i of credit) if (base[i]!.quiet || isolatedOnItsChannel(i, base, credit)) noise.add(i);

  const others = base
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg, i }) => seg.speaker === "other" && !noise.has(i))
    .map(({ seg }) => ({ start: seg.at, end: segmentEnd(seg), text: seg.text }));
  const echo = new Set<number>();
  base.forEach((seg, i) => {
    if (seg.speaker !== "me" || noise.has(i)) return;
    const start = seg.at;
    const end = segmentEnd(seg);
    const overlapping = others
      .filter((o) => o.start <= end + OVERLAP_TOLERANCE_MS && start <= o.end + OVERLAP_TOLERANCE_MS)
      .map((o) => o.text);
    if (looksLikeEcho(seg.text, overlapping)) echo.add(i);
  });

  return base.map((seg, i) => (noise.has(i) ? { ...seg, filtered: "noise" } : echo.has(i) ? { ...seg, filtered: "echo" } : seg));
}

/** How many lines are hidden, by reason. */
export function hiddenCounts(transcript: TranscriptSegment[]): { echo: number; noise: number } {
  return {
    echo: transcript.filter((seg) => seg.filtered === "echo").length,
    noise: transcript.filter((seg) => seg.filtered === "noise").length,
  };
}

/** A quote found again among the visible lines: its time and speaker follow the kept copy. */
function relocate<T extends QuoteRef>(item: T, visible: TranscriptSegment[]): T {
  if (!item.quote) return item;
  const found = locateQuote(item.quote, visible);
  return found ? { ...item, at: found.at, speaker: found.speaker } : item;
}

/**
 * Cleans a finished meeting's transcript and moves every stored quote onto a
 * visible line (a quote found on a hidden echo copy would carry the wrong
 * speaker). Returns what changed, or null when nothing did.
 */
export function cleanMeeting(meeting: Meeting): Pick<Meeting, "transcript" | "agendaStatus" | "actions" | "decisions"> | null {
  const transcript = cleanTranscript(meeting.transcript);
  const changed = transcript.some((seg, i) => seg.filtered !== meeting.transcript[i]!.filtered);
  if (!changed) return null;
  const visible = visibleSegments(transcript);
  const hidden = new Set(transcript.filter((seg) => seg.filtered).map((seg) => seg.at));
  const move = <T extends QuoteRef>(item: T) => (typeof item.at === "number" && hidden.has(item.at) ? relocate(item, visible) : item);
  return {
    transcript,
    ...(meeting.agendaStatus ? { agendaStatus: meeting.agendaStatus.map((a: AgendaStatusItem) => move(a)) } : {}),
    ...(meeting.actions ? { actions: meeting.actions.map((a) => move(a)) } : {}),
    ...(meeting.decisions ? { decisions: meeting.decisions.map((d: Decision) => move(d)) } : {}),
  };
}
