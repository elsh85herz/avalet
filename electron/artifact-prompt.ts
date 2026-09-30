import { normalizeEol, type PatchDecision } from "./shared/artifact.js";

// The one model call of "Update the document" (CLOUD_TASK_5 phase 4). The
// model returns patches only; electron/artifact-patch.ts applies them.

export const PATCH_SYSTEM_PROMPT = [
  "You turn confirmed decisions into patches to a document. You never rewrite the document and never return it whole.",
  'Return ONLY one JSON object and nothing before or after it: {"patches":[{"decisionId":"d1","op":"replace","anchor":"...","text":"..."}],"skipped":[{"decisionId":"d2","reason":"..."}]}',
  "Rules:",
  "- Change nothing that no decision below asks for. A decision may need one or several patches; every patch names the decisionId it carries out.",
  "- op 'replace': the anchor is replaced by text. op 'insert_after': text is inserted right after the anchor; to add a new line or paragraph, anchor on the whole preceding line and start text with a line break. op 'delete': the anchor is removed (text is ignored).",
  "- anchor must be copied character for character from the document (same spaces, punctuation, letter case and markdown marks) and must occur in it exactly once. Use the smallest fragment around the change that is unique; take a whole line or sentence when a short fragment repeats.",
  "- Keep the document's own language, style, terminology, numbering and markdown formatting. Renumber nothing unless a decision asks for it.",
  "- Use a decision's 'before' and 'after' when they are given: 'before' says what to find, 'after' is the wording to use. When 'after' is empty, write the smallest change that carries out the decision's text, in the document's style.",
  "- When a decision cannot be placed with confidence (no fitting place, unclear what to change, the document already says it), do not guess: list it in 'skipped' with a short reason in Russian.",
  "- A decision's 'terms' say what its structure words mean (what the key is, what the value is, one entry per what). Follow them exactly. When 'terms' start with 'не уточнено', or a decision introduces a map or another key-value structure and neither its text nor its 'terms' say what the key is, do not pick a reading: list it in 'skipped' with the reason 'термины не уточнены'.",
  "- The analyst has confirmed these decisions. Do not add decisions, merge them or reinterpret them.",
].join("\n");

export function buildPatchUserContent(document: string, decisions: PatchDecision[]): string {
  return [
    "<document>",
    normalizeEol(document),
    "</document>",
    "",
    "Decisions to carry out (JSON):",
    "<decisions>",
    JSON.stringify(decisions),
    "</decisions>",
  ].join("\n");
}
