import { meteredGenerate } from "./metering/metered.js";
import { getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { resolveCredentials } from "./provider-credentials.js";
import { readMeeting, setSummary, transcriptToText } from "./meetings-store.js";
import { VisibleTextStream, splitSummary, type MeetingAnalysis } from "./summary-format.js";
import { buildSummaryPrompt } from "./summary-prompt.js";
import { MODE_SUMMARY } from "./modes.js";
import { mergeSummaryAnalysis } from "./live-tracker-logic.js";
import { randomUUID } from "node:crypto";
import { groundDecisions, mergeDecisions } from "./decisions.js";
import type { Decision } from "./shared/ipc-contract.js";

// A one-hour meeting is roughly 60k characters of Russian transcript; keep a
// hard cap so a marathon call can't blow the provider's context window.
const TRANSCRIPT_CHAR_CAP = 120_000;

export type SummaryEvents = {
  onDelta: (delta: string) => void;
};

export type SummaryResult = { text: string; analysis: MeetingAnalysis | null; decisions: Decision[] | null };

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
  const { apiKey, baseUrl } = resolveCredentials(providerId);

  let transcript = transcriptToText(meeting, { me: "[Я]", other: "[Собеседник]" });
  if (transcript.length > TRANSCRIPT_CHAR_CAP) transcript = transcript.slice(-TRANSCRIPT_CHAR_CAP);

  const spec = MODE_SUMMARY[meeting.mode];
  const agenda = meeting.agenda ?? [];
  const stream = new VisibleTextStream();
  let collected = "";
  await meteredGenerate("summary", {
    providerId,
    apiKey,
    baseUrl,
    model: settings.model,
    systemPrompt: buildSummaryPrompt(spec.headings, spec.guidance, meeting.context, agenda, meeting.mode === "interview", {
      // Structured decisions only when there is a document to update: the
      // End screen warned about exactly this extra cost (CLOUD_TASK_5).
      review: meeting.mode === "review" && Boolean(meeting.artifact?.text),
      artifact: meeting.artifact?.text,
    }),
    transcript,
    // The decisions list makes the answer longer; a cut-off JSON tail would lose agenda and actions too.
    maxTokens: meeting.mode === "review" && meeting.artifact?.text ? 9000 : 6000,
    signal,
    onDelta: (delta) => {
      collected += delta;
      const visible = stream.push(delta);
      if (visible) events.onDelta(visible);
    },
  });
  const split = splitSummary(collected, agenda);
  // The live checklist may already hold hand-set marks and confirmed action
  // points: the summary reads the whole call but must not overwrite them.
  const analysis = split.analysis ? mergeSummaryAnalysis(meeting, split.analysis, randomUUID) : null;
  // Review: decisions checked against the transcript and the document; hand edits survive.
  const decisions =
    meeting.mode === "review" && split.analysis?.decisions
      ? mergeDecisions(meeting.decisions, groundDecisions(split.analysis.decisions, meeting, randomUUID))
      : null;
  setSummary(meetingId, split.protocol, analysis, decisions);
  return { text: split.protocol, analysis, decisions };
}
