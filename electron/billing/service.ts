import { randomBytes, randomUUID } from "node:crypto";
import { logLine } from "../log.js";
import type { KeyValueStore, SecretBox } from "../platform/kv.js";
import type { AccessState, CancelInfoPublic } from "../shared/ipc-contract.js";
import { deriveAccess, AVALET_PROVIDER_ID } from "./access.js";
import { BillingError, type BillingProvider, type InstallIdentity, type PlansInfo } from "./provider.js";
import { verifyToken, type EntitlementPayload } from "./token.js";

type Stored = {
  installId?: string;
  installSecretEnc?: string;
  token?: string;
  lastSyncAt?: number;
  syncFailing?: boolean;
  tokenRejected?: boolean;
  exhaustedSignal?: boolean;
  localUsedSinceIssue?: number;
  price?: { amount: number; currency: string; period: "month" };
};

export type BillingServiceDeps = {
  kv: KeyValueStore;
  secrets: SecretBox;
  publicKeys: string[];
  /** Builds the provider for this install (HTTP or mock). */
  makeProvider: (identity: () => InstallIdentity) => BillingProvider;
  selectedProviderId: () => string;
  ownKeyReady: () => boolean;
  onChange: (state: AccessState) => void;
  /** Opens a URL in the system browser. */
  openExternal: (url: string) => void;
  now?: () => number;
  /** Background refresh while a plan exists. */
  refreshEveryMs?: number;
  /** Polling while a checkout is open in the browser. */
  checkoutPollMs?: number;
  checkoutTimeoutMs?: number;
};

/**
 * Keeps this install's entitlement: registers it, refreshes the signed token,
 * follows a checkout, and turns all of it into the AccessState the UI shows.
 * Card data never passes through here: checkout is a page in the browser.
 */
export class BillingService {
  private readonly provider: BillingProvider;
  private readonly now: () => number;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private checkoutTimer: ReturnType<typeof setInterval> | null = null;
  private checkoutUntil = 0;
  private last = "";

  private readonly publicKeys: string[];

  constructor(private readonly deps: BillingServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.provider = deps.makeProvider(() => this.identity());
    this.publicKeys = this.provider.mockPublicKeyPem ? [...deps.publicKeys, this.provider.mockPublicKeyPem] : deps.publicKeys;
  }

  private read(): Stored {
    const value = this.deps.kv.get("billing");
    return value && typeof value === "object" ? (value as Stored) : {};
  }

  private write(patch: Partial<Stored>): void {
    this.deps.kv.set("billing", { ...this.read(), ...patch });
  }

  /** Created on first use; the secret is kept only encrypted by the OS keychain. */
  private identity(): InstallIdentity {
    const stored = this.read();
    if (stored.installId && stored.installSecretEnc) {
      try {
        return {
          installId: stored.installId,
          installSecret: this.deps.secrets.decryptString(Buffer.from(stored.installSecretEnc, "base64")),
        };
      } catch {
        // keychain changed: a new identity (the server sees a new install)
      }
    }
    if (!this.deps.secrets.isEncryptionAvailable()) throw new BillingError("secure storage is not available", "no_keychain", 0);
    const identity = { installId: randomUUID(), installSecret: randomBytes(32).toString("base64url") };
    this.write({
      installId: identity.installId,
      installSecretEnc: this.deps.secrets.encryptString(identity.installSecret).toString("base64"),
    });
    return identity;
  }

  /** The verified payload of the stored token, or null. */
  private payload(): EntitlementPayload | null {
    const stored = this.read();
    if (!stored.token) return null;
    const result = verifyToken(stored.token, this.publicKeys);
    if (!result.ok || result.payload.iid !== stored.installId) return null;
    return result.payload;
  }

  access(): AccessState {
    const stored = this.read();
    return deriveAccess({
      now: this.now(),
      selectedProviderId: this.deps.selectedProviderId(),
      ownKeyReady: this.deps.ownKeyReady(),
      token: this.payload(),
      tokenRejected: Boolean(stored.tokenRejected),
      lastSyncAt: stored.lastSyncAt ?? null,
      syncFailing: Boolean(stored.syncFailing),
      exhaustedSignal: Boolean(stored.exhaustedSignal),
      localUsedSinceIssue: stored.localUsedSinceIssue ?? 0,
      price: stored.price,
      checkoutPending: this.checkoutTimer !== null,
    });
  }

  /** The token to send to the Avalet LLM proxy, or null when it must not be used. */
  proxyToken(): string | null {
    return this.access().canUseAvalet ? (this.read().token ?? null) : null;
  }

  /** Metering: which budget calls of a provider count against. */
  tierOf(providerId: string): { tier: "own" | "avalet"; trial: boolean } {
    if (providerId !== AVALET_PROVIDER_ID) return { tier: "own", trial: false };
    return { tier: "avalet", trial: this.payload()?.plan === "trial" };
  }

  /** Local count between refreshes, so the remaining budget moves while offline. */
  noteAvaletUsage(weighted: number): void {
    this.write({ localUsedSinceIssue: (this.read().localUsedSinceIssue ?? 0) + weighted });
    this.emit();
  }

  /** The proxy refused a call for budget reasons (402). */
  markExhausted(): void {
    this.write({ exhaustedSignal: true });
    this.emit();
    void this.refresh();
  }

  /** The proxy refused the token (expired, revoked): get a new one. */
  markRejected(): void {
    void this.refresh();
  }

  private accept(token: string): void {
    const identity = this.read();
    const result = verifyToken(token, this.publicKeys);
    if (!result.ok || result.payload.iid !== identity.installId) {
      logLine(`[billing] rejected a token from the server (${result.ok ? "other install" : result.reason})`);
      this.write({ tokenRejected: true, lastSyncAt: this.now(), syncFailing: false });
      return;
    }
    this.write({
      token,
      tokenRejected: false,
      lastSyncAt: this.now(),
      syncFailing: false,
      exhaustedSignal: false,
      localUsedSinceIssue: 0,
    });
  }

  private failed(error: unknown): void {
    const code = error instanceof BillingError ? error.code : "error";
    logLine(`[billing] ${code}: ${error instanceof Error ? error.message : String(error)}`);
    this.write({ syncFailing: true });
  }

  async activateTrial(): Promise<AccessState> {
    try {
      this.accept(await this.provider.getEntitlement());
    } catch (error) {
      this.failed(error);
    }
    await this.loadPrice();
    this.ensureBackgroundRefresh();
    return this.emit();
  }

  async refresh(): Promise<AccessState> {
    if (!this.read().installId) return this.emit();
    try {
      this.accept(await this.provider.refresh());
    } catch (error) {
      this.failed(error);
    }
    return this.emit();
  }

  private async loadPrice(): Promise<void> {
    try {
      const info: PlansInfo = await this.provider.plans();
      const pro = info.plans.find((p) => p.id === "pro");
      if (pro) this.write({ price: { amount: pro.amount, currency: pro.currency, period: pro.period } });
    } catch {
      // placeholder price stays
    }
  }

  /** Opens the payment page and watches for the plan to change. */
  async checkout(plan: "pro"): Promise<AccessState> {
    if (!this.read().installId) await this.activateTrial();
    const url = await this.provider.startCheckout(plan);
    this.deps.openExternal(url);
    this.watchCheckout();
    return this.emit();
  }

  private watchCheckout(): void {
    this.checkoutUntil = this.now() + (this.deps.checkoutTimeoutMs ?? 15 * 60_000);
    if (this.checkoutTimer) return;
    const before = this.payload();
    this.checkoutTimer = setInterval(() => {
      void this.refresh().then((state) => {
        const after = this.payload();
        const changed = after && (after.plan !== before?.plan || after.periodEnd !== before?.periodEnd);
        if (changed || this.now() > this.checkoutUntil) this.stopCheckoutWatch();
        if (changed) logLine(`[billing] plan is now ${after?.plan}`);
        return state;
      });
    }, this.deps.checkoutPollMs ?? 5_000);
  }

  private stopCheckoutWatch(): void {
    if (this.checkoutTimer) clearInterval(this.checkoutTimer);
    this.checkoutTimer = null;
    this.emit();
  }

  async cancelInfo(): Promise<CancelInfoPublic> {
    return this.provider.cancelInfo();
  }

  async openManage(): Promise<void> {
    const info = await this.provider.cancelInfo();
    if (info.manageUrl) this.deps.openExternal(info.manageUrl);
  }

  /** On startup: refresh a known install in the background, keep it fresh while the app runs. */
  start(): void {
    if (!this.read().installId) return;
    void this.refresh();
    void this.loadPrice();
    this.ensureBackgroundRefresh();
  }

  private ensureBackgroundRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => void this.refresh(), this.deps.refreshEveryMs ?? 30 * 60_000);
    this.refreshTimer.unref?.();
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    if (this.checkoutTimer) clearInterval(this.checkoutTimer);
    this.checkoutTimer = null;
  }

  /** Emits only when something visible changed. */
  emit(): AccessState {
    const state = this.access();
    const snapshot = JSON.stringify(state);
    if (snapshot !== this.last) {
      this.last = snapshot;
      this.deps.onChange(state);
    }
    return state;
  }
}
