import { randomUUID } from "node:crypto";
import { meteredGenerate } from "./metering/metered.js";
import { getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { resolveCredentials } from "./provider-credentials.js";
import { readMeeting, updateMeeting } from "./meetings-store.js";
import { applyPatches, checkPatches, parsePatchReply } from "./artifact-patch.js";
import { PATCH_SYSTEM_PROMPT, buildPatchUserContent } from "./artifact-prompt.js";
import { estimateTokens, expectedReplyChars, patchDecisions } from "./shared/artifact.js";
import type { Meeting, PatchProposal } from "./shared/ipc-contract.js";

/** The model answered, but not with patches we can read. */
export class PatchReplyError extends Error {
  constructor() {
    super("the model did not return patches");
    this.name = "PatchReplyError";
  }
}

/**
 * "Update the document": one call with the whole document and the checked
 * decisions; the answer is a list of patches, checked here against the
 * original and stored on the meeting as a proposal. Nothing is applied.
 */
export async function proposePatches(meetingId: string, signal: AbortSignal): Promise<PatchProposal> {
  const meeting = readMeeting(meetingId);
  if (!meeting) throw new Error("meeting not found");
  const doc = meeting.artifact?.text ?? "";
  if (!doc) throw new Error("the meeting has no document");
  const chosen = (meeting.decisions ?? []).filter((d) => d.include && !d.removed && d.text.trim());
  if (chosen.length === 0) throw new Error("no decision is checked");

  const sent = patchDecisions(chosen);
  const realId = new Map(sent.map((d, i) => [d.id, chosen[i]!.id]));
  const providerId = getSelectedProviderId();
  const settings = getProviderSettings(providerId);
  const { apiKey, baseUrl } = resolveCredentials(providerId);
  const reply = estimateTokens(expectedReplyChars(chosen));
  const result = await meteredGenerate("artifact", {
    providerId,
    apiKey,
    baseUrl,
    model: settings.model,
    systemPrompt: PATCH_SYSTEM_PROMPT,
    transcript: buildPatchUserContent(doc, sent),
    maxTokens: Math.min(16_000, Math.max(2_000, reply * 3)),
    signal,
    onDelta: () => {},
  });
  const parsed = parsePatchReply(result.text, randomUUID);
  if (!parsed) throw new PatchReplyError();
  // Back to the meeting's own decision ids; a patch for an id that was not sent stays unknown.
  const patches = parsed.patches.map((p) => ({ ...p, decisionId: realId.get(p.decisionId) ?? p.decisionId }));
  const proposal: PatchProposal = {
    at: Date.now(),
    patches: checkPatches(doc, patches, new Set(chosen.map((d) => d.id))),
    skipped: parsed.skipped.map((s) => ({ decisionId: realId.get(s.decisionId) ?? s.decisionId, reason: s.reason })),
    decisionIds: chosen.map((d) => d.id),
  };
  updateMeeting(meetingId, (m) => {
    m.artifactProposal = proposal;
  });
  return proposal;
}

/**
 * The original document with the chosen patches of the stored proposal. An
 * empty choice means "back to the original": the result is dropped.
 */
export function applyChosenPatches(meetingId: string, chosenIds: string[]): Meeting | null {
  const meeting = readMeeting(meetingId);
  if (!meeting) return null;
  const doc = meeting.artifact?.text ?? "";
  const proposal = meeting.artifactProposal;
  if (!doc || !proposal) throw new Error("there are no changes to apply");
  return updateMeeting(meetingId, (m) => {
    if (chosenIds.length === 0) {
      delete m.artifactResult;
      return;
    }
    const known = proposal.patches.filter((p) => p.ok && chosenIds.includes(p.id));
    const result = applyPatches(doc, known);
    m.artifactResult = { text: result.text, patchIds: result.applied, at: Date.now() };
  });
}
