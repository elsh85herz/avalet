import {
  ARTIFACT_HIGHLIGHT_CHARS,
  ARTIFACT_SECTION_CHAR_CAP,
  LIVE_INDEX_OVERHEAD_CHARS,
  SUMMARY_ARTIFACT_OVERHEAD_CHARS,
  buildArtifactIndex,
  estimateTokens,
  roundTokens,
} from "../../../electron/shared/artifact.js";
import type { MeetingMode } from "../../../electron/shared/ipc-contract.js";

// The plain-words token figures shown before a spend that the review
// document adds (CLOUD_TASK_5 rule). Each returns null when nothing extra is
// spent: another meeting mode, or no document loaded. Rough on purpose.

export type FieldCost = {
  /** Each of the two end-of-meeting calls (summary, update) carries about this many more tokens. */
  tokensEach: number;
  /** What the index adds to every live suggestion. */
  indexTokens: number;
  /** At most what a typed question naming a section adds. */
  sectionTokens: number;
  /** Large document: say so louder. */
  high: boolean;
};

/** Shown in the document field before Start. */
export function artifactFieldCost(mode: MeetingMode, text: string): FieldCost | null {
  if (mode !== "review" || !text.trim()) return null;
  return {
    tokensEach: roundTokens(estimateTokens(text.length + SUMMARY_ARTIFACT_OVERHEAD_CHARS)),
    indexTokens: roundTokens(estimateTokens(buildArtifactIndex(text).length + LIVE_INDEX_OVERHEAD_CHARS)),
    sectionTokens: roundTokens(estimateTokens(ARTIFACT_SECTION_CHAR_CAP)),
    high: text.length > ARTIFACT_HIGHLIGHT_CHARS,
  };
}

/** Shown next to "Summarize" for a review meeting with a document: how much bigger the summary request is. */
export function summaryExtraCost(meeting: { mode: MeetingMode; artifact?: { text: string } }): { tokens: number; high: boolean } | null {
  const text = meeting.artifact?.text ?? "";
  if (meeting.mode !== "review" || !text.trim()) return null;
  return {
    tokens: roundTokens(estimateTokens(text.length + SUMMARY_ARTIFACT_OVERHEAD_CHARS)),
    high: text.length > ARTIFACT_HIGHLIGHT_CHARS,
  };
}

/** "23 000" / "23,000". */
export function formatTokens(tokens: number, language: "ru" | "en"): string {
  return tokens.toLocaleString(language === "ru" ? "ru-RU" : "en-US");
}
