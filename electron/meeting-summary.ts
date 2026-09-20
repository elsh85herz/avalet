import { generate } from "./providers/index.js";
import { getApiKey, getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { readMeeting, setSummary, transcriptToText } from "./meetings-store.js";
import { MODE_SUMMARY } from "./modes.js";

// A one-hour meeting is roughly 60k characters of Russian transcript; keep a
// hard cap so a marathon call can't blow the provider's context window.
const TRANSCRIPT_CHAR_CAP = 120_000;

function buildSummaryPrompt(headings: string[], guidance: string, context: string): string {
  const parts = [
    "You are a systems analyst writing the outcome of a meeting from its transcript.",
    "Transcript lines are tagged '[Я]:' (the analyst) and '[Собеседник]:' (everyone else). Timestamps are relative to the start of the meeting.",
    "Always answer in Russian, as plain text with these exact section headings, each on its own line, in this order:",
    headings.join("\n"),
    "Under each heading, short bullet lines starting with '- '. " + guidance,
    "Only include what was actually said or clearly implied; if a section has nothing, write '- нет'. Keep identifiers, table/field/endpoint names in English exactly as spoken. No preamble, no closing remarks, no markdown symbols other than the '- ' bullets.",
  ];
  if (context.trim()) parts.push(`Briefing the analyst prepared before this call:\n${context.trim()}`);
  return parts.join("\n\n");
}

export type SummaryEvents = {
  onDelta: (delta: string) => void;
};

export async function summarizeMeeting(
  meetingId: string,
  signal: AbortSignal,
  events: SummaryEvents,
): Promise<string> {
  const meeting = readMeeting(meetingId);
  if (!meeting) throw new Error("meeting not found");
  if (meeting.transcript.length === 0) throw new Error("transcript is empty");

  const providerId = getSelectedProviderId();
  const settings = getProviderSettings(providerId);
  const apiKey = getApiKey(providerId);

  let transcript = transcriptToText(meeting, { me: "[Я]", other: "[Собеседник]" });
  if (transcript.length > TRANSCRIPT_CHAR_CAP) transcript = transcript.slice(-TRANSCRIPT_CHAR_CAP);

  const spec = MODE_SUMMARY[meeting.mode];
  let collected = "";
  await generate({
    providerId,
    apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: buildSummaryPrompt(spec.headings, spec.guidance, meeting.context),
    transcript,
    maxTokens: 4096,
    signal,
    onDelta: (delta) => {
      collected += delta;
      events.onDelta(delta);
    },
  });
  setSummary(meetingId, collected);
  return collected;
}
