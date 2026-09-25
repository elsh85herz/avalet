import { generate } from "./providers/index.js";
import { getApiKey, getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { readMeeting, setSummary, transcriptToText } from "./meetings-store.js";
import { VisibleTextStream, splitSummary, type MeetingAnalysis } from "./summary-format.js";
import { buildSummaryPrompt } from "./summary-prompt.js";
import { MODE_SUMMARY } from "./modes.js";

// A one-hour meeting is roughly 60k characters of Russian transcript; keep a
// hard cap so a marathon call can't blow the provider's context window.
const TRANSCRIPT_CHAR_CAP = 120_000;

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
