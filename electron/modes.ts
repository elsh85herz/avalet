export type MeetingMode = "free" | "requirements" | "grooming" | "demo" | "interview";

export const MEETING_MODES: MeetingMode[] = ["free", "requirements", "grooming", "demo", "interview"];

export function isMeetingMode(value: unknown): value is MeetingMode {
  return typeof value === "string" && (MEETING_MODES as string[]).includes(value);
}

// Appended to the base system prompt for the selected mode. Kept in English
// like the rest of the prompt; the answer language is set separately.
export const MODE_INSTRUCTIONS: Record<MeetingMode, string> = {
  free: "",
  requirements:
    "Meeting mode: requirements elicitation. The analyst is gathering requirements from a stakeholder. Prioritize: who the actors are, the main and alternative scenarios, the data involved (entities, fields, sources), non-functional constraints (volumes, latency, security, audit), edge cases and error handling, and acceptance criteria. Whenever a statement is ambiguous or contradicts something said earlier or in the briefing, say so and suggest the exact question that resolves it.",
  grooming:
    "Meeting mode: backlog grooming and estimation. The team is discussing a task to estimate and split it. Prioritize: what is in and out of scope, hidden dependencies (other teams, systems, data migrations), what 'done' means, technical risks that change the estimate, and a sensible split into independently deliverable pieces. Flag scope creep and vague acceptance criteria as soon as they appear.",
  demo:
    "Meeting mode: demo and acceptance. Someone is showing implemented functionality. Compare what is shown and said with the requirements in the briefing and the transcript: list deviations, untested edge cases, missing states (empty, error, permissions), and what has to be true before sign-off. Suggest concrete checks the analyst should ask to see right now.",
  interview:
    "Meeting mode: technical interview or assessment. The analyst is being asked questions. Answer the question actually asked, directly and in a structured way: a one-line definition, a concrete example, the trade-offs or common pitfalls, then stop. If a task or case is shown on screen, solve it completely. Do not suggest questions to ask back unless the question itself is unclear.",
};
