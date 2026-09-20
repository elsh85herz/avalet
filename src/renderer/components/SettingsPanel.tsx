import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { MEETING_MODES, type MeetingMode, type ProviderSettingsPublic, type SessionState } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { PROVIDER_PRESETS_UI } from "../providers/presets.js";
import { startAudioCapture, type AudioCaptureHandle } from "../capture/audio-capture.js";
import { IconHelp, IconMoon, IconSun } from "../icons.js";

export function SettingsPanel() {
  const bridge = getBridge();
  const [selectedProviderId, setSelectedProviderId] = useState<string>("anthropic");
  const [providers, setProviders] = useState<ProviderSettingsPublic[]>([]);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [captureHandle, setCaptureHandle] = useState<AudioCaptureHandle | null>(null);
  // Mirrors captureHandle for the reconnect-request listener below, which
  // subscribes once on mount and would otherwise close over a stale null.
  const captureHandleRef = useRef<AudioCaptureHandle | null>(null);
  const [audioDegraded, setAudioDegraded] = useState({ me: false, other: false });
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<{ mic: string; screen: string } | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [preferredMicId, setPreferredMicId] = useState("");
  const [screenSources, setScreenSources] = useState<{ id: string; name: string }[]>([]);
  const [preferredScreenId, setPreferredScreenId] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [contextSaved, setContextSaved] = useState(true);
  const [autoDetectEnabled, setAutoDetectEnabledState] = useState(true);
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("ru");
  const [meetingMode, setMeetingModeState] = useState<MeetingMode>("free");
  const [modeHelpOpen, setModeHelpOpen] = useState(false);
  const [screenshotText, setScreenshotTextState] = useState(false);
  const [ocrAvailable, setOcrAvailable] = useState(false);

  const strings = UI_STRINGS[uiLanguage];
  const t = strings.settings;

  useEffect(() => {
    void refresh();
    void initDeviceDetection();
    void bridge.mic.getPreferred().then(setPreferredMicId);
    void bridge.screen.getPreferred().then(setPreferredScreenId);
    const unsubscribeState = bridge.events.onSessionState(setSessionState);
    // Kept in sync with the overlay's own auto-suggest toggle (see OverlayApp),
    // since it can now be flipped mid-session from either window.
    const unsubscribeAutoDetect = bridge.events.onAutoDetectChanged(setAutoDetectEnabledState);
    const unsubscribeTheme = bridge.events.onThemeChanged((next) => {
      setThemeState(next);
      document.documentElement.dataset.theme = next;
    });
    const unsubscribeLanguage = bridge.events.onUiLanguageChanged(setUiLanguage);
    const unsubscribeMode = bridge.events.onMeetingModeChanged(setMeetingModeState);
    // The overlay can't reach this window's MediaStreams directly — it asks
    // (via main) for whichever channel needs reconnecting, and we're the
    // ones actually holding the live AudioCaptureHandle.
    const unsubscribeReconnect = bridge.events.onReconnectAudioRequested((channel) => {
      void captureHandleRef.current?.reconnect(channel);
    });
    const unsubscribeTranscriptionError = bridge.events.onTranscriptionError(setTranscriptionError);
    const unsubscribeTranscriptionRecovered = bridge.events.onTranscriptionRecovered(() =>
      setTranscriptionError(null),
    );
    return () => {
      unsubscribeState();
      unsubscribeAutoDetect();
      unsubscribeTheme();
      unsubscribeLanguage();
      unsubscribeMode();
      unsubscribeReconnect();
      unsubscribeTranscriptionError();
      unsubscribeTranscriptionRecovered();
    };
  }, []);

  async function refresh() {
    const all = await bridge.settings.getAll();
    setSelectedProviderId(all.selectedProviderId);
    setProviders(all.providers);
    setContextDraft(all.sessionContext);
    setAutoDetectEnabledState(all.autoDetectEnabled);
    setThemeState(all.theme);
    setUiLanguage(all.uiLanguage);
    setMeetingModeState(all.meetingMode);
    setScreenshotTextState(all.screenshotText);
    setOcrAvailable(all.ocrAvailable);
    document.documentElement.dataset.theme = all.theme;
  }

  async function handleToggleScreenshotText() {
    const next = !screenshotText;
    setScreenshotTextState(next);
    await bridge.settings.setScreenshotText(next);
  }

  async function handleModeChange(mode: MeetingMode) {
    setMeetingModeState(mode);
    await bridge.settings.setMeetingMode(mode);
  }

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    await bridge.settings.setTheme(next);
  }

  async function toggleUiLanguage() {
    const next = uiLanguage === "ru" ? "en" : "ru";
    setUiLanguage(next);
    await bridge.settings.setUiLanguage(next);
  }

  async function handleSaveContext() {
    await bridge.settings.setContext(contextDraft);
    setContextSaved(true);
  }

  async function handleToggleAutoDetect() {
    const next = !autoDetectEnabled;
    setAutoDetectEnabledState(next);
    await bridge.settings.setAutoDetect(next);
  }

  async function refreshPermissions() {
    setPermissions(await bridge.permissions.check());
  }

  // Populates both pickers on open without making the user press a button
  // first — but only for whichever of mic/screen access is already granted,
  // so we don't surprise a first-time user with an OS permission prompt
  // before they've hit Start. Whatever isn't granted yet keeps its manual
  // "Detect" button as the fallback.
  async function initDeviceDetection() {
    const perms = await bridge.permissions.check();
    setPermissions(perms);
    if (perms.mic === "granted") void detectMicrophones();
    if (perms.screen === "granted") void detectScreens();
  }

  // Device labels are only populated once mic access has been granted at
  // least once — this doubles as a "detect microphones" action for the user.
  async function detectMicrophones() {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter((d) => d.kind === "audioinput"));
      await refreshPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Screen labels need screen-recording access too (macOS) — same gate as
  // detectMicrophones, just against desktopCapturer instead of getUserMedia.
  async function detectScreens() {
    try {
      const sources = await bridge.screen.listSources();
      setScreenSources(sources);
      await refreshPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleMicChange(deviceId: string) {
    setPreferredMicId(deviceId);
    await bridge.mic.setPreferred(deviceId);
  }

  async function handleScreenChange(sourceId: string) {
    setPreferredScreenId(sourceId);
    await bridge.screen.setPreferred(sourceId);
  }

  const current = providers.find((p) => p.providerId === selectedProviderId);
  const preset = PROVIDER_PRESETS_UI.find((p) => p.id === selectedProviderId);
  const noKeysSavedYet = providers.length > 0 && !providers.some((p) => p.hasApiKey);

  async function handleSelectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    setApiKeyDraft("");
    await bridge.settings.selectProvider(providerId);
  }

  async function handleFieldChange(field: "model" | "baseUrl", value: string) {
    setProviders((prev) =>
      prev.map((p) => (p.providerId === selectedProviderId ? { ...p, [field]: value } : p)),
    );
    await bridge.settings.updateProvider(selectedProviderId, { [field]: value });
  }

  async function handleSaveKey() {
    if (!apiKeyDraft) return;
    await bridge.settings.setApiKey(selectedProviderId, apiKeyDraft);
    setApiKeyDraft("");
    await refresh();
  }

  // Start/Resume: mic + screen permissions are only requested once — if
  // capture is already running (we were merely paused), just unpause.
  async function handleStart() {
    setError(null);
    try {
      let handle = captureHandle;
      if (!handle) {
        handle = await startAudioCapture({
          onDegradedChange: (state) => {
            setAudioDegraded(state);
            void bridge.capture.reportAudioDegraded(state);
          },
        });
        setCaptureHandle(handle);
        captureHandleRef.current = handle;
      }
      await bridge.session.start();
      await refreshPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleReconnectAudio(channel: "me" | "other" | "both") {
    await captureHandleRef.current?.reconnect(channel);
  }

  // Stop only pauses generation — the overlay keeps every block already
  // shown so it can be paged through, and mic/screen stay granted so Resume
  // is instant. Full teardown happens in handleReset.
  async function handleStop() {
    await bridge.session.stop();
  }

  async function handleReset() {
    captureHandle?.stop();
    setCaptureHandle(null);
    captureHandleRef.current = null;
    setAudioDegraded({ me: false, other: false });
    setTranscriptionError(null);
    await bridge.session.stop();
    await bridge.session.reset();
  }

  const degradedChannel = audioDegraded.me && audioDegraded.other ? "both" : audioDegraded.other ? "other" : "me";
  const degradedMessage =
    degradedChannel === "both" ? t.audioLostBoth : degradedChannel === "other" ? t.audioLostOther : t.audioLostMe;

  return (
    <main className="settings">
      <header>
        <div className="header-row">
          <h1>Avalet</h1>
          <div className="header-controls">
            <button
              type="button"
              className="lang-btn"
              onClick={() => void toggleUiLanguage()}
              title={UI_STRINGS[uiLanguage].uiLangTitle}
            >
              {uiLanguage === "ru" ? "RU" : "EN"}
            </button>
            <button
              type="button"
              className="theme-btn"
              onClick={() => void toggleTheme()}
              title={theme === "dark" ? t.themeToLight : t.themeToDark}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
        <p className="subtitle">{t.subtitle}</p>
      </header>

      {noKeysSavedYet ? <div className="onboarding-banner">{t.onboarding}</div> : null}

      <section className="providers">
        {PROVIDER_PRESETS_UI.map((p) => {
          const settings = providers.find((s) => s.providerId === p.id);
          return (
            <label key={p.id} className={`provider-row ${selectedProviderId === p.id ? "active" : ""}`}>
              <input
                type="radio"
                name="provider"
                checked={selectedProviderId === p.id}
                onChange={() => void handleSelectProvider(p.id)}
              />
              <span>{p.label}</span>
              {settings?.hasApiKey ? <span className="badge">{t.keySaved}</span> : null}
            </label>
          );
        })}
      </section>

      {current && preset ? (
        <section className="provider-config">
          <label>
            {t.model}
            <input
              type="text"
              value={current.model}
              placeholder={preset.modelPlaceholder}
              onChange={(e) => void handleFieldChange("model", e.target.value)}
            />
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
        </section>
      ) : null}

      <section className="permissions">
        <div className="perm-row">
          <span>{t.microphone}</span>
          <span className={`perm-pill ${permissions?.mic ?? "unknown"}`}>{permissions?.mic ?? "…"}</span>
        </div>
        <div className="perm-row">
          <span>{t.screenRecording}</span>
          <span className={`perm-pill ${permissions?.screen ?? "unknown"}`}>{permissions?.screen ?? "…"}</span>
        </div>
        <div className="mic-picker">
          <select value={preferredMicId} onChange={(e) => void handleMicChange(e.target.value)}>
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
          <select value={preferredScreenId} onChange={(e) => void handleScreenChange(e.target.value)}>
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
        {captureHandle && (audioDegraded.me || audioDegraded.other) ? (
          <div className="degraded-banner">
            <span>{degradedMessage}</span>
            <button type="button" onClick={() => void handleReconnectAudio(degradedChannel)}>
              {t.reconnect}
            </button>
          </div>
        ) : null}
        {transcriptionError ? (
          <div className="degraded-banner">
            <span>
              {t.transcriptionErrorPrefix} {transcriptionError}
            </span>
          </div>
        ) : null}
      </section>

      <section className="context">
        <div className="mode-select">
          <div className="mode-label-row">
            <span>{strings.modeLabel}</span>
            <button
              type="button"
              className={`help-btn ${modeHelpOpen ? "on" : ""}`}
              onClick={() => setModeHelpOpen((v) => !v)}
              title={t.modeHelpTitle}
            >
              <IconHelp />
            </button>
          </div>
          <select value={meetingMode} onChange={(e) => void handleModeChange(e.target.value as MeetingMode)}>
            {MEETING_MODES.map((mode) => (
              <option key={mode} value={mode} title={strings.modeHelp[mode]}>
                {strings.modes[mode]}
              </option>
            ))}
          </select>
          <p className="hint">{strings.modeHelp[meetingMode]}</p>
          {modeHelpOpen ? (
            <dl className="mode-help">
              {MEETING_MODES.map((mode) => (
                <div key={mode} className={mode === meetingMode ? "active" : ""}>
                  <dt>{strings.modes[mode]}</dt>
                  <dd>{strings.modeHelp[mode]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <label>
          {t.contextLabel} <span className="optional">{t.contextOptional}</span>
          <textarea
            value={contextDraft}
            onChange={(e) => {
              setContextDraft(e.target.value);
              setContextSaved(false);
            }}
            placeholder={t.contextPlaceholder}
            rows={4}
          />
        </label>
        <button type="button" onClick={() => void handleSaveContext()} disabled={contextSaved}>
          {contextSaved ? t.contextSaved : t.contextSave}
        </button>
      </section>

      <section className="session-controls">
        <label className="auto-detect-toggle">
          <span className="switch">
            <input type="checkbox" checked={autoDetectEnabled} onChange={() => void handleToggleAutoDetect()} />
          </span>
          {t.autoSuggest}
        </label>
        <p className="hint">{autoDetectEnabled ? t.autoSuggestOnHint : t.autoSuggestOffHint}</p>
        <label className="auto-detect-toggle">
          <span className="switch">
            <input
              type="checkbox"
              checked={screenshotText && ocrAvailable}
              disabled={!ocrAvailable}
              onChange={() => void handleToggleScreenshotText()}
            />
          </span>
          {t.screenshotText}
        </label>
        <p className="hint">
          {!ocrAvailable ? t.screenshotTextUnavailable : screenshotText ? t.screenshotTextOn : t.screenshotTextOff}
        </p>
        <p className="state">
          {t.sessionLabel}: {sessionState}
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="buttons">
          <button type="button" onClick={() => void handleStart()} disabled={sessionState === "listening"}>
            {sessionState === "paused" ? t.resume : t.start}
          </button>
          <button type="button" onClick={() => void handleStop()} disabled={sessionState !== "listening"}>
            {t.stop}
          </button>
          <button type="button" onClick={() => void bridge.history.clear()} title={t.clearBlocksTitle}>
            {t.clearBlocks}
          </button>
          <button type="button" onClick={() => void handleReset()}>
            {t.resetHistory}
          </button>
        </div>
        <p className="hint">{t.startHint}</p>
      </section>

      <section className="quit-row">
        <button type="button" className="danger" onClick={() => void bridge.app.quit()}>
          {t.quit}
        </button>
        <p className="hint">{t.quitHint}</p>
      </section>
    </main>
  );
}
