import { safeStorage } from "electron";
import Store from "electron-store";
import { PROVIDER_PRESETS } from "./providers/index.js";

export type ProviderSettings = {
  providerId: string;
  model: string;
  baseUrl?: string;
  /** API key, encrypted at rest via OS keychain (safeStorage), base64-wrapped for JSON storage. */
  apiKeyEncrypted?: string;
};

type StoreShape = {
  selectedProviderId: string;
  providers: Record<string, ProviderSettings>;
  /** Web Audio `deviceId` of the preferred mic input, or "" for the OS default. */
  preferredMicDeviceId: string;
  /** `desktopCapturer` source id of the preferred screen for system-audio
   * loopback, or "" to fall back to whatever loopback picks first. */
  preferredScreenSourceId: string;
  /** Free-text briefing (ticket/spec/agenda) pasted before a call, folded into the system prompt. */
  sessionContext: string;
  /** When false, LiveSession only responds to askManual() — no automatic periodic suggestions. */
  autoDetectEnabled: boolean;
  /** Overlay window opacity, 0.2-1. Adjustable live from the overlay itself. */
  overlayOpacity: number;
  /** App-wide light/dark appearance — also drives Electron's `nativeTheme`
   * so window vibrancy actually renders in the matching shade, not just CSS. */
  theme: "dark" | "light";
  /** Language of the overlay's own UI (button labels/tooltips/placeholders).
   * The model's own answer language is fixed to Russian in the system
   * prompt (see live-session.ts) — not user-configurable. */
  uiLanguage: "ru" | "en";
};

const defaults: StoreShape = {
  selectedProviderId: "anthropic",
  providers: Object.fromEntries(
    PROVIDER_PRESETS.map((preset) => [
      preset.id,
      { providerId: preset.id, model: preset.defaultModel, baseUrl: preset.defaultBaseUrl },
    ]),
  ),
  preferredMicDeviceId: "",
  preferredScreenSourceId: "",
  sessionContext: "",
  autoDetectEnabled: true,
  overlayOpacity: 1,
  theme: "dark",
  uiLanguage: "ru",
};

const store = new Store<StoreShape>({ name: "avalet-settings", defaults });

export function getPreferredMicDeviceId(): string {
  return store.get("preferredMicDeviceId") ?? "";
}

export function setPreferredMicDeviceId(deviceId: string): void {
  store.set("preferredMicDeviceId", deviceId);
}

export function getPreferredScreenSourceId(): string {
  return store.get("preferredScreenSourceId") ?? "";
}

export function setPreferredScreenSourceId(sourceId: string): void {
  store.set("preferredScreenSourceId", sourceId);
}

export function getSessionContext(): string {
  return store.get("sessionContext") ?? "";
}

export function setSessionContext(text: string): void {
  store.set("sessionContext", text);
}

export function getAutoDetectEnabled(): boolean {
  return store.get("autoDetectEnabled") ?? true;
}

export function setAutoDetectEnabled(enabled: boolean): void {
  store.set("autoDetectEnabled", enabled);
}

export function getOverlayOpacity(): number {
  return store.get("overlayOpacity") ?? 1;
}

export function setOverlayOpacity(opacity: number): void {
  store.set("overlayOpacity", Math.min(1, Math.max(0.2, opacity)));
}

export function getTheme(): "dark" | "light" {
  return store.get("theme") ?? "dark";
}

export function setTheme(theme: "dark" | "light"): void {
  store.set("theme", theme);
}

export function getUiLanguage(): "ru" | "en" {
  return store.get("uiLanguage") ?? "ru";
}

export function setUiLanguage(language: "ru" | "en"): void {
  store.set("uiLanguage", language);
}

function readProviders(): Record<string, ProviderSettings> {
  return store.get("providers") ?? {};
}

function writeProvider(providerId: string, settings: ProviderSettings): void {
  const providers = readProviders();
  providers[providerId] = settings;
  store.set("providers", providers);
}

export function getSelectedProviderId(): string {
  return store.get("selectedProviderId");
}

export function setSelectedProviderId(providerId: string): void {
  store.set("selectedProviderId", providerId);
}

export function getProviderSettings(providerId: string): ProviderSettings {
  const existing = readProviders()[providerId];
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
  return (
    existing ?? {
      providerId,
      model: preset?.defaultModel ?? "",
      baseUrl: preset?.defaultBaseUrl,
    }
  );
}

export function getAllProviderSettings(): ProviderSettings[] {
  return PROVIDER_PRESETS.map((preset) => getProviderSettings(preset.id));
}

export function updateProviderSettings(
  providerId: string,
  patch: { model?: string; baseUrl?: string },
): void {
  writeProvider(providerId, { ...getProviderSettings(providerId), ...patch });
}

/** Returns the decrypted API key, or "" if none is stored / safeStorage is unavailable. */
export function getApiKey(providerId: string): string {
  const settings = getProviderSettings(providerId);
  if (!settings.apiKeyEncrypted) return "";
  if (!safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(settings.apiKeyEncrypted, "base64"));
  } catch {
    return "";
  }
}

export function setApiKey(providerId: string, apiKey: string): void {
  const current = getProviderSettings(providerId);
  if (!apiKey) {
    writeProvider(providerId, { ...current, apiKeyEncrypted: undefined });
    return;
  }
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(apiKey).toString("base64")
    : Buffer.from(apiKey, "utf8").toString("base64"); // dev-only fallback, no OS keychain available
  writeProvider(providerId, { ...current, apiKeyEncrypted: encrypted });
}

/** Whether a key has been saved, without decrypting/returning it. */
export function hasApiKey(providerId: string): boolean {
  return Boolean(getProviderSettings(providerId).apiKeyEncrypted);
}
