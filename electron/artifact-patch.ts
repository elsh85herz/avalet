import type { ArtifactPatch, CheckedPatch, PatchOp, PatchProblem } from "./shared/ipc-contract.js";

// Applies the model's patches to the document in code (CLOUD_TASK_5 phase 4).
// The model never returns the document: it names an exact fragment (anchor)
// and what to do there. Here every anchor must occur exactly once; a patch
// that cannot be placed is reported, never guessed, and never stops the
// others. Everything outside the changed fragments stays byte for byte.

const OPS: PatchOp[] = ["replace", "insert_after", "delete"];

type Range = { start: number; end: number; replacement: string };

/** The document's line ending, so an anchor and new text written with "\n" match a CRLF file. */
function eolOf(doc: string): "\r\n" | "\n" {
  return doc.includes("\r\n") ? "\r\n" : "\n";
}

function withEol(text: string, eol: "\r\n" | "\n"): string {
  const lf = text.replace(/\r\n?/g, "\n");
  return eol === "\n" ? lf : lf.replace(/\n/g, "\r\n");
}

/** Where the anchor is: exactly once, as written or with its edge whitespace trimmed. */
function locate(doc: string, anchor: string): { start: number; end: number } | PatchProblem {
  if (!anchor.trim()) return "empty-anchor";
  const candidates = [anchor, anchor.trim()].filter((a, i, all) => all.indexOf(a) === i);
  let sawAmbiguous = false;
  for (const candidate of candidates) {
    const at = doc.indexOf(candidate);
    if (at < 0) continue;
    if (doc.indexOf(candidate, at + 1) >= 0) {
      sawAmbiguous = true;
      continue;
    }
    return { start: at, end: at + candidate.length };
  }
  return sawAmbiguous ? "anchor-ambiguous" : "anchor-missing";
}

function rangeOf(doc: string, patch: ArtifactPatch): Range | PatchProblem {
  if (!OPS.includes(patch.op)) return "bad-op";
  const eol = eolOf(doc);
  const found = locate(doc, withEol(patch.anchor ?? "", eol));
  if (typeof found === "string") return found;
  const { start } = found;
  let { end } = found;
  const anchor = doc.slice(start, end);
  const text = withEol(patch.text ?? "", eol);
  const endsLine = end === doc.length || doc.startsWith(eol, end);
  if (patch.op === "replace") return { start, end, replacement: text };
  if (patch.op === "delete") {
    // A whole line deleted takes its line break with it: no empty line left behind.
    const startsLine = start === 0 || doc[start - 1] === "\n";
    if (startsLine && doc.startsWith(eol, end)) {
      end += eol.length;
      // A paragraph between two blank lines: one blank line stays, not two.
      const blankBefore = start >= 2 * eol.length && doc.slice(start - 2 * eol.length, start) === eol + eol;
      if ((blankBefore || start === 0) && doc.startsWith(eol, end)) end += eol.length;
    }
    return { start, end, replacement: "" };
  }
  // insert_after: a new line when the anchor ends a line and the text does not start one.
  const inserted = endsLine && text && !text.startsWith(eol) ? `${eol}${text}` : text;
  return { start, end, replacement: `${anchor}${inserted}` };
}

/**
 * Each patch checked against the original document, in the given order.
 * A patch that touches the range of an earlier good one is an overlap: the
 * earlier wins, the later is not applied.
 */
export function checkPatches(doc: string, patches: ArtifactPatch[], knownDecisions?: Set<string>): CheckedPatch[] {
  const taken: Array<{ start: number; end: number }> = [];
  return patches.map((patch) => {
    const base = { ...patch, oldFragment: "", newFragment: "" };
    if (knownDecisions && !knownDecisions.has(patch.decisionId)) return { ...base, ok: false, problem: "unknown-decision" as const };
    const range = rangeOf(doc, patch);
    if (typeof range === "string") return { ...base, ok: false, problem: range };
    const fragments = { oldFragment: doc.slice(range.start, range.end), newFragment: range.replacement };
    // Two edits of the same text would fight over it; adjacent ones are fine.
    if (taken.some((r) => range.start < r.end && r.start < range.end)) return { ...base, ...fragments, ok: false, problem: "overlap" as const };
    taken.push({ start: range.start, end: range.end });
    return { ...base, ...fragments, ok: true };
  });
}

export type ApplyResult = { text: string; applied: string[]; notApplied: Array<{ id: string; problem: PatchProblem }> };

/**
 * The document with the chosen patches applied. The check is run again on the
 * chosen set (unchecking one can free an overlap), then the good ones are
 * applied from the end so every offset still points at the original text.
 */
export function applyPatches(doc: string, patches: ArtifactPatch[], chosenIds?: string[]): ApplyResult {
  const chosen = chosenIds ? patches.filter((p) => chosenIds.includes(p.id)) : patches;
  const checked = checkPatches(doc, chosen);
  const ranges: Array<Range & { id: string }> = [];
  const notApplied: ApplyResult["notApplied"] = [];
  for (const patch of checked) {
    if (!patch.ok) {
      notApplied.push({ id: patch.id, problem: patch.problem ?? "anchor-missing" });
      continue;
    }
    const range = rangeOf(doc, patch) as Range;
    ranges.push({ ...range, id: patch.id });
  }
  let text = doc;
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    text = `${text.slice(0, range.start)}${range.replacement}${text.slice(range.end)}`;
  }
  return { text, applied: ranges.map((r) => r.id), notApplied };
}

/**
 * The model's answer: `{patches, skipped}` (or a bare list of patches), in a
 * code fence or not. null when nothing usable is in it.
 */
export function parsePatchReply(
  raw: string,
  makeId: () => string,
): { patches: ArtifactPatch[]; skipped: Array<{ decisionId: string; reason: string }> } | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  let data: unknown;
  try {
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const isArray = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
    const start = isArray ? arrStart : objStart;
    const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const obj = (Array.isArray(data) ? { patches: data } : data) as { patches?: unknown; skipped?: unknown };
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.patches)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const patches = (obj.patches as unknown[])
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: makeId(),
      decisionId: str(p.decisionId),
      op: (OPS.includes(p.op as PatchOp) ? p.op : String(p.op ?? "")) as PatchOp,
      anchor: str(p.anchor),
      text: str(p.text),
    }));
  const skipped = Array.isArray(obj.skipped)
    ? (obj.skipped as unknown[])
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
        .map((s) => ({ decisionId: str(s.decisionId), reason: str(s.reason).trim() }))
        .filter((s) => s.decisionId)
    : [];
  return { patches, skipped };
}
