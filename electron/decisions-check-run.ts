import { meteredGenerate } from "./metering/metered.js";
import { getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { resolveCredentials } from "./provider-credentials.js";
import { readMeeting, updateMeeting } from "./meetings-store.js";
import { visibleSegments } from "./transcript-clean.js";
import {
  CHECK_REPLY_CHARS_PER_DECISION,
  CHECK_SYSTEM_PROMPT,
  applyCheck,
  buildCheckItems,
  buildCheckUserContent,
  checkableDecisions,
  parseCheckReply,
} from "./shared/decision-check.js";
import { estimateTokens } from "./shared/artifact.js";
import type { Meeting } from "./shared/ipc-contract.js";

/** The model answered, but not with verdicts we can read. */
export class CheckReplyError extends Error {
  constructor() {
    super("the model did not return verdicts");
    this.name = "CheckReplyError";
  }
}

/**
 * "Check against the quotes" (CLOUD_TASK_6 phase 2, on request only): one
 * small call over the accepted decisions. Counted as part of the summary.
 * Returns null when there is nothing to check.
 */
export async function checkDecisions(meetingId: string, signal: AbortSignal): Promise<{ meeting: Meeting; checked: number } | null> {
  const meeting = readMeeting(meetingId);
  if (!meeting) throw new Error("meeting not found");
  const rows = checkableDecisions(meeting.decisions);
  if (rows.length === 0) return null;
  const items = buildCheckItems(rows, visibleSegments(meeting.transcript), meeting.startedAt);
  const sentIds = new Map(items.map((item, i) => [item.id, rows[i]!.id]));
  const providerId = getSelectedProviderId();
  const settings = getProviderSettings(providerId);
  const { apiKey, baseUrl } = resolveCredentials(providerId);
  const result = await meteredGenerate("summary", {
    providerId,
    apiKey,
    baseUrl,
    model: settings.model,
    systemPrompt: CHECK_SYSTEM_PROMPT,
    transcript: buildCheckUserContent(items),
    maxTokens: Math.min(4_000, Math.max(800, estimateTokens(items.length * CHECK_REPLY_CHARS_PER_DECISION) * 2)),
    signal,
    onDelta: () => {},
  });
  const parsed = parseCheckReply(result.text);
  if (!parsed) throw new CheckReplyError();
  const at = Date.now();
  const updated = updateMeeting(meetingId, (m) => {
    m.decisions = applyCheck(m.decisions ?? [], sentIds, parsed, at);
  });
  if (!updated) throw new Error("meeting not found");
  return { meeting: updated, checked: rows.length };
}
