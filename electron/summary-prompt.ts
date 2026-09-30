import { ANALYSIS_MARKER } from "./summary-format.js";
import { SECTION_UNKNOWN, parseSections, sectionLabel } from "./shared/artifact.js";
import type { MeetingMode } from "./shared/ipc-contract.js";

/**
 * `mode`: the meeting mode; review meetings get the fidelity rules below
 * (CLOUD_TASK_6) with or without a document.
 * `review` (CLOUD_TASK_5): the summary also returns structured decisions,
 * the guide for updating the document. `artifact` is the document under
 * review, sent as reference for section names and "before" wording only.
 */
export type ReviewSummaryOptions = { mode?: MeetingMode; review?: boolean; artifact?: string };

// CLOUD_TASK_6, finding 1 and 3: a question asked and not answered is the
// most important thing to carry out of a review call, and it was the thing
// lost. It is a risk, never a neutral "discussed", and "- нет" is only
// allowed when nothing is left open.
export const UNANSWERED_REVIEW_RULES = [
  "Unanswered questions are the most important thing to carry out of this call.",
  "A question that was asked in the call and got no answer, got an evasive answer ('это мелочь', 'не будем сейчас'), or was deferred to someone else ('я спрошу у ...', 'уточню у ...') is NOT a neutral discussion topic: never soften it into 'обсудили' or 'обсуждали, сложнее или проще'.",
  "List every such question under 'Новые вопросы и риски', including a question asked only once and a question from the briefing, as one line: 'Вопрос без ответа: <the question in plain words> - задал <who asked> - <передан <кому>, as said | без ответа>', then '(задан N раз)' when it was asked more than once, then its shortest exact quote and time as «...» (мм:сс).",
  "A question asked several times is one line with the count, not several lines: the repetition is the signal.",
  "In its 'Тема:' block under 'Обсуждения' such a question gets the bullet '- без ответа' (or '- передан <кому>'), and under 'Решения по открытым вопросам' it is 'без ответа' or 'нужна проверка', never 'принято'.",
  "Write '- нет' under 'Новые вопросы и риски' only when no question was left without an answer and nothing else belongs there; while any question is open, '- нет' is wrong.",
].join(" ");

// CLOUD_TASK_6, finding 2: a decision that shapes data is written with its
// terms pinned, in the speakers' words, or says which term is unclear. The
// model never picks a reading on its own.
export const TERMS_REVIEW_RULES = [
  "A decision that defines or changes a data or interface structure (a list, array, map, key, field, table, column, message or file format) is only usable when its subject terms are pinned.",
  "Its bullet must say them in plain words, in the speakers' own words: what the key is (a field name, a field value, an id), what the value is, one entry per what, the unit; and if the speakers gave an example in the call, repeat that example briefly.",
  "If the call did not make a term clear, or the wording and an example given in the call point to different readings, the bullet says 'не уточнено: <which term>, <reading one> или <reading two>' and the same question is also listed as a 'Вопрос без ответа'.",
  "Never choose an interpretation yourself and never fill a term from the briefing or the document: 'не уточнено' is a correct, wanted answer.",
].join(" ");

/** The same rule in one sentence for the other modes' "Открытые вопросы" heading. */
export const UNANSWERED_OPEN_QUESTIONS_RULE =
  "Under 'Открытые вопросы' also list every question asked in the call that got no answer, an evasive one, or was deferred to someone else ('я спрошу у ...'), once each as 'вопрос - кто задал - передан <кому> или без ответа', with '(задан N раз)' when repeated; never soften such a question into 'обсудили', and write '- нет' there only when no such question remains.";

// Decisions are held to the same ground rule as the rest of the protocol:
// only what was said, "accepted" only with an explicit agreement.
const DECISIONS_RULES = [
  "'decisions' lists every decision, proposal and question about the document that came up in the call, in the order they came up.",
  "text: one line phrased as an edit to the document ('В разделе 3.1 поднять размер страницы до 100 записей').",
  "status: 'accepted' only if the transcript contains an explicit agreement to it by the other side or the analyst (for example 'согласен', 'да, так и делаем', 'принимаем'); 'rejected' only if it was explicitly declined; 'open' for a question left without an answer, answered evasively or deferred to someone else, and for anything the call did not close; everything else is 'proposed'. A proposal nobody explicitly accepted is never 'accepted', and silence is not agreement.",
  "Every question listed as 'Вопрос без ответа' in the text is also an entry here with status 'open', its text phrased as the question; asked: how many times it was asked in the call, when more than once (omit otherwise).",
  "by: who proposed it and who agreed, as said in the call ('Собеседник предложил, Я согласился'); never taken from the briefing or the document.",
  `section: the section number and heading from the document index below when the call named or clearly meant that section, otherwise '${SECTION_UNKNOWN}'. Never invent a section.`,
  "before: the old wording, only if it was said in the call or copied word for word from the document; otherwise ''.",
  "after: the new wording, only as it was said in the call; otherwise ''. Never compose it yourself.",
  "terms: for a decision that defines or changes a data or interface structure, its pinned subject terms in the speakers' own words ('ключ - название поля; значение - массив значений этого поля; одна запись на заказ; пример из разговора: ...'), or 'не уточнено: <which term>, <reading one> или <reading two>' when the call left it open; '' for a decision that shapes no structure. Never pick a reading.",
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
  const reviewMode = options.mode === "review" && !interview;
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
  if (reviewMode) parts.push(UNANSWERED_REVIEW_RULES, TERMS_REVIEW_RULES);
  else if (!interview && headings.includes("Открытые вопросы")) parts.push(UNANSWERED_OPEN_QUESTIONS_RULE);
  parts.push(
    "Ground rule: every bullet must rest on a line of the transcript. Never write a decision, requirement, agreement or owner that nobody said in the call. Attribute to a person only what that person said; write 'согласился' only if the transcript has an explicit agreement, otherwise 'не возражал' or 'не прозвучало'. If a claim about a system, integration or process is stated as fact but nothing confirms it, mark it 'не подтверждено, уточнить у <кого>'.",
    "Only include what was actually said or clearly implied; if a section has nothing, write '- нет'. Keep identifiers, table/field/endpoint names in English exactly as spoken. No preamble, no closing remarks, no markdown symbols other than the '- ' bullets.",
  );
  const agendaBlock = agenda.length > 0 && !interview ? `Agenda questions (numbered):\n${agenda.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : "";
  parts.push(
    [
      `After the text, on a new line write exactly ${ANALYSIS_MARKER} and then one JSON object, nothing after it:`,
      review
        ? '{"agenda":[{"index":1,"closed":true,"note":"..."}],"actions":[{"task":"...","owner":"...","due":"..."}],"decisions":[{"id":"d1","text":"...","status":"accepted","by":"...","section":"...","before":"...","after":"...","terms":"...","quote":"...","at":"mm:ss"}]}'
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
