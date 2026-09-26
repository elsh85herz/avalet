import { generate } from "../providers/index.js";
import { estimateUsage } from "../providers/usage.js";
import type { GenerateRequest, GenerateResult } from "../providers/types.js";
import type { UsagePurpose } from "../shared/ipc-contract.js";
import type { LedgerEntry, UsageLedger } from "./ledger.js";

export type MeteringContext = {
  ledger: UsageLedger;
  /** Which budget a provider draws from: the user's key, or the Avalet trial/pro budget. */
  tierOf: (providerId: string) => { tier: "own" | "avalet"; trial: boolean };
  currentMeetingId: () => string | null;
  now?: () => number;
};

let context: MeteringContext | null = null;

/** Set once at startup (main.ts, integration tests). Without it calls still work, unrecorded. */
export function configureMetering(next: MeteringContext | null): void {
  context = next;
}

/**
 * Every model call goes through here, so every call is recorded with its
 * purpose and real token counts. A stream stopped halfway (Stop, a newer
 * question) still cost tokens: it is recorded with an estimate, marked so.
 */
export async function meteredGenerate(
  purpose: UsagePurpose,
  request: GenerateRequest,
  call: (request: GenerateRequest) => Promise<GenerateResult> = generate,
): Promise<GenerateResult> {
  let produced = "";
  const wrapped: GenerateRequest = {
    ...request,
    onDelta: (delta) => {
      produced += delta;
      request.onDelta(delta);
    },
  };
  try {
    const result = await call(wrapped);
    record(purpose, request, result.usage);
    return result;
  } catch (error) {
    if ((error as Error)?.name === "AbortError" && produced) record(purpose, request, estimateUsage(request, produced));
    throw error;
  }
}

function record(purpose: UsagePurpose, request: GenerateRequest, usage: GenerateResult["usage"]): void {
  if (!context) return;
  const { tier, trial } = context.tierOf(request.providerId);
  const entry: LedgerEntry = {
    at: (context.now ?? Date.now)(),
    providerId: request.providerId,
    model: request.model,
    purpose,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimated: usage.estimated,
    tier,
    trial,
    meetingId: context.currentMeetingId(),
  };
  context.ledger.record(entry);
}
