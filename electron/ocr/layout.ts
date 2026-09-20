import type { OcrResult } from "./types.js";

type Placed = { text: string; left: number; right: number; top: number; bottom: number; midY: number };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MAX_INDENT = 40;
const MAX_GAP_SPACES = 6;

/**
 * Rebuilds reading order and rough spacing from raw recognized boxes:
 * engines return pieces in arbitrary order and lose indentation, which
 * matters for code and tables on screen. Lines are grouped by vertical
 * overlap, sorted left to right, indented by their offset in average
 * character widths, and separated by a blank line where there is a
 * paragraph-sized vertical gap.
 */
export function observationsToText(result: OcrResult, maxChars = 8000): string {
  const { width, height } = result;
  const items: Placed[] = result.observations
    .filter((o) => o.text.trim().length > 0)
    .map((o) => ({
      text: o.text.replace(/\s+/g, " ").trim(),
      left: o.x * width,
      right: (o.x + o.w) * width,
      top: o.y * height,
      bottom: (o.y + o.h) * height,
      midY: (o.y + o.h / 2) * height,
    }));
  if (items.length === 0) return "";

  const charWidth = median(items.map((i) => (i.right - i.left) / Math.max(1, i.text.length))) || 8;
  const lineHeight = median(items.map((i) => i.bottom - i.top)) || 16;
  const minLeft = Math.min(...items.map((i) => i.left));

  items.sort((a, b) => a.midY - b.midY);
  const lines: Placed[][] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    const ref = line ? line[0] : undefined;
    const overlap = ref
      ? Math.min(ref.bottom, item.bottom) - Math.max(ref.top, item.top)
      : 0;
    const smaller = ref ? Math.min(ref.bottom - ref.top, item.bottom - item.top) : 1;
    if (line && overlap > 0.5 * smaller) line.push(item);
    else lines.push([item]);
  }

  const out: string[] = [];
  let previousBottom: number | null = null;
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);
    const top = Math.min(...line.map((i) => i.top));
    const bottom = Math.max(...line.map((i) => i.bottom));
    if (previousBottom !== null && top - previousBottom > 1.2 * lineHeight) out.push("");
    previousBottom = bottom;

    const indent = Math.min(MAX_INDENT, Math.max(0, Math.round((line[0].left - minLeft) / charWidth)));
    let text = " ".repeat(indent) + line[0].text;
    for (let i = 1; i < line.length; i++) {
      const gap = line[i].left - line[i - 1].right;
      const spaces = Math.min(MAX_GAP_SPACES, Math.max(1, Math.round(gap / charWidth)));
      text += " ".repeat(spaces) + line[i].text;
    }
    out.push(text.replace(/\s+$/g, ""));
  }

  const joined = out.join("\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}\n[... truncated]` : joined;
}
