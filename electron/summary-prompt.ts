import { ANALYSIS_MARKER } from "./summary-format.js";
import { SECTION_UNKNOWN, parseSections, sectionLabel } from "./shared/artifact.js";

/**
 * Review mode (CLOUD_TASK_5): the summary also returns structured decisions,
 * the guide for updating the document. `artifact` is the document under
 * review, sent as reference for section names and "before" wording only.
 */
export type ReviewSummaryOptions = { review?: boolean; artifact?: string };

// Decisions are held to the same ground rule as the rest of the protocol:
// only what was said, "accepted" only with an explicit agreement.
const DECISIONS_RULES = [
  "'decisions' lists every decision, proposal and question about the document that came up in the call, in the order they came up.",
  "text: one line phrased as an edit to the document ('В разделе 3.1 поднять размер страницы до 100 записей').",
  "status: 'accepted' only if the transcript contains an explicit agreement to it by the other side or the analyst (for example 'согласен', 'да, так и делаем', 'принимаем'); 'rejected' only if it was explicitly declined; 'open' for a question left without an answer; everything else is 'proposed'. A proposal nobody explicitly accepted is never 'accepted', and silence is not agreement.",
  "by: who proposed it and who agreed, as said in the call ('Собеседник предложил, Я согласился'); never taken from the briefing or the document.",
  `section: the section number and heading from the document index below when the call named or clearly meant that section, otherwise '${SECTION_UNKNOWN}'. Never invent a section.`,
  "before: the old wording, only if it was said in the call or copied word for word from the document; otherwise ''.",
  "after: the new wording, only as it was said in the call; otherwise ''. Never compose it yourself.",
  "quote: a short exact fragment of the transcript line that shows the decision or the agreement, copied character for character, not paraphrased; at: its timestamp from the transcript as mm:ss.",
  "id: 'd1', 'd2', ... in order.",
  "Every decision with status 'accepted' must also appear as a line under 'Решения по открытым вопросам' in the text above, and nothing under that heading may claim acceptance that is not 'accepted' here.",
].join(" ");

export function buildSummaryPrompt(
  headings: string[],
  guidance: string,
  context: string,
  agenda: string[],
  interview: boolean,
  options: ReviewSummaryOptions = {},
): string {
  const review = Boolean(options.review) && !interview;
  const artifact = review ? (options.artifact ?? "").trim() : "";
  const parts = [
    "You are a systems analyst writing the outcome of a meeting from its transcript.",
    "Transcript lines are tagged '[Я]:' (the analyst) and '[Собеседник]:' (everyone else). Timestamps are relative to the start of the meeting.",
    "Always answer in Russian, as plain text with these exact section headings, each on its own line, in this order:",
    headings.join("\n"),
    "Under each heading, short bullet lines starting with '- '. " + guidance,
  ];
  if (!interview) {
    parts.push(
      agenda.length > 0
        ? "Under 'Обсуждения' write one block per agenda question, in agenda order, then extra blocks for substantial topics that were raised outside the agenda. Each block starts with a line 'Тема: <the question or topic>' followed by bullets: what was answered or decided (who said it, with numbers and names as spoken), and what is still unclear. If a question was not discussed at all, write '- не обсуждали'."
        : "Under 'Обсуждения' write one block per substantial topic, in the order discussed. Each block starts with a line 'Тема: <topic phrased as a question>' followed by bullets: what was answered or decided (who said it, with numbers and names as spoken), and what is still unclear.",
    );
  }
  parts.push(
    "Ground rule: every bullet must rest on a line of the transcript. Never write a decision, requirement, agreement or owner that nobody said in the call. Attribute to a person only what that person said; write 'согласился' only if the transcript has an explicit agreement, otherwise 'не возражал' or 'не прозвучало'. If a claim about a system, integration or process is stated as fact but nothing confirms it, mark it 'не подтверждено, уточнить у <кого>'.",
    "Only include what was actually said or clearly implied; if a section has nothing, write '- нет'. Keep identifiers, table/field/endpoint names in English exactly as spoken. No preamble, no closing remarks, no markdown symbols other than the '- ' bullets.",
  );
  const agendaBlock = agenda.length > 0 && !interview ? `Agenda questions (numbered):\n${agenda.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : "";
  parts.push(
    [
      `After the text, on a new line write exactly ${ANALYSIS_MARKER} and then one JSON object, nothing after it:`,
      review
        ? '{"agenda":[{"index":1,"closed":true,"note":"..."}],"actions":[{"task":"...","owner":"...","due":"..."}],"decisions":[{"id":"d1","text":"...","status":"accepted","by":"...","section":"...","before":"...","after":"...","quote":"...","at":"mm:ss"}]}'
        : '{"agenda":[{"index":1,"closed":true,"note":"..."}],"actions":[{"task":"...","owner":"...","due":"..."}]}',
      agendaBlock
        ? "'agenda' has one entry per agenda question above: closed=true only if the transcript contains a clear answer or decision for it, otherwise false; note is the answer in at most 12 words when closed, or what is still missing when open."
        : "'agenda' is an empty array.",
      "'actions' lists concrete tasks that were assigned or agreed in the call: task is a short imperative phrase; owner is the person or role that was named for it in the call (the analyst is 'Я'), or 'не назван' if nobody was named; due is the deadline as said, or 'срок не назван' if none was said. Never fill owner or due from the briefing. Do not invent tasks nobody agreed to; a task somebody only proposed and nobody accepted is not a task.",
      review ? DECISIONS_RULES : "",
      agendaBlock,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (context.trim())
    parts.push(
      [
        "Briefing the analyst prepared before this call. It is REFERENCE ONLY: it helps you spell terms and names and recognise which topic is being discussed. It is not part of the meeting. Do not turn any statement, position, requirement or decision from the briefing into a point of the protocol unless the transcript contains it. A briefing topic nobody discussed is 'не обсуждали'.",
        "<briefing>",
        context.trim(),
        "</briefing>",
      ].join("\n"),
    );
  if (artifact) {
    const sections = parseSections(artifact).filter((section) => section.number);
    parts.push(
      [
        "The document under review, as the analyst loaded it before the call. It is REFERENCE ONLY: use it for section numbers and headings and to copy the old wording into 'before'. Nothing in it is a decision, a proposal or an agreement; decisions come only from the transcript.",
        sections.length > 0 ? `Document index (use these for 'section'):\n${sections.map(sectionLabel).join("\n")}` : "The document has no numbered sections.",
        "<document>",
        artifact,
        "</document>",
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}
