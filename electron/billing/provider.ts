// The payment side, independent of any payment gateway. The client never sees
// card data: checkout happens in the browser on the server's page, and the
// client only learns the outcome from a refreshed entitlement token.

export type Plan = "pro";

export type PlanOffer = {
  id: Plan;
  /** Price in major units, e.g. 990 (RUB). */
  amount: number;
  currency: string;
  period: "month";
  /** Weighted tokens per period. */
  budget: number;
};

export type PlansInfo = { plans: PlanOffer[]; trialBudget: number };

export type CancelInfo = {
  /** A paid plan is active. */
  active: boolean;
  /** It renews at periodEnd unless cancelled. */
  renews: boolean;
  periodEnd: number | null;
  /** Page (on the server or the gateway) where the user cancels or changes the plan. */
  manageUrl: string | null;
};

/** Machine-readable failure from the billing server (see billing-api.md, "Errors"). */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export interface BillingProvider {
  /** Registers this install if needed and returns its current entitlement token (a trial for a new install). */
  getEntitlement(): Promise<string>;
  /** Starts a purchase; returns the URL to open in the system browser. */
  startCheckout(plan: Plan): Promise<string>;
  /** Asks the server again (after a checkout, periodically, on demand). */
  refresh(): Promise<string>;
  cancelInfo(): Promise<CancelInfo>;
  plans(): Promise<PlansInfo>;
  /**
   * Only the in-process mock sets this: the key it signs with, made at
   * startup. The HTTP provider never does; its tokens must verify against the
   * embedded key (config.ts).
   */
  readonly mockPublicKeyPem?: string;
}

/** Identity of this install towards the billing server; the secret is stored encrypted. */
export type InstallIdentity = { installId: string; installSecret: string };
