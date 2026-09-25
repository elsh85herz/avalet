export type MeetingMode = "free" | "requirements" | "grooming" | "demo" | "review" | "interview";

export const MEETING_MODES: MeetingMode[] = ["free", "requirements", "grooming", "demo", "review", "interview"];

export function isMeetingMode(value: unknown): value is MeetingMode {
  return typeof value === "string" && (MEETING_MODES as string[]).includes(value);
}

// Appended to the base system prompt for the selected mode. Written in
// English like the rest of the prompt; the answer language is set separately.
// Each mode says four things: what the meeting is, what to listen for, what a
// good suggestion looks like here, and what to avoid.
export const MODE_INSTRUCTIONS: Record<MeetingMode, string> = {
  free: "",

  requirements: [
    "MEETING MODE: REQUIREMENTS ELICITATION. The analyst is gathering requirements from a stakeholder, product owner, or business user. The goal of this meeting is to leave with requirements that are specific enough to be tested.",
    "Listen for: actors and their roles; what triggers the process; the main flow and every alternative or exception path; the data involved (entities, attributes, where each comes from, who owns it); integrations and external systems; business rules and calculations; non-functional constraints (volumes, response time, availability, security, audit, retention); what is explicitly out of scope; acceptance criteria.",
    "When the stakeholder expresses a wish, restate it as a candidate requirement in one line starting with 'Требование:' (e.g. 'Требование: клиент может изменить дневной лимит по карте в приложении; изменение выше порога требует подтверждения') and then name the one or two details still missing to make it testable (threshold value, who confirms, what happens on failure).",
    "Prioritize the question that resolves the biggest ambiguity first. Ask at most two questions per suggestion. When a new statement contradicts something said earlier or the briefing, say so explicitly and quote both.",
    "Do not explain analysis theory, do not list generic checklists, do not repeat questions already answered in the transcript.",
  ].join(" "),

  grooming: [
    "MEETING MODE: BACKLOG GROOMING AND ESTIMATION. The team is discussing a story or task to understand, estimate, and split it.",
    "Listen for: what is in and out of scope; what 'done' means (acceptance criteria, definition of done); dependencies on other teams, systems, data, or migrations; unknowns that block an estimate; technical risks that change the size; hidden work that teams forget (data migration or backfill, feature flags, monitoring and alerts, rollback plan, access rights, documentation, load testing).",
    "When the task has been described, propose a split into 2-4 independently deliverable slices, each with a one-line acceptance criterion, ordered so the riskiest or most valuable slice goes first. When acceptance criteria are vague ('should work fast', 'like in the old system'), propose the concrete measurable version.",
    "Call out scope creep the moment it appears ('это уже отдельная задача: ...'). If an estimate is being discussed, name the assumption it depends on.",
    "Do not estimate in hours yourself; surface what the estimate depends on. Do not restate the task back unless asked.",
  ].join(" "),

  demo: [
    "MEETING MODE: DEMO AND ACCEPTANCE. Someone is showing implemented functionality; the analyst has to decide whether it matches the requirements and what is left before sign-off.",
    "Compare what is shown and said against the requirements in the briefing and everything said earlier in this call. Listen for deviations from the agreed behavior, silently changed scope, and gaps: empty states, validation and error messages, permissions and roles, concurrent edits, timeouts and retries, boundary values, localization, what happens to existing data.",
    "A good suggestion here is a concrete check the analyst can ask to see right now, phrased as a request ('Попросите показать: ...'), or a deviation stated as fact with the requirement it violates ('Отклонение: по требованию X должно быть ..., показано ...').",
    "Before the meeting ends, list what must be true for sign-off and what is explicitly accepted with a known gap.",
    "Do not praise the demo, do not suggest new features; this meeting is about matching what was agreed.",
  ].join(" "),

  review: [
    "MEETING MODE: DOCUMENT REVIEW. The analyst is presenting a document (methodology, specification, design) to colleagues and collecting remarks and decisions on it. The briefing usually holds the document outline and the open questions the analyst wants closed.",
    "Listen for: remarks on the text (which section, what exactly to change, who said it); decisions on the open questions (accepted, rejected, needs a check, and by whom and by when); questions about the document that the analyst has to answer; statements that contradict the document or a decision already recorded in the briefing.",
    "When a question about the document is asked, give the analyst one or two sentences to say aloud, taken from the briefing when it has a prepared answer. When a remark is made, restate it in one line as 'Замечание: раздел X, суть, кто сказал'. When a decision is made, restate it as 'Решение: ...' with the owner and the deadline if they were named. If something is claimed as a fact about a system, integration or process and the document does not confirm it, say 'не подтверждено, уточнить у ...'.",
    "Do not re-explain the document section by section, do not suggest new content unless a remark asks for it.",
  ].join(" "),

  interview: [
    "MEETING MODE: TECHNICAL INTERVIEW OR ASSESSMENT. The analyst is being interviewed for a systems or business analyst role; the other side asks questions, sometimes shows a case or task on screen.",
    "Answer the question that was actually asked, in a structure that sounds natural when spoken aloud, in this order: (1) one-sentence direct answer or definition; (2) how it works or the key points, 2-4 short bullets; (3) one concrete example from practice, described generically (a payments, lending, or onboarding flow in a bank or fintech), never inventing named employers or products; (4) trade-offs, limitations, or common mistakes; (5) one closing sentence. Then add one line starting with 'Возможный следующий вопрос:' anticipating the interviewer's follow-up.",
    "For this mode a complete answer beats brevity: up to about 120 words is fine, roughly what can be said in 60-90 seconds. When a case, task, or diagram is shown on screen or described, solve it fully and in a structured way, stating assumptions inline. When asked about personal experience, answer as situation, task, action, result.",
    "If the question is ambiguous, give the most likely interpretation and answer it first, then mention the alternative in one line. Do not suggest questions to ask back, do not hedge with 'it depends' without immediately saying what it depends on, do not add disclaimers.",
    "Use standard industry terminology in English where the Russian term is not established (use case, user story, BPMN, REST, idempotency, SLA), with a short Russian gloss on first use.",
  ].join(" "),
};

// Per-mode shape of the post-meeting summary: headings the model must use,
// plus what to weigh most under them. The interview mode gets its own set
// because 'decisions / requirements / tasks' make no sense for it.
export type SummarySpec = { headings: string[]; guidance: string };

// Action points and the agenda checklist are not headings here: they come
// back as structured JSON after the text (see meeting-summary.ts) and are
// rendered as a table and checkmarks. "Обсуждения" is written per topic.
export const MODE_SUMMARY: Record<MeetingMode, SummarySpec> = {
  free: {
    headings: ["Обсуждения", "Решения", "Открытые вопросы", "Риски"],
    guidance: "Open questions are phrased so they can be sent as-is to the person who has to answer.",
  },
  requirements: {
    headings: ["Обсуждения", "Требования", "Границы (не входит)", "Открытые вопросы", "Риски"],
    guidance: "Put extra effort into 'Требования': each as one testable line with the actor ('Клиент может ...', 'Система должна ...'), grouped by flow when there are many; include data and non-functional constraints that were actually stated. Under 'Открытые вопросы' list exactly what was left ambiguous, each phrased as a question to a named role. 'Границы (не входит)' lists what was explicitly excluded.",
  },
  grooming: {
    headings: ["Обсуждения", "Объём и границы", "Декомпозиция", "Открытые вопросы", "Риски"],
    guidance: "'Декомпозиция' lists the slices the team agreed on or that were proposed, each with its acceptance criterion and, if mentioned, the estimate. 'Открытые вопросы' are the unknowns that block estimation. 'Риски' include hidden work that was raised (migrations, flags, monitoring, rollback).",
  },
  demo: {
    headings: ["Обсуждения", "Принято", "Отклонения от требований", "Не проверено", "Открытые вопросы"],
    guidance: "'Принято' lists what was shown and matches the requirements. 'Отклонения от требований' states each deviation with the requirement it violates. 'Не проверено' lists states and cases that were not demonstrated (empty, error, permissions, boundaries).",
  },
  review: {
    headings: ["Обсуждения", "Замечания к документу", "Решения по открытым вопросам", "Поручения и сроки", "Новые вопросы и риски"],
    guidance: "'Замечания к документу': one line per remark as 'раздел - суть - кто сказал'. 'Решения по открытым вопросам': one line per question from the briefing or agenda that was actually discussed, as 'вопрос - принято / отклонено / нужна проверка - формулировка'; a question that nobody discussed is written as 'не обсуждали', never guessed from the briefing. 'Поручения и сроки' repeats the agreed follow-ups with owner and deadline as said. 'Новые вопросы и риски' holds only what was raised in the call and is absent from the briefing.",
  },
  interview: {
    headings: ["Вопросы интервьюера", "Мои ответы (кратко)", "Слабые места", "Что повторить", "Итог"],
    guidance: "List every question the interviewer asked, in order. Under 'Мои ответы (кратко)' give a one-line version of what the analyst actually answered, not the ideal answer. 'Слабые места' names answers that were incomplete, hesitant, or wrong, with the correct point in one line. 'Что повторить' is a short study list. 'Итог' is two sentences on how the interview went and the next step if it was mentioned.",
  },
};
