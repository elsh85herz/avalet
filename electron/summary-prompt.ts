import { ANALYSIS_MARKER } from "./summary-format.js";

export function buildSummaryPrompt(
  headings: string[],
  guidance: string,
  context: string,
  agenda: string[],
  interview: boolean,
): string {
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
      '{"agenda":[{"index":1,"closed":true,"note":"..."}],"actions":[{"task":"...","owner":"...","due":"..."}]}',
      agendaBlock
        ? "'agenda' has one entry per agenda question above: closed=true only if the transcript contains a clear answer or decision for it, otherwise false; note is the answer in at most 12 words when closed, or what is still missing when open."
        : "'agenda' is an empty array.",
      "'actions' lists concrete tasks that were assigned or agreed in the call: task is a short imperative phrase; owner is the person or role that was named for it in the call (the analyst is 'Я'), or 'не назван' if nobody was named; due is the deadline as said, or 'срок не назван' if none was said. Never fill owner or due from the briefing. Do not invent tasks nobody agreed to; a task somebody only proposed and nobody accepted is not a task.",
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
  return parts.join("\n\n");
}
