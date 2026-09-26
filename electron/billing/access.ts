import type { AccessState } from "../shared/ipc-contract.js";
import { DEFAULT_PRICING, PRO_BUDGET, TRIAL_BUDGET } from "./config.js";
import type { EntitlementPayload } from "./token.js";

export const AVALET_PROVIDER_ID = "avalet";

export type AccessInput = {
  now: number;
  selectedProviderId: string;
  /** The selected own-key provider can make calls (key saved, or none needed). */
  ownKeyReady: boolean;
  /** Last token that verified and belongs to this install, or null. */
  token: EntitlementPayload | null;
  /** The last token the server sent was rejected (bad signature, other install). */
  tokenRejected: boolean;
  lastSyncAt: number | null;
  /** The last attempt to reach the server failed. */
  syncFailing: boolean;
  /** The proxy answered 402 since the token was issued. */
  exhaustedSignal: boolean;
  /** Weighted Avalet tokens this client used since the token was issued. */
  localUsedSinceIssue: number;
  price?: { amount: number; currency: string; period: "month" };
  checkoutPending?: boolean;
  syncError?: string | null;
  /** A billing server is configured in this build; default true. */
  builtInAvailable?: boolean;
  /** Own-key mode: result of the last check of the saved key (null when there is no key to check). */
  ownKeyCheck?: "unchecked" | "ok" | "failed" | null;
};

/**
 * The whole access state machine in one pure function: which tier the user is
 * on and whether the built-in provider may be used right now. The server is
 * the authority (it refuses proxy calls); this only decides what the app shows
 * and whether it bothers sending a call that would be refused.
 */
export function deriveAccess(input: AccessInput): AccessState {
  const token = input.token;
  const mode = input.selectedProviderId === AVALET_PROVIDER_ID ? "avalet" : "own";
  const budget = token?.budget ?? 0;
  const used = token ? token.used + input.localUsedSinceIssue : 0;
  const base: AccessState = {
    mode,
    tier: "own",
    status: "ok",
    canUseAvalet: false,
    activated: token !== null,
    plan: token?.plan ?? null,
    budget,
    used,
    remaining: Math.max(0, budget - used),
    periodEnd: token?.periodEnd ?? null,
    renews: token?.renews ?? false,
    lastSyncAt: input.lastSyncAt,
    graceEndsAt: token?.exp ?? null,
    price: input.price ?? DEFAULT_PRICING,
    proBudget: PRO_BUDGET,
    trialBudget: TRIAL_BUDGET,
    checkoutPending: Boolean(input.checkoutPending),
    syncError: input.syncFailing ? (input.syncError ?? "error") : null,
    builtInAvailable: input.builtInAvailable ?? true,
    keyCheck: null,
  };

  if (mode === "own") {
    return { ...base, status: input.ownKeyReady ? "ok" : "no-key", keyCheck: input.ownKeyReady ? (input.ownKeyCheck ?? null) : null };
  }

  if (!base.builtInAvailable) return { ...base, tier: "none", status: "not-activated" };
  if (!token) return { ...base, tier: "none", status: input.tokenRejected ? "invalid" : "not-activated" };
  const tier = token.plan;
  if (input.now >= token.exp) return { ...base, tier, status: "offline-expired" };
  if (token.plan === "none") return { ...base, tier, status: "expired" };
  if (token.plan === "pro" && token.periodEnd !== null && input.now >= token.periodEnd && !token.renews) {
    return { ...base, tier, status: "expired" };
  }
  if (input.exhaustedSignal || base.remaining <= 0) return { ...base, tier, status: "exhausted" };
  if (input.syncFailing) return { ...base, tier, status: "offline-grace", canUseAvalet: true };
  return { ...base, tier, status: "ok", canUseAvalet: true };
}
