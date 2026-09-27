// Canned prompts shown as buttons in the overlay — a static list, since
// there's no backend to fetch them from.
// `prompt` is what's sent to the model (kept in English — the model reads it
// fine regardless, and always answers in Russian per the system prompt); the
// visible button label is looked up by `key` in lib/i18n.ts so it can follow
// the overlay's own uiLanguage independently.
import type { MeetingMode } from "../../../electron/shared/ipc-contract.js";

export type QuickActionKey = "summarize" | "risks" | "askQuestion" | "explainThis";

export type QuickAction = {
  key: QuickActionKey;
  prompt: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "summarize", prompt: "Summarize the last couple of minutes of this call in 2-3 bullet points." },
  {
    key: "risks",
    prompt:
      "What risks or gaps in the requirement should I flag right now, based on what was just discussed? Put each risk on its own line starting with 'Риск:'.",
  },
  { key: "askQuestion", prompt: "Suggest one sharp clarifying question I should ask next." },
  { key: "explainThis", prompt: "Explain, in plain terms, what was just said or shown on screen." },
];

/**
 * The quick actions a meeting mode shows. Interview has none: it gets a
 * permanent "Process now" instead. "Risks?" is dropped everywhere except
 * `free`: every other mode's own prompt (electron/modes.ts) already tells
 * the model to put a risk on its own line whenever it notices one, and a
 * mode with a board (lib/mode-board.ts) collects those lines automatically
 * as the call goes — asking the same question on a click adds nothing.
 * `free` has no such standing instruction and no board, so it is the one
 * mode where the button still does real work.
 */
export function quickActionsFor(mode: MeetingMode): QuickAction[] {
  if (mode === "interview") return [];
  if (mode === "free") return QUICK_ACTIONS;
  return QUICK_ACTIONS.filter((action) => action.key !== "risks");
}
