// Canned prompts shown as buttons in the overlay — a static list, since
// there's no backend to fetch them from.
// `prompt` is what's sent to the model (kept in English — the model reads it
// fine regardless, and always answers in Russian per the system prompt); the
// visible button label is looked up by `key` in lib/i18n.ts so it can follow
// the overlay's own uiLanguage independently.
import type { MeetingMode } from "../../../electron/shared/ipc-contract.js";

export type QuickActionKey = "summarize" | "risks" | "askQuestion" | "explainThis" | "hiddenWork";

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

/** Grooming asks about hidden work in place of the general risks question (it covers the risks that change the size). */
const HIDDEN_WORK: QuickAction = {
  key: "hiddenWork",
  prompt:
    "What hidden work or size-changing risks is the team missing for the task being discussed: data migration or backfill, feature flags, monitoring and alerts, rollback plan, access rights, documentation, load testing? Only what applies here, each on its own line starting with 'Риск:'.",
};

/** The quick actions a meeting mode shows. Interview has none: it gets a permanent "Process now" instead. */
export function quickActionsFor(mode: MeetingMode): QuickAction[] {
  if (mode === "interview") return [];
  if (mode === "grooming") return QUICK_ACTIONS.map((action) => (action.key === "risks" ? HIDDEN_WORK : action));
  return QUICK_ACTIONS;
}
