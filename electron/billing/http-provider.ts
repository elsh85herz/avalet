import { BillingError, type BillingProvider, type CancelInfo, type InstallIdentity, type Plan, type PlansInfo } from "./provider.js";

const TIMEOUT_MS = 10_000;

/**
 * BillingProvider against the documented server contract
 * (docs/dev/billing-api.md). Stateless apart from the install identity.
 */
export class HttpBillingProvider implements BillingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly identity: () => InstallIdentity,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth) {
      const { installId, installSecret } = this.identity();
      headers.authorization = `Bearer ${installSecret}`;
      headers["x-avalet-install"] = installId;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new BillingError(`billing server unreachable: ${error instanceof Error ? error.message : String(error)}`, "network", 0);
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }
    if (!response.ok) {
      const error = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      const code = typeof error?.code === "string" ? error.code : `http_${response.status}`;
      const message = typeof error?.message === "string" ? error.message : text.slice(0, 200);
      throw new BillingError(message || `billing server answered ${response.status}`, code, response.status);
    }
    return data as T;
  }

  async getEntitlement(): Promise<string> {
    try {
      return await this.refresh();
    } catch (error) {
      if (!(error instanceof BillingError) || error.code !== "unknown_install") throw error;
      const { installId, installSecret } = this.identity();
      const created = await this.request<{ token?: unknown }>("POST", "/v1/installs", { installId, installSecret }, false);
      if (typeof created?.token !== "string") throw new BillingError("no token in the answer", "bad_response", 200);
      return created.token;
    }
  }

  async refresh(): Promise<string> {
    const data = await this.request<{ token?: unknown }>("GET", "/v1/entitlement");
    if (typeof data?.token !== "string") throw new BillingError("no token in the answer", "bad_response", 200);
    return data.token;
  }

  async startCheckout(plan: Plan): Promise<string> {
    const data = await this.request<{ url?: unknown }>("POST", "/v1/checkout", { plan });
    if (typeof data?.url !== "string" || !/^https?:\/\//.test(data.url)) {
      throw new BillingError("no checkout URL in the answer", "bad_response", 200);
    }
    return data.url;
  }

  async cancelInfo(): Promise<CancelInfo> {
    const data = await this.request<Partial<CancelInfo>>("GET", "/v1/subscription");
    return {
      active: Boolean(data?.active),
      renews: Boolean(data?.renews),
      periodEnd: typeof data?.periodEnd === "number" ? data.periodEnd : null,
      manageUrl: typeof data?.manageUrl === "string" && /^https?:\/\//.test(data.manageUrl) ? data.manageUrl : null,
    };
  }

  async plans(): Promise<PlansInfo> {
    const data = await this.request<PlansInfo>("GET", "/v1/plans", undefined, false);
    if (!data || !Array.isArray(data.plans)) throw new BillingError("bad plans answer", "bad_response", 200);
    return data;
  }
}
