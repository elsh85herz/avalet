import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../lib/types.js";
import { UI_STRINGS, type PermState } from "../lib/i18n.js";
import { PROVIDER_PRESETS_UI } from "../providers/presets.js";
import { IconMoon, IconSun } from "../icons.js";
import { useAppSettings } from "../lib/settings.js";
import { useSession } from "../lib/session.js";
import { SpeechModels } from "./SpeechModels.js";
import { UsageCounter } from "./UsageCounter.js";
import { AccessCard } from "./AccessCard.js";
import { ContextFields } from "./ContextFields.js";
import { OpacitySlider } from "./OpacitySlider.js";

/**
 * The Advanced level: every setting that exists. Start/Stop and capture are
 * shared with the Simple level (lib/session.tsx).
 */
export function SettingsPanel({ onRunSetup }: { onRunSetup: () => void }) {
  const bridge = getBridge();
  const { settings, patch, reload } = useAppSettings();
  const session = useSession();
  const uiLanguage = settings.uiLanguage;
  const strings = UI_STRINGS[uiLanguage];
  const t = strings.settings;
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [keyTest, setKeyTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [permissions, setPermissions] = useState<{ mic: string; screen: string } | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [preferredMicId, setPreferredMicId] = useState("");
  const [screenSources, setScreenSources] = useState<{ id: string; name: string }[]>([]);
  const [preferredScreenId, setPreferredScreenId] = useState("");
  const [micWorks, setMicWorks] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const speechSectionRef = useRef<HTMLElement | null>(null);
  const accessRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void initDeviceDetection();
    void bridge.mic.getPreferred().then(setPreferredMicId);
    void bridge.screen.getPreferred().then(setPreferredScreenId);
    return bridge.events.onNavigate((to) => {
      if (to === "access") accessRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  useEffect(() => {
    if (session.problem?.kind === "model-missing") speechSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [session.problem]);

  async function refreshPermissions() {
    setPermissions(await bridge.permissions.check());
  }

  // Populates both pickers without surprising a first-time user with an OS
  // prompt: only for whichever access is already granted; the rest keep
  // their manual "Detect" button.
  async function initDeviceDetection() {
    const perms = await bridge.permissions.check();
    setPermissions(perms);
    const known = (await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === "audioinput" && d.label);
    if (known) setMicWorks(true);
    if (perms.mic === "granted" || known) void detectMicrophones();
    if (perms.screen === "granted") void detectScreens();
  }

  async function detectMicrophones() {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter((d) => d.kind === "audioinput"));
      setMicWorks(true);
      await refreshPermissions();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  async function detectScreens() {
    try {
      setScreenSources(await bridge.screen.listSources());
      await refreshPermissions();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  const selectedProviderId = settings.selectedProviderId;
  const current = settings.providers.find((p) => p.providerId === selectedProviderId);
  const preset = PROVIDER_PRESETS_UI.find((p) => p.id === selectedProviderId);

  async function handleSelectProvider(providerId: string) {
    setApiKeyDraft("");
    setKeyTest(null);
    await bridge.settings.selectProvider(providerId);
    await reload();
  }

  async function handleFieldChange(field: "model" | "baseUrl" | "backgroundModel", value: string) {
    patch({ providers: settings.providers.map((p) => (p.providerId === selectedProviderId ? { ...p, [field]: value } : p)) });
    await bridge.settings.updateProvider(selectedProviderId, { [field]: value });
  }

  async function handleSaveKey() {
    if (!apiKeyDraft) return;
    try {
      await bridge.settings.setApiKey(selectedProviderId, apiKeyDraft);
      setApiKeyDraft("");
      await reload();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTestKey() {
    setKeyTest(null);
    const result = await bridge.billing.testProvider(selectedProviderId);
    setKeyTest(result.ok ? { ok: true, message: strings.wizard.testOk } : { ok: false, message: result.message });
  }

  async function toggleTheme() {
    const next = settings.theme === "dark" ? "light" : "dark";
    patch({ theme: next });
    await bridge.settings.setTheme(next);
  }

  async function toggleUiLanguage() {
    const next = uiLanguage === "ru" ? "en" : "ru";
    patch({ uiLanguage: next });
    await bridge.settings.setUiLanguage(next);
  }

  async function setBool(key: "autoDetectEnabled" | "screenshotText" | "liveTrackerEnabled", next: boolean) {
    patch({ [key]: next });
    if (key === "autoDetectEnabled") await bridge.settings.setAutoDetect(next);
    else if (key === "screenshotText") await bridge.settings.setScreenshotText(next);
    else await bridge.settings.setLiveTracker(next);
  }

  const micStatus: PermState = micWorks ? "granted" : ((permissions?.mic as PermState | undefined) ?? "unknown");
  const screenStatus: PermState = (permissions?.screen as PermState | undefined) ?? "unknown";
  const permLabel = (state: PermState) => t.perm[state] ?? state;
  const degraded = session.audioDegraded;
  const degradedChannel = degraded.me && degraded.other ? "both" : degraded.other ? "other" : "me";
  const degradedMessage = degradedChannel === "both" ? t.audioLostBoth : degradedChannel === "other" ? t.audioLostOther : t.audioLostMe;
  const problem = session.problem;
  const errorText =
    problem?.kind === "model-missing" ? strings.models.missingForStart : problem ? problem.message : localError;

  return (
    <main className="settings" data-testid="advanced-settings">
      <header>
        <div className="header-row">
          <h1>Avalet</h1>
          <div className="header-controls">
            <button type="button" className="lang-btn" onClick={() => void toggleUiLanguage()} title={strings.uiLangTitle} aria-label={strings.uiLangTitle}>
              {uiLanguage === "ru" ? "RU" : "EN"}
            </button>
            <button
              type="button"
              className="theme-btn"
              onClick={() => void toggleTheme()}
              title={settings.theme === "dark" ? t.themeToLight : t.themeToDark}
              aria-label={settings.theme === "dark" ? t.themeToLight : t.themeToDark}
            >
              {settings.theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
        <p className="subtitle">{t.subtitle}</p>
      </header>

      <section className="level-switch">
        <p className="hint">{strings.simple.simpleHint}</p>
        <div className="access-actions">
          <button type="button" onClick={() => void bridge.settings.setUiLevel("simple")} disabled={settings.uiLevelForced} data-testid="to-simple">
            {strings.simple.simpleMode}
          </button>
          <button type="button" onClick={onRunSetup}>
            {strings.simple.runSetup}
          </button>
        </div>
      </section>

      <section className="access" ref={accessRef}>
        <h3 className="section-title">{strings.access.title}</h3>
        <AccessCard
          uiLanguage={uiLanguage}
          onUseAvalet={() => void handleSelectProvider("avalet")}
          onUseOwnKey={() => {
            const withKey = settings.providers.find((p) => p.providerId !== "avalet" && p.hasApiKey);
            void handleSelectProvider(withKey?.providerId ?? "anthropic");
          }}
        />
      </section>

      <section className="providers" role="radiogroup" aria-label={strings.wizard.provider}>
        {PROVIDER_PRESETS_UI.map((p) => {
          const saved = settings.providers.find((s) => s.providerId === p.id);
          return (
            <label key={p.id} className={`provider-row ${selectedProviderId === p.id ? "active" : ""}`}>
              <input type="radio" name="provider" checked={selectedProviderId === p.id} onChange={() => void handleSelectProvider(p.id)} />
              <span>{p.label}</span>
              {saved?.hasApiKey ? <span className="badge">{t.keySaved}</span> : null}
            </label>
          );
        })}
      </section>

      {current && preset ? (
        <section className="provider-config">
          <label>
            {t.model}
            <input type="text" value={current.model} placeholder={preset.modelPlaceholder} onChange={(e) => void handleFieldChange("model", e.target.value)} />
          </label>
          <label>
            {t.backgroundModel}
            <input
              type="text"
              value={current.backgroundModel}
              placeholder={current.model}
              onChange={(e) => void handleFieldChange("backgroundModel", e.target.value)}
            />
            <span className="hint">{t.backgroundModelHint}</span>
          </label>
          {preset.baseUrlPlaceholder ? (
            <label>
              {t.baseUrl}
              <input
                type="text"
                value={current.baseUrl ?? ""}
                placeholder={preset.baseUrlPlaceholder}
                onChange={(e) => void handleFieldChange("baseUrl", e.target.value)}
              />
            </label>
          ) : null}
          {preset.apiKeyRequired ? (
            <label>
              {t.apiKey}
              <div className="key-row">
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKeyDraft}
                  placeholder={current.hasApiKey ? t.apiKeySavedPlaceholder : "sk-..."}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                />
                <button type="button" onClick={() => void handleSaveKey()} disabled={!apiKeyDraft}>
                  {t.save}
                </button>
              </div>
            </label>
          ) : null}
          {preset.id !== "avalet" ? (
            <div className="own-key-actions">
              <button type="button" onClick={() => void handleTestKey()} disabled={preset.apiKeyRequired && !current.hasApiKey}>
                {strings.wizard.saveAndTest}
              </button>
              {keyTest ? (
                <span className={keyTest.ok ? "ok-text" : "error"} role="status">
                  {keyTest.message}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="usage">
        <h3 className="section-title">{strings.usage.title}</h3>
        <UsageCounter uiLanguage={uiLanguage} detailed />
      </section>

      <section className="permissions">
        <div className="perm-row">
          <span>{t.microphone}</span>
          <span className={`perm-pill ${micStatus}`}>{permissions ? permLabel(micStatus) : "…"}</span>
        </div>
        <div className="perm-row">
          <span>{t.screenRecording}</span>
          <span className={`perm-pill ${screenStatus}`}>{permissions ? permLabel(screenStatus) : "…"}</span>
        </div>
        <div className="mic-picker">
          <select
            aria-label={t.microphone}
            value={preferredMicId}
            onChange={(e) => {
              setPreferredMicId(e.target.value);
              void bridge.mic.setPreferred(e.target.value);
            }}
          >
            <option value="">{t.defaultMic}</option>
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void detectMicrophones()}>
            {t.detectMics}
          </button>
        </div>
        <div className="mic-picker">
          <select
            aria-label={t.screenRecording}
            value={preferredScreenId}
            onChange={(e) => {
              setPreferredScreenId(e.target.value);
              void bridge.screen.setPreferred(e.target.value);
            }}
          >
            <option value="">{t.firstScreen}</option>
            {screenSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void detectScreens()}>
            {t.detectScreens}
          </button>
        </div>
        {session.capturing && (degraded.me || degraded.other) ? (
          <div className="degraded-banner">
            <span>{degradedMessage}</span>
            <button type="button" onClick={() => void session.reconnect(degradedChannel)}>
              {t.reconnect}
            </button>
          </div>
        ) : null}
        {session.transcriptionError ? (
          <div className="degraded-banner">
            <span>
              {t.transcriptionErrorPrefix} {session.transcriptionError}
            </span>
          </div>
        ) : null}
      </section>

      <section className="context speech-settings" ref={speechSectionRef}>
        <h3 className="section-title">{t.speechTitle}</h3>
        <label className="mode-select">
          {t.speechLanguage}
          <select
            value={settings.speechLanguage}
            onChange={(e) => {
              const language = e.target.value as SpeechLanguage;
              patch({ speechLanguage: language });
              void bridge.settings.setSpeech({ language });
            }}
          >
            {SPEECH_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t.speechLanguages[code]}
              </option>
            ))}
          </select>
        </label>
        <div className="mode-select">
          <span>{t.speechModel}</span>
          <SpeechModels
            uiLanguage={uiLanguage}
            selected={settings.speechModel}
            onSelect={(model) => {
              patch({ speechModel: model });
              void bridge.settings.setSpeech({ model });
            }}
            allowDelete
          />
        </div>
        <p className="hint">{t.speechHint}</p>
      </section>

      <section className="context">
        <ContextFields uiLanguage={uiLanguage} advanced />
      </section>

      <section className="session-controls">
        <label className="auto-detect-toggle">
          <span className="switch">
            <input type="checkbox" checked={settings.autoDetectEnabled} onChange={() => void setBool("autoDetectEnabled", !settings.autoDetectEnabled)} />
          </span>
          {t.autoSuggest}
        </label>
        <p className="hint">{settings.autoDetectEnabled ? t.autoSuggestOnHint : t.autoSuggestOffHint}</p>
        <label className="auto-detect-toggle">
          <span className="switch">
            <input
              type="checkbox"
              checked={settings.liveTrackerEnabled}
              onChange={() => void setBool("liveTrackerEnabled", !settings.liveTrackerEnabled)}
              data-testid="live-tracker-toggle"
            />
          </span>
          {t.liveTracker}
        </label>
        <p className="hint">{settings.liveTrackerEnabled ? t.liveTrackerOn : t.liveTrackerOff}</p>
        <label className="auto-detect-toggle">
          <span className="switch">
            <input
              type="checkbox"
              checked={settings.screenshotText && settings.ocrAvailable}
              disabled={!settings.ocrAvailable}
              onChange={() => void setBool("screenshotText", !settings.screenshotText)}
            />
          </span>
          {t.screenshotText}
        </label>
        <p className="hint">
          {!settings.ocrAvailable ? t.screenshotTextUnavailable : settings.screenshotText ? t.screenshotTextOn : t.screenshotTextOff}
        </p>
        <OpacitySlider uiLanguage={uiLanguage} />
        <p className="state">
          {t.sessionLabel}: {t.sessionStates[session.state]}
        </p>
        {errorText ? (
          <p className="error" role="alert">
            {errorText}
          </p>
        ) : null}
        <div className="buttons">
          <button type="button" className="primary" onClick={() => void session.start()} disabled={session.state === "listening"}>
            {session.state === "paused" ? t.resume : t.start}
          </button>
          <button type="button" onClick={() => void session.pause()} disabled={session.state !== "listening"}>
            {t.stop}
          </button>
          <button type="button" onClick={() => void bridge.history.clear()} title={t.clearBlocksTitle}>
            {t.clearBlocks}
          </button>
          <button type="button" onClick={() => void session.end()}>
            {t.resetHistory}
          </button>
        </div>
        <p className="hint">{t.startHint}</p>
      </section>

      <section className="quit-row">
        <button type="button" onClick={() => void bridge.app.openLogs()}>
          {t.openLogs}
        </button>
        <button type="button" className="danger" onClick={() => void bridge.app.quit()}>
          {t.quit}
        </button>
        <p className="hint">{t.quitHint}</p>
      </section>
    </main>
  );
}
