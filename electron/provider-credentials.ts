import { AccessBlockedError } from "./providers/errors.js";
import { getApiKey, getProviderSettings } from "./settings-store.js";

// Where a provider call gets its key and endpoint. Own-key providers: the
// encrypted key and base URL from settings. The built-in Avalet provider: the
// current entitlement token and the billing server's proxy URL; when the
// token must not be used (no plan, budget used up, offline too long) the call
// is refused here, before anything leaves the machine.

type AvaletSource = { proxyBaseUrl: () => string; token: () => string | null };

let avalet: AvaletSource | null = null;

export function configureAvaletProvider(source: AvaletSource | null): void {
  avalet = source;
}

export function resolveCredentials(providerId: string): { apiKey: string; baseUrl?: string } {
  if (providerId === "avalet") {
    const token = avalet?.token() ?? null;
    if (!avalet || !token) throw new AccessBlockedError();
    return { apiKey: token, baseUrl: avalet.proxyBaseUrl() };
  }
  return { apiKey: getApiKey(providerId), baseUrl: getProviderSettings(providerId).baseUrl };
}
