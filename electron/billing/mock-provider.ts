import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { OFFLINE_GRACE_MS, PRO_BUDGET, TRIAL_BUDGET, DEFAULT_PRICING } from "./config.js";
import { BillingError, type BillingProvider, type CancelInfo, type Plan, type PlansInfo } from "./provider.js";
import { encodeToken, generateSigningKeys, type EntitlementPayload } from "./token.js";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * In-process stand-in for the billing server, for development and tests: it
 * signs real tokens with a key pair made at construction (never stored), so
 * the client verifies them exactly like server tokens. Test hooks simulate
 * usage, payments, cancellation, the end of a period and an outage.
 */
export class MockBillingProvider implements BillingProvider {
  readonly mockPublicKeyPem: string;
  private readonly privateKey: KeyObject;
  private plan: "trial" | "pro" | "none" | null = null;
  private used = 0;
  private budget = TRIAL_BUDGET;
  private periodStart = 0;
  private periodEnd: number | null = null;
  private renews = false;
  private pendingCheckout: string | null = null;
  offline = false;

  constructor(
    private readonly installId: () => string,
    private readonly now: () => number = Date.now,
    private readonly options: { autoPay?: "succeed" | "fail" | null } = {},
  ) {
    const keys = generateSigningKeys();
    this.mockPublicKeyPem = keys.publicKeyPem;
    this.privateKey = keys.privateKey;
  }

  private ensureOnline(): void {
    if (this.offline) throw new BillingError("billing server unreachable: mock offline", "network", 0);
  }

  private token(): string {
    if (this.plan === null) throw new BillingError("install not registered", "unknown_install", 404);
    const iat = this.now();
    const payload: EntitlementPayload = {
      v: 1,
      iid: this.installId(),
      plan: this.plan,
      budget: this.budget,
      used: this.used,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      renews: this.renews,
      iat,
      exp: iat + OFFLINE_GRACE_MS,
    };
    return encodeToken(payload, this.privateKey);
  }

  private rollPeriod(): void {
    if (this.plan === "pro" && this.periodEnd !== null && this.now() >= this.periodEnd) {
      if (this.renews) {
        this.periodStart = this.periodEnd;
        this.periodEnd = this.periodStart + PERIOD_MS;
        this.used = 0;
      } else {
        this.plan = "none";
        this.budget = 0;
        this.used = 0;
      }
    }
  }

  async getEntitlement(): Promise<string> {
    this.ensureOnline();
    if (this.plan === null) {
      this.plan = "trial";
      this.budget = TRIAL_BUDGET;
      this.periodStart = this.now();
    }
    return this.refresh();
  }

  async refresh(): Promise<string> {
    this.ensureOnline();
    this.rollPeriod();
    return this.token();
  }

  async startCheckout(plan: Plan): Promise<string> {
    this.ensureOnline();
    if (plan !== "pro") throw new BillingError("unknown plan", "unknown_plan", 400);
    this.pendingCheckout = randomUUID();
    const url = `https://billing.avalet.invalid/mock/checkout/${this.pendingCheckout}`;
    if (this.options.autoPay) setTimeout(() => this.completeCheckout(this.options.autoPay!), 1_500);
    return url;
  }

  async cancelInfo(): Promise<CancelInfo> {
    this.ensureOnline();
    return {
      active: this.plan === "pro",
      renews: this.plan === "pro" && this.renews,
      periodEnd: this.plan === "pro" ? this.periodEnd : null,
      manageUrl: this.plan === "pro" ? "https://billing.avalet.invalid/mock/manage" : null,
    };
  }

  async plans(): Promise<PlansInfo> {
    this.ensureOnline();
    return { plans: [{ id: "pro", ...DEFAULT_PRICING, budget: PRO_BUDGET }], trialBudget: TRIAL_BUDGET };
  }

  // --- test hooks (what the gateway webhook and the LLM proxy do on a real server) ---

  completeCheckout(result: "succeed" | "fail" | "cancel"): void {
    if (!this.pendingCheckout) return;
    this.pendingCheckout = null;
    if (result !== "succeed") return;
    this.plan = "pro";
    this.budget = PRO_BUDGET;
    this.used = 0;
    this.periodStart = this.now();
    this.periodEnd = this.periodStart + PERIOD_MS;
    this.renews = true;
  }

  useTokens(weighted: number): void {
    this.used += weighted;
  }

  cancelSubscription(): void {
    this.renews = false;
  }
}
