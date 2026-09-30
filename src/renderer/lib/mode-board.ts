import type { MeetingMode } from "../../../electron/shared/ipc-contract.js";

// The "board" of a meeting mode: running lists the overlay collects from the
// suggestions themselves, with no extra model call. Each mode's prompt
// (electron/modes.ts) writes these items on their own line after a fixed
// marker ("Требование: ...", "Срез: ..."); this file reads them back.
// The model answers in Russian; the English markers are a fallback.

export type BoardSectionKey = "requirements" | "risks" | "slices" | "separate" | "deviations" | "checks" | "remarks" | "proposals" | "decisions";

type SectionSpec = { key: BoardSectionKey; markers: string[] };

const RISKS: SectionSpec = { key: "risks", markers: ["Риск", "Risk"] };

export const MODE_BOARD: Partial<Record<MeetingMode, SectionSpec[]>> = {
  requirements: [{ key: "requirements", markers: ["Требование", "Requirement"] }, RISKS],
  grooming: [
    { key: "slices", markers: ["Срез", "Slice"] },
    { key: "separate", markers: ["Отдельная задача", "Separate task"] },
    RISKS,
  ],
  demo: [
    { key: "deviations", markers: ["Отклонение", "Deviation"] },
    { key: "checks", markers: ["Попросите показать", "Ask to see"] },
  ],
  review: [
    { key: "remarks", markers: ["Замечание", "Remark"] },
    { key: "proposals", markers: ["Предложение", "Proposal"] },
    { key: "decisions", markers: ["Решение", "Decision"] },
  ],
};

export type BoardSection = { key: BoardSectionKey; items: string[] };

/** Most items kept per section; the oldest go first. */
export const BOARD_SECTION_LIMIT = 40;

/** Modes that have a board at all. */
export function hasBoard(mode: MeetingMode): boolean {
  return Boolean(MODE_BOARD[mode]);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cleanLine(line: string): string {
  return line
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•·]+|\d+[.)])\s*/, "")
    .trim();
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").replace(/[.;,!]+$/, "").trim();

/**
 * Items of every section of the mode's board, in the order they first
 * appeared, without repeats. `texts` are the finished suggestion blocks of
 * the current meeting, oldest first.
 */
export function extractBoard(mode: MeetingMode, texts: string[]): BoardSection[] {
  const spec = MODE_BOARD[mode];
  if (!spec) return [];
  const patterns = spec.map((section) => ({
    key: section.key,
    pattern: new RegExp(`^(?:${section.markers.map(escape).join("|")})\\s*[:：]\\s*(.+)$`, "iu"),
  }));
  const sections = spec.map((section) => ({ key: section.key, items: [] as string[], seen: new Set<string>() }));
  for (const text of texts) {
    for (const raw of text.split("\n")) {
      const line = cleanLine(raw);
      if (!line) continue;
      const index = patterns.findIndex((p) => p.pattern.test(line));
      if (index < 0) continue;
      const item = line.match(patterns[index]!.pattern)![1]!.trim();
      const section = sections[index]!;
      const key = normalize(item);
      if (!key || section.seen.has(key)) continue;
      section.seen.add(key);
      section.items.push(item);
      if (section.items.length > BOARD_SECTION_LIMIT) section.items.shift();
    }
  }
  return sections.map(({ key, items }) => ({ key, items }));
}

/** Plain text for the clipboard: one heading per non-empty section, items as a list. */
export function boardText(sections: BoardSection[], titles: Record<BoardSectionKey, string>): string {
  return sections
    .filter((s) => s.items.length > 0)
    .map((s) => [titles[s.key], ...s.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n");
}
