import {
  ARTIFACT_HIGHLIGHT_CHARS,
  ARTIFACT_SECTION_CHAR_CAP,
  LIVE_INDEX_OVERHEAD_CHARS,
  PATCH_PROMPT_OVERHEAD_CHARS,
  expectedReplyChars,
  patchDecisions,
  SUMMARY_ARTIFACT_OVERHEAD_CHARS,
  SUMMARY_DECISIONS_REPLY_CHARS,
  SUMMARY_REVIEW_REPLY_CHARS,
  SUMMARY_REVIEW_RULES_CHARS,
  buildArtifactIndex,
  estimateTokens,
  roundTokens,
} from "../../../electron/shared/artifact.js";
import type { Decision, MeetingMode } from "../../../electron/shared/ipc-contract.js";

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
    tokensEach: roundTokens(estimateTokens(text.length + SUMMARY_ARTIFACT_OVERHEAD_CHARS + SUMMARY_DECISIONS_REPLY_CHARS)),
    indexTokens: roundTokens(estimateTokens(buildArtifactIndex(text).length + LIVE_INDEX_OVERHEAD_CHARS)),
    sectionTokens: roundTokens(estimateTokens(ARTIFACT_SECTION_CHAR_CAP)),
    high: text.length > ARTIFACT_HIGHLIGHT_CHARS,
  };
}

/**
 * Shown next to "Summarize" for every review meeting: how much bigger the
 * summary request is than an ordinary one. The review rules (unanswered
 * questions, terms, contradictions, participants) always; the document and
 * the decisions list when a document is attached.
 */
export function summaryExtraCost(meeting: { mode: MeetingMode; artifact?: { text: string } }): { tokens: number; high: boolean; document: boolean } | null {
  if (meeting.mode !== "review") return null;
  const text = meeting.artifact?.text ?? "";
  const document = Boolean(text.trim());
  const chars = SUMMARY_REVIEW_RULES_CHARS + SUMMARY_REVIEW_REPLY_CHARS + (document ? text.length + SUMMARY_ARTIFACT_OVERHEAD_CHARS + SUMMARY_DECISIONS_REPLY_CHARS : 0);
  return { tokens: roundTokens(estimateTokens(chars)), high: document && text.length > ARTIFACT_HIGHLIGHT_CHARS, document };
}

export type UpdateCost = { doc: number; decisions: number; reply: number; total: number; count: number; high: boolean };

/** Decisions that go into "Update the document". */
export function chosenDecisions(decisions: Decision[] | undefined): Decision[] {
  return (decisions ?? []).filter((d) => d.include && !d.removed && d.text.trim());
}

/** Shown next to "Update the document" and in its confirmation: the document, the checked decisions, the expected answer. */
export function updateCost(meeting: { mode: MeetingMode; artifact?: { text: string }; decisions?: Decision[] }): UpdateCost | null {
  const text = meeting.artifact?.text ?? "";
  if (meeting.mode !== "review" || !text.trim()) return null;
  const chosen = chosenDecisions(meeting.decisions);
  if (chosen.length === 0) return null;
  const docChars = text.length + PATCH_PROMPT_OVERHEAD_CHARS;
  const decisionChars = JSON.stringify(patchDecisions(chosen)).length;
  const replyChars = expectedReplyChars(chosen);
  return {
    doc: roundTokens(estimateTokens(docChars)),
    decisions: roundTokens(estimateTokens(decisionChars)),
    reply: roundTokens(estimateTokens(replyChars)),
    total: roundTokens(estimateTokens(docChars + decisionChars + replyChars)),
    count: chosen.length,
    high: text.length > ARTIFACT_HIGHLIGHT_CHARS,
  };
}

/** "23 000" / "23,000". */
export function formatTokens(tokens: number, language: "ru" | "en"): string {
  return tokens.toLocaleString(language === "ru" ? "ru-RU" : "en-US");
}
