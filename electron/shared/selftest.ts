// The made-up exchange behind the wizard's "Try it": shown to the user as a
// sample and sent to the model once, so the user sees a real suggestion
// before the first meeting. Russian, like the answers. Deliberately not about
// limits or budgets: a question about a "limit" here was once read as a
// message about the app's own limits.

export const SELFTEST_LINES: Array<{ speaker: "me" | "other"; text: string }> = [
  { speaker: "other", text: "Нам нужно, чтобы менеджер мог сам выгружать отчёт по заявкам прямо из системы." },
  { speaker: "me", text: "За какой период нужен отчёт?" },
  { speaker: "other", text: "Обычно за месяц. И, наверное, только по своему региону." },
];

/** The same exchange in the transcript format the prompts use. */
export const SELFTEST_TRANSCRIPT = SELFTEST_LINES.map((line) => `[${line.speaker === "me" ? "Я" : "Собеседник"}]: ${line.text}`).join("\n");

/** Shown when the sample call cannot run (no access yet, offline). */
export const SELFTEST_EXAMPLE_SUGGESTION =
  "Уточните: регион берётся из профиля менеджера или выбирается при выгрузке? И в каком формате нужен отчёт: Excel или PDF?";
