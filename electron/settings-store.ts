import type { KeyValueStore, SecretBox } from "./platform/kv.js";
import { PROVIDER_PRESETS, RETIRED_MODELS } from "./providers/types.js";
import {
  MEETING_MODES,
  SPEECH_LANGUAGES,
  SPEECH_MODELS,
  type MeetingMode,
  type SpeechLanguage,
  type SpeechModelName,
  type Theme,
  type UiLanguage,
  type UiLevel,
} from "./shared/ipc-contract.js";

export { SPEECH_LANGUAGES, SPEECH_MODELS };
export type { SpeechLanguage };
export type SpeechModel = SpeechModelName;

export type ProviderSettings = {
  providerId: string;
  model: string;
  /** Cheaper model for background calls (live checklist); "" = use `model`. */
  backgroundModel?: string;
  baseUrl?: string;
  /** API key, encrypted at rest via OS keychain (safeStorage), base64-wrapped for JSON storage. */
  apiKeyEncrypted?: string;
};

export type SettingsShape = {
  /** Bumped by migrateSettings; absent in files written before 0.2. */
  schemaVersion: number;
  selectedProviderId: string;
  providers: Record<string, ProviderSettings>;
  /** Web Audio `deviceId` of the preferred mic input, or "" for the OS default. */
  preferredMicDeviceId: string;
  /** `desktopCapturer` source id of the preferred screen for system-audio loopback, or "". */
  preferredScreenSourceId: string;
  /** Free-text briefing (ticket/spec/agenda) pasted before a call, folded into the system prompt. */
  sessionContext: string;
  /** Agenda for the next call: one question per line. Copied into each new meeting. */
  agendaText: string;
  /** When false, LiveSession only responds to askManual(): no automatic suggestions. */
  autoDetectEnabled: boolean;
  /** Window opacity, 0.2-1. */
  overlayOpacity: number;
  theme: Theme;
  /** Language of the app's own UI. The model's answer language is fixed in the prompts. */
  uiLanguage: UiLanguage;
  /** Simple: guided, minimum controls. Advanced: every setting. */
  uiLevel: UiLevel;
  /** First-run wizard finished or skipped. */
  onboardingDone: boolean;
  /** Prompt preset for the kind of meeting; see electron/modes.ts. */
  meetingMode: MeetingMode;
  /** Keep the main (notes) window above other windows. */
  mainPinned: boolean;
  /** Also send locally recognized text with screenshots to models that see images. */
  screenshotText: boolean;
  speechLanguage: SpeechLanguage;
  speechModel: SpeechModel;
  /** Live checklist on/off as chosen by the user; null = the default for the UI level. */
  liveTrackerEnabled: boolean | null;
};

export const SETTINGS_SCHEMA_VERSION = 1;

export function defaultProviders(): Record<string, ProviderSettings> {
  return Object.fromEntries(
    PROVIDER_PRESETS.map((preset) => [
      preset.id,
      {
        providerId: preset.id,
        model: preset.defaultModel,
        backgroundModel: preset.defaultBackgroundModel ?? "",
        baseUrl: preset.defaultBaseUrl,
      },
    ]),
  );
}

export function defaultSettings(): SettingsShape {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    selectedProviderId: "anthropic",
    providers: defaultProviders(),
    preferredMicDeviceId: "",
    preferredScreenSourceId: "",
    sessionContext: "",
    agendaText: "",
    autoDetectEnabled: true,
    overlayOpacity: 1,
    theme: "dark",
    uiLanguage: "ru",
    uiLevel: "simple",
    onboardingDone: false,
    meetingMode: "free",
    mainPinned: true,
    screenshotText: false,
    speechLanguage: "ru",
    speechModel: "small",
    liveTrackerEnabled: null,
  };
}

/**
 * Brings a stored settings document up to the current schema. Pure: takes the
 * raw JSON, returns the fields to write (empty when nothing changed).
 *
 * v0 -> v1 (0.2): an install that already has a saved key is an existing user,
 * who keeps every control (Advanced) and skips the first-run wizard; everybody
 * else starts in Simple with the wizard. Providers gain a background model.
 */
export function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version >= SETTINGS_SCHEMA_VERSION) return {};
  const patch: Record<string, unknown> = { schemaVersion: SETTINGS_SCHEMA_VERSION };
  if (version < 1) {
    const providers = (raw.providers && typeof raw.providers === "object" ? raw.providers : {}) as Record<
      string,
      ProviderSettings
    >;
    const hasKey = Object.values(providers).some((p) => Boolean(p?.apiKeyEncrypted));
    // An install that ever wrote a settings file with a provider list has been used before.
    const existingInstall = hasKey || Object.keys(raw).length > 0;
    if (raw.uiLevel === undefined) patch.uiLevel = hasKey ? "advanced" : "simple";
    if (raw.onboardingDone === undefined) patch.onboardingDone = hasKey;
    if (raw.liveTrackerEnabled === undefined) patch.liveTrackerEnabled = null;
    if (existingInstall && Object.keys(providers).length > 0) {
      const next: Record<string, ProviderSettings> = {};
      for (const [id, settings] of Object.entries(providers)) {
        const preset = PROVIDER_PRESETS.find((p) => p.id === id);
        next[id] = { ...settings, backgroundModel: settings.backgroundModel ?? preset?.defaultBackgroundModel ?? "" };
      }
      patch.providers = next;
    }
  }
  return patch;
}

let kv: KeyValueStore | null = null;
let secrets: SecretBox | null = null;
let advancedForced = false;

/** Called once by main.ts (electron-store + safeStorage) or by tests (MemoryKV + fake box). */
export function initSettingsStore(store: KeyValueStore, box: SecretBox, options: { forceAdvanced?: boolean } = {}): void {
  kv = store;
  secrets = box;
  advancedForced = Boolean(options.forceAdvanced);
  const patch = migrateSettings(store.store);
  for (const [key, value] of Object.entries(patch)) store.set(key, value);
}

function db(): KeyValueStore {
  if (!kv) throw new Error("settings store not initialized");
  return kv;
}

function read<K extends keyof SettingsShape>(key: K): SettingsShape[K] {
  const value = db().get(key) as SettingsShape[K] | undefined;
  return value === undefined ? defaultSettings()[key] : value;
}

function write<K extends keyof SettingsShape>(key: K, value: SettingsShape[K]): void {
  db().set(key, value);
}

export function getPreferredMicDeviceId(): string {
  return read("preferredMicDeviceId") ?? "";
}

export function setPreferredMicDeviceId(deviceId: string): void {
  write("preferredMicDeviceId", deviceId);
}

export function getPreferredScreenSourceId(): string {
  return read("preferredScreenSourceId") ?? "";
}

export function setPreferredScreenSourceId(sourceId: string): void {
  write("preferredScreenSourceId", sourceId);
}

export function getAgendaText(): string {
  return read("agendaText") ?? "";
}

export function setAgendaText(text: string): void {
  write("agendaText", text);
}

export function getSessionContext(): string {
  return read("sessionContext") ?? "";
}

export function setSessionContext(text: string): void {
  write("sessionContext", text);
}

export function getAutoDetectEnabled(): boolean {
  return read("autoDetectEnabled") ?? true;
}

export function setAutoDetectEnabled(enabled: boolean): void {
  write("autoDetectEnabled", enabled);
}

export function getOverlayOpacity(): number {
  const value = read("overlayOpacity");
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0.2, value)) : 1;
}

export function setOverlayOpacity(opacity: number): void {
  write("overlayOpacity", Math.min(1, Math.max(0.2, opacity)));
}

export function getTheme(): Theme {
  return read("theme") === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  write("theme", theme);
}

export function getUiLanguage(): UiLanguage {
  return read("uiLanguage") === "en" ? "en" : "ru";
}

export function setUiLanguage(language: UiLanguage): void {
  write("uiLanguage", language);
}

/** AVALET_ADVANCED=1 forces Advanced for the launch without changing the stored choice. */
export function getUiLevel(): UiLevel {
  if (advancedForced) return "advanced";
  return read("uiLevel") === "advanced" ? "advanced" : "simple";
}

export function isUiLevelForced(): boolean {
  return advancedForced;
}

export function setUiLevel(level: UiLevel): void {
  write("uiLevel", level);
}

export function getOnboardingDone(): boolean {
  return read("onboardingDone") === true;
}

export function setOnboardingDone(done: boolean): void {
  write("onboardingDone", done);
}

/**
 * The live checklist is not verified on a real meeting yet: on by default in
 * Advanced, off in Simple, unless the user flipped the switch themselves.
 */
export function getLiveTrackerEnabled(): boolean {
  const stored = read("liveTrackerEnabled");
  if (typeof stored === "boolean") return stored;
  return getUiLevel() === "advanced";
}

export function setLiveTrackerEnabled(enabled: boolean): void {
  write("liveTrackerEnabled", enabled);
}

export function getMeetingMode(): MeetingMode {
  const value = read("meetingMode");
  return MEETING_MODES.includes(value) ? value : "free";
}

export function setMeetingMode(mode: MeetingMode): void {
  write("meetingMode", mode);
}

function readProviders(): Record<string, ProviderSettings> {
  return read("providers") ?? {};
}

function writeProvider(providerId: string, settings: ProviderSettings): void {
  const providers = readProviders();
  providers[providerId] = settings;
  write("providers", providers);
}

export function getSelectedProviderId(): string {
  const id = read("selectedProviderId");
  return PROVIDER_PRESETS.some((p) => p.id === id) ? id : "anthropic";
}

export function setSelectedProviderId(providerId: string): void {
  if (!PROVIDER_PRESETS.some((p) => p.id === providerId)) throw new Error("unknown provider");
  write("selectedProviderId", providerId);
}

export function getProviderSettings(providerId: string): ProviderSettings {
  const existing = readProviders()[providerId];
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
  if (!existing) {
    return {
      providerId,
      model: preset?.defaultModel ?? "",
      backgroundModel: preset?.defaultBackgroundModel ?? "",
      baseUrl: preset?.defaultBaseUrl,
    };
  }
  return {
    ...existing,
    model: RETIRED_MODELS[existing.model] ?? existing.model,
    backgroundModel: RETIRED_MODELS[existing.backgroundModel ?? ""] ?? existing.backgroundModel ?? "",
  };
}

/** The model background calls use: the provider's background model, else its main model. */
export function getBackgroundModel(providerId: string): string {
  const settings = getProviderSettings(providerId);
  return settings.backgroundModel?.trim() || settings.model;
}

export function getAllProviderSettings(): ProviderSettings[] {
  return PROVIDER_PRESETS.map((preset) => getProviderSettings(preset.id));
}

export function updateProviderSettings(
  providerId: string,
  patch: { model?: string; baseUrl?: string; backgroundModel?: string },
): void {
  if (!PROVIDER_PRESETS.some((p) => p.id === providerId)) throw new Error("unknown provider");
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === "string"));
  writeProvider(providerId, { ...getProviderSettings(providerId), ...clean });
}

function box(): SecretBox {
  if (!secrets) throw new Error("settings store not initialized");
  return secrets;
}

/** Returns the decrypted API key, or "" if none is stored / encryption is unavailable. */
export function getApiKey(providerId: string): string {
  const settings = getProviderSettings(providerId);
  if (!settings.apiKeyEncrypted) return "";
  const raw = Buffer.from(settings.apiKeyEncrypted, "base64");
  if (!box().isEncryptionAvailable()) return "";
  try {
    return box().decryptString(raw);
  } catch {
    return "";
  }
}

/**
 * Keys are stored only encrypted by the OS keychain. When encryption is not
 * available (no keychain, some Linux setups) the key is refused instead of
 * being written in the clear.
 */
export function setApiKey(providerId: string, apiKey: string): void {
  const current = getProviderSettings(providerId);
  const trimmed = apiKey.trim();
  if (!trimmed) {
    writeProvider(providerId, { ...current, apiKeyEncrypted: undefined });
    return;
  }
  if (!box().isEncryptionAvailable()) throw new Error("secure storage is not available on this system");
  const encrypted = box().encryptString(trimmed).toString("base64");
  writeProvider(providerId, { ...current, apiKeyEncrypted: encrypted });
}

/** Whether a key has been saved, without decrypting/returning it. */
export function hasApiKey(providerId: string): boolean {
  return Boolean(getProviderSettings(providerId).apiKeyEncrypted);
}

export function getMainPinned(): boolean {
  return read("mainPinned") ?? true;
}

export function setMainPinned(pinned: boolean): void {
  write("mainPinned", pinned);
}

export function getScreenshotTextEnabled(): boolean {
  return read("screenshotText") ?? false;
}

export function setScreenshotTextEnabled(enabled: boolean): void {
  write("screenshotText", enabled);
}

export function getSpeechLanguage(): SpeechLanguage {
  const value = read("speechLanguage");
  return SPEECH_LANGUAGES.includes(value) ? value : "ru";
}

export function setSpeechLanguage(language: SpeechLanguage): void {
  write("speechLanguage", language);
}

export function getSpeechModel(): SpeechModel {
  const value = read("speechModel");
  return SPEECH_MODELS.includes(value) ? value : "small";
}

export function setSpeechModel(model: SpeechModel): void {
  write("speechModel", model);
}
