// Canned prompts shown as buttons in the overlay — a static list, since
// there's no backend to fetch them from.
// `prompt` is what's sent to the model (kept in English — the model reads it
// fine regardless, and always answers in Russian per the system prompt); the
// visible button label is looked up by `key` in lib/i18n.ts so it can follow
// the overlay's own uiLanguage independently.
export type QuickActionKey = "summarize" | "risks" | "askQuestion" | "explainThis";

export type QuickAction = {
  key: QuickActionKey;
  prompt: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "summarize", prompt: "Summarize the last couple of minutes of this call in 2-3 bullet points." },
  { key: "risks", prompt: "What risks or gaps in the requirement should I flag right now, based on what was just discussed?" },
  { key: "askQuestion", prompt: "Suggest one sharp clarifying question I should ask next." },
  { key: "explainThis", prompt: "Explain, in plain terms, what was just said or shown on screen." },
];
