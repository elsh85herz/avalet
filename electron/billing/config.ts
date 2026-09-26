// Billing configuration. The client is open source and cannot enforce a
// paywall by itself: the server meters and refuses. This file only says where
// the server is and which key signs its entitlement tokens.

/**
 * PLACEHOLDER. The matching private key was never stored anywhere, so no
 * token can be signed for it: the built-in provider stays unusable until the
 * server's real public key replaces this one (docs/dev/billing-api.md).
 */
export const PRODUCTION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAyk84FmHjI22+Vpp66beLR3m947RNoXxvacxxrw2QMFE=
-----END PUBLIC KEY-----
`;

/** Placeholder host (".invalid" never resolves). Override with AVALET_BILLING_URL. */
export const DEFAULT_BILLING_URL = "https://billing.avalet.invalid";

/** Shown until the server's /v1/plans answers. */
export const DEFAULT_PRICING = { amount: 990, currency: "RUB", period: "month" as const };
export const TRIAL_BUDGET = 500_000;
export const PRO_BUDGET = 5_000_000;

/** A token older than this without a successful refresh stops working (offline grace). */
export const OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000;

export type BillingConfig = {
  baseUrl: string;
  publicKeys: string[];
  /** "http": the real server contract; "mock": in-process MockBillingProvider (dev only). */
  mode: "http" | "mock";
};

/**
 * AVALET_BILLING_URL points the client at another server (a staging server,
 * server-mock). AVALET_BILLING_DEV_PUBKEY adds a trusted key for such a server
 * (server-mock prints its ephemeral one). AVALET_BILLING=mock uses the
 * in-process mock. None of these are set in a normal launch.
 */
export function billingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  const publicKeys = [PRODUCTION_PUBLIC_KEY];
  if (env.AVALET_BILLING_DEV_PUBKEY) publicKeys.push(env.AVALET_BILLING_DEV_PUBKEY.replace(/\\n/g, "\n"));
  return {
    baseUrl: (env.AVALET_BILLING_URL || DEFAULT_BILLING_URL).replace(/\/+$/, ""),
    publicKeys,
    mode: env.AVALET_BILLING === "mock" ? "mock" : "http",
  };
}
