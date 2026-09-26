import { contextBridge, ipcRenderer } from "electron";
import type { AvaletApi, EventChannel, EventMap, InvokeArgs, InvokeChannel, InvokeResult } from "./shared/ipc-contract.js";

// Channel names and payload types come from shared/ipc-contract.ts; this file
// only wires them up. `api` is typed as AvaletApi, so a method that is missing,
// extra, or calls a channel with the wrong arguments fails the typecheck.

function invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args);
}

function on<C extends EventChannel>(channel: C) {
  return (callback: (payload: EventMap[C]) => void) => {
    const listener = (_event: unknown, payload: EventMap[C]) => callback(payload);
    ipcRenderer.on(channel, listener as never);
    return () => {
      ipcRenderer.removeListener(channel, listener as never);
    };
  };
}

const api: AvaletApi = {
  settings: {
    getAll: () => invoke("avalet:settings-get-all"),
    setSpeech: (patch) => invoke("avalet:speech-set", patch),
    setScreenshotText: (enabled) => invoke("avalet:screenshot-text-set", enabled),
    setLiveTracker: (enabled) => invoke("avalet:live-tracker-set", enabled),
    setUiLevel: (level) => invoke("avalet:ui-level-set", level),
    setOnboardingDone: (done) => invoke("avalet:onboarding-set", done),
    setMainPinned: (pinned) => invoke("avalet:main-set-pinned", pinned),
    setMeetingMode: (mode) => invoke("avalet:meeting-mode-set", mode),
    selectProvider: (providerId) => invoke("avalet:settings-select-provider", providerId),
    updateProvider: (providerId, patch) => invoke("avalet:settings-update-provider", providerId, patch),
    setApiKey: (providerId, apiKey) => invoke("avalet:settings-set-api-key", providerId, apiKey),
    setContext: (text) => invoke("avalet:context-set", text),
    setAgenda: (text) => invoke("avalet:agenda-set", text),
    setAutoDetect: (enabled) => invoke("avalet:auto-detect-set", enabled),
    setTheme: (theme) => invoke("avalet:theme-set", theme),
    setUiLanguage: (language) => invoke("avalet:ui-language-set", language),
  },
  speech: {
    models: () => invoke("avalet:speech-models"),
    download: (model) => invoke("avalet:speech-model-download", model),
    cancel: (model) => invoke("avalet:speech-model-cancel", model),
    remove: (model) => invoke("avalet:speech-model-delete", model),
  },
  session: {
    start: () => invoke("avalet:session-start"),
    stop: () => invoke("avalet:session-stop"),
    reset: () => invoke("avalet:session-reset"),
    ask: (question) => invoke("avalet:session-ask", question),
    askScreen: () => invoke("avalet:session-ask-screen"),
    processNow: () => invoke("avalet:session-process-now"),
    getState: () => invoke("avalet:session-get-state"),
  },
  capture: {
    screenshot: () => invoke("avalet:capture-screenshot"),
    enableLoopbackAudio: () => invoke("enable-loopback-audio"),
    disableLoopbackAudio: () => invoke("disable-loopback-audio"),
    submitAudioChunk: (audioBase64, channel, meta) => invoke("avalet:capture-audio-chunk", audioBase64, channel, meta),
    reportAudioDegraded: (state) => invoke("avalet:audio-degraded-set", state),
    requestReconnect: (channel) => invoke("avalet:capture-reconnect-request", channel),
  },
  permissions: {
    check: () => invoke("avalet:permissions-check"),
  },
  mic: {
    getPreferred: () => invoke("avalet:mic-get-preferred"),
    setPreferred: (deviceId) => invoke("avalet:mic-set-preferred", deviceId),
  },
  screen: {
    listSources: () => invoke("avalet:screen-list-sources"),
    getPreferred: () => invoke("avalet:screen-get-preferred"),
    setPreferred: (sourceId) => invoke("avalet:screen-set-preferred", sourceId),
  },
  overlay: {
    show: () => invoke("avalet:overlay-show"),
    hide: () => invoke("avalet:overlay-hide"),
    setClickThrough: (enabled) => invoke("avalet:overlay-click-through", enabled),
    setOpacity: (opacity) => invoke("avalet:overlay-set-opacity", opacity),
    setCollapsed: (collapsed) => invoke("avalet:overlay-set-collapsed", collapsed),
  },
  app: {
    toggleMainWindow: () => invoke("avalet:main-toggle"),
    quit: () => invoke("avalet:app-quit"),
  },
  tracker: {
    get: () => invoke("avalet:tracker-get"),
    refresh: () => invoke("avalet:tracker-refresh"),
    toggleAgenda: (index) => invoke("avalet:tracker-toggle-agenda", index),
    addAgenda: (text) => invoke("avalet:tracker-add-agenda", text),
    setAction: (id, state) => invoke("avalet:tracker-set-action", id, state),
    addAction: (text) => invoke("avalet:tracker-add-action", text),
  },
  history: {
    clear: () => invoke("avalet:history-clear"),
    get: () => invoke("avalet:history-get"),
    append: (block) => invoke("avalet:history-append", block),
  },
  meetings: {
    list: () => invoke("avalet:meetings-list"),
    current: () => invoke("avalet:meetings-current"),
    get: (id) => invoke("avalet:meetings-get", id),
    rename: (id, title) => invoke("avalet:meetings-rename", id, title),
    delete: (id) => invoke("avalet:meetings-delete", id),
    summarize: (id) => invoke("avalet:meetings-summarize", id),
    export: (id, labels, modeLabel) => invoke("avalet:meetings-export", id, labels, modeLabel),
    exportTranscript: (id, labels) => invoke("avalet:meetings-export-transcript", id, labels),
    setAgenda: (id, agenda) => invoke("avalet:meetings-set-agenda", id, agenda),
    toText: (id, labels, modeLabel) => invoke("avalet:meetings-to-text", id, labels, modeLabel),
  },
  events: {
    onBlockStart: on("avalet:event:block-start"),
    onBlockDelta: on("avalet:event:block-delta"),
    onBlockDone: on("avalet:event:block-done"),
    onBlockError: on("avalet:event:block-error"),
    onSessionState: on("avalet:event:session-state"),
    onHistoryCleared: on("avalet:event:history-cleared"),
    onAutoDetectChanged: on("avalet:event:auto-detect-changed"),
    onThemeChanged: on("avalet:event:theme-changed"),
    onOpacityChanged: on("avalet:event:opacity-changed"),
    onUiLanguageChanged: on("avalet:event:ui-language-changed"),
    onUiLevelChanged: on("avalet:event:ui-level-changed"),
    onAudioDegraded: on("avalet:event:audio-degraded"),
    onReconnectAudioRequested: on("avalet:event:reconnect-audio-requested"),
    onTranscriptionError: on("avalet:event:transcription-error"),
    onTranscriptionRecovered: on("avalet:event:transcription-recovered"),
    onModelsChanged: on("avalet:event:models-changed"),
    onMeetingModeChanged: on("avalet:event:meeting-mode-changed"),
    onTranscriptSegment: on("avalet:event:transcript-segment"),
    onMeetingStarted: on("avalet:event:meeting-started"),
    onMeetingEnded: on("avalet:event:meeting-ended"),
    onSummaryDelta: on("avalet:event:summary-delta"),
    onSummaryDone: on("avalet:event:summary-done"),
    onTrackerUpdate: on("avalet:event:tracker-update"),
    onSummaryError: on("avalet:event:summary-error"),
  },
};

contextBridge.exposeInMainWorld("avalet", api);
