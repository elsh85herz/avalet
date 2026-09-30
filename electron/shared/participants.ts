import type { Participant, ParticipantKind, TranscriptSegment } from "./ipc-contract.js";

// CLOUD_TASK_6, finding 4: participants as the call shows them. The recognizer
// gives no names, so a name can only come from the words of the call; the
// summary is told so, and this file checks it in code.

const KINDS: ParticipantKind[] = ["named", "inferred", "third_party"];

/** Tolerant: a broken list gives [], an unknown kind reads as "inferred", an entry with neither who nor role is dropped. */
export function parseParticipants(value: unknown): Participant[] {
  if (!Array.isArray(value)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "");
  const out: Participant[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const who = str(r.who);
    const role = str(r.role);
    if (!who && !role) continue;
    out.push({ who, role, kind: KINDS.includes(r.kind as ParticipantKind) ? (r.kind as ParticipantKind) : "inferred" });
  }
  return out.slice(0, 20);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when every word of the name (3 letters or more) starts a word of the
 * transcript; the ending may differ ("Олег" is found in "Олегу").
 */
export function nameWasSaid(name: string, transcript: Array<Pick<TranscriptSegment, "text">>): boolean {
  const parts = words(name).filter((w) => w.length >= 3);
  if (parts.length === 0) return false;
  const said = new Set(transcript.flatMap((seg) => words(seg.text)));
  return parts.every((part) => {
    const stem = part.slice(0, Math.max(3, part.length - 2));
    for (const word of said) if (word.startsWith(stem)) return true;
    return false;
  });
}

/**
 * A name that is not in the transcript is removed (the role stays, a "named"
 * entry becomes "inferred"); an entry left with nothing is dropped; repeats
 * are merged. The briefing is never a source of names.
 */
export function groundParticipants(raw: Participant[], transcript: Array<Pick<TranscriptSegment, "text">>): Participant[] {
  const out: Participant[] = [];
  for (const p of raw) {
    let { who, kind } = p;
    if (who && !nameWasSaid(who, transcript)) {
      who = "";
      if (kind === "named") kind = "inferred";
    }
    if (kind === "named" && !who) kind = "inferred";
    if (!who && !p.role) continue;
    const key = `${kind}|${who.toLowerCase()}|${p.role.toLowerCase()}`;
    if (out.some((q) => `${q.kind}|${q.who.toLowerCase()}|${q.role.toLowerCase()}` === key)) continue;
    out.push({ who, role: p.role, kind });
  }
  return out;
}

export type ParticipantLabels = { inferred: string; thirdParty: string };

/** One line: named people, then "from the call: roles", then "not in the call: ...". "" when nothing is known. */
export function formatParticipants(list: Participant[] | undefined, labels: ParticipantLabels): string {
  const items = list ?? [];
  const show = (p: Participant) => (p.who && p.role ? `${p.who} (${p.role})` : p.who || p.role);
  const named = items.filter((p) => p.kind === "named").map(show);
  const inferred = items.filter((p) => p.kind === "inferred").map(show);
  const third = items.filter((p) => p.kind === "third_party").map(show);
  const parts = [...(named.length ? [named.join(", ")] : [])];
  if (inferred.length) parts.push(`${labels.inferred}: ${inferred.join(", ")}`);
  if (third.length) parts.push(`${labels.thirdParty}: ${third.join(", ")}`);
  return parts.join("; ");
}
