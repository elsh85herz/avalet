import { generate } from "./providers/index.js";
import { getApiKey, getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { readMeeting, setSummary, transcriptToText } from "./meetings-store.js";
import { ANALYSIS_MARKER, VisibleTextStream, splitSummary, type MeetingAnalysis } from "./summary-format.js";
import { MODE_SUMMARY } from "./modes.js";

// A one-hour meeting is roughly 60k characters of Russian transcript; keep a
// hard cap so a marathon call can't blow the provider's context window.
const TRANSCRIPT_CHAR_CAP = 120_000;

function buildSummaryPrompt(
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
      "'actions' lists concrete tasks that were assigned or agreed in the call: task is a short imperative phrase; owner is the person or role as named in the call, or an empty string; due is the deadline as said, or an empty string. Do not invent tasks nobody agreed to.",
      agendaBlock,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (context.trim()) parts.push(`Briefing the analyst prepared before this call:\n${context.trim()}`);
  return parts.join("\n\n");
}

export type SummaryEvents = {
  onDelta: (delta: string) => void;
};

export type SummaryResult = { text: string; analysis: MeetingAnalysis | null };

export async function summarizeMeeting(
  meetingId: string,
  signal: AbortSignal,
  events: SummaryEvents,
): Promise<SummaryResult> {
  const meeting = readMeeting(meetingId);
  if (!meeting) throw new Error("meeting not found");
  if (meeting.transcript.length === 0) throw new Error("transcript is empty");

  const providerId = getSelectedProviderId();
  const settings = getProviderSettings(providerId);
  const apiKey = getApiKey(providerId);

  let transcript = transcriptToText(meeting, { me: "[Я]", other: "[Собеседник]" });
  if (transcript.length > TRANSCRIPT_CHAR_CAP) transcript = transcript.slice(-TRANSCRIPT_CHAR_CAP);

  const spec = MODE_SUMMARY[meeting.mode];
  const agenda = meeting.agenda ?? [];
  const stream = new VisibleTextStream();
  let collected = "";
  await generate({
    providerId,
    apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: buildSummaryPrompt(spec.headings, spec.guidance, meeting.context, agenda, meeting.mode === "interview"),
    transcript,
    maxTokens: 6000,
    signal,
    onDelta: (delta) => {
      collected += delta;
      const visible = stream.push(delta);
      if (visible) events.onDelta(visible);
    },
  });
  const { protocol, analysis } = splitSummary(collected, agenda);
  setSummary(meetingId, protocol, analysis);
  return { text: protocol, analysis };
}
