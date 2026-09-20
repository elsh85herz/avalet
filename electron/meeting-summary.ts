import { generate } from "./providers/index.js";
import { getApiKey, getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { readMeeting, setSummary, transcriptToText } from "./meetings-store.js";
import { MODE_INSTRUCTIONS } from "./modes.js";

// A one-hour meeting is roughly 60k characters of Russian transcript; keep a
// hard cap so a marathon call can't blow the provider's context window.
const TRANSCRIPT_CHAR_CAP = 120_000;

const SUMMARY_SYSTEM_PROMPT = [
  "You are a systems analyst writing the outcome of a meeting from its transcript.",
  "Transcript lines are tagged '[Я]:' (the analyst) and '[Собеседник]:' (everyone else).",
  "Always answer in Russian, as plain text with these exact section headings, each on its own line:",
  "Решения",
  "Открытые вопросы",
  "Требования",
  "Риски",
  "Задачи",
  "Under each heading, short bullet lines starting with '- '. Requirements are phrased as testable statements. Tasks name what has to be done and, when said in the meeting, who does it and by when. Open questions are phrased so they can be sent as-is to the person who has to answer.",
  "Only include what was actually said or clearly implied; if a section has nothing, write '- нет'. Keep identifiers, table/field/endpoint names in English exactly as spoken. No preamble, no closing remarks.",
].join(" ");

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

  const modeNote = MODE_INSTRUCTIONS[meeting.mode];
  const parts = [SUMMARY_SYSTEM_PROMPT];
  if (modeNote) parts.push(modeNote);
  if (meeting.context.trim()) {
    parts.push(`Briefing the analyst prepared before this call:\n${meeting.context.trim()}`);
  }

  let collected = "";
  await generate({
    providerId,
    apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: parts.join("\n\n"),
    transcript,
    signal,
    onDelta: (delta) => {
      collected += delta;
      events.onDelta(delta);
    },
  });
  setSummary(meetingId, collected);
  return collected;
}
