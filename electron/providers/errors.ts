// Providers answer a refused image with a 4xx whose body mentions it. That is
// the signal to fall back to recognized text instead of failing the block.
// Adapter errors look like "<endpoint or provider> <status>: <response body>".
export function isImageRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(400|415|422)\b/.test(message) && /image|vision|multimodal|unsupported|unknown variant/i.test(message);
}

/**
 * An HTTP failure from a provider, with the status and, for the built-in
 * Avalet provider, the machine-readable code from the server (see
 * docs/dev/billing-api.md). The message keeps the old "<where> <status>: <body>"
 * shape that isImageRejection and the UI rely on.
 */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export function errorCodeFromBody(body: string): string | null {
  try {
    const data = JSON.parse(body) as { error?: { code?: unknown } | string; code?: unknown };
    if (data && typeof data.error === "object" && typeof data.error?.code === "string") return data.error.code;
    if (typeof data?.code === "string") return data.code;
  } catch {
    // not JSON
  }
  return null;
}

/** The built-in provider's budget is used up (server said 402 budget_exhausted). */
export function isBudgetExhausted(error: unknown): boolean {
  return error instanceof ProviderHttpError && (error.code === "budget_exhausted" || error.status === 402);
}

/** The built-in provider refused the entitlement (expired, revoked, tampered). */
export function isEntitlementRejected(error: unknown): boolean {
  return (
    error instanceof ProviderHttpError &&
    (error.code === "invalid_token" || error.code === "plan_expired" || error.code === "no_entitlement")
  );
}
