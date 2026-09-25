import { contextBridge, ipcRenderer } from "electron";

type ProviderSettingsPublic = {
  providerId: string;
  model: string;
  baseUrl?: string;
  hasApiKey: boolean;
};

type LiveBlockEvent = { id: string };
type LiveBlockDeltaEvent = { id: string; delta: string };
type LiveBlockErrorEvent = { id: string; message: string };
type SessionState = "idle" | "listening" | "paused";
type HistoryBlock = { id: string; text: string; status: "done" | "error"; createdAt: number };
type MeetingMode = "free" | "requirements" | "grooming" | "demo" | "interview";
type TranscriptSegment = { at: number; speaker: "me" | "other"; text: string };
type AgendaStatusItem = { question: string; closed: boolean; note: string };
type ActionItem = { task: string; owner: string; due: string };
type Meeting = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  context: string;
  transcript: TranscriptSegment[];
  summary?: string;
  summaryAt?: number;
  agenda?: string[];
  agendaStatus?: AgendaStatusItem[];
  actions?: ActionItem[];
};
type MeetingListItem = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  segmentCount: number;
  hasSummary: boolean;
};
type ExportLabels = {
  me: string;
  other: string;
  summary: string;
  transcript: string;
  date: string;
  mode: string;
  participants: string;
  agenda: string;
  discussions: string;
  actions: string;
  actionTask: string;
  actionOwner: string;
  actionDue: string;
  agendaClosed: string;
  agendaOpen: string;
};

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.removeListener(channel, listener as never);
}

const api = {
  settings: {
    getAll: (): Promise<{
      selectedProviderId: string;
      providers: ProviderSettingsPublic[];
      sessionContext: string;
      agendaText: string;
      autoDetectEnabled: boolean;
      overlayOpacity: number;
      theme: "dark" | "light";
      uiLanguage: "ru" | "en";
      meetingMode: MeetingMode;
      mainPinned: boolean;
      screenshotText: boolean;
      ocrAvailable: boolean;
      speechLanguage: "ru" | "en" | "auto";
      speechModel: "small" | "medium" | "turbo";
    }> => ipcRenderer.invoke("avalet:settings-get-all"),
    setSpeech: (patch: { language?: "ru" | "en" | "auto"; model?: "small" | "medium" | "turbo" }): Promise<void> =>
      ipcRenderer.invoke("avalet:speech-set", patch),
    setScreenshotText: (enabled: boolean): Promise<void> => ipcRenderer.invoke("avalet:screenshot-text-set", enabled),
    setMainPinned: (pinned: boolean): Promise<void> => ipcRenderer.invoke("avalet:main-set-pinned", pinned),
    setMeetingMode: (mode: MeetingMode): Promise<void> => ipcRenderer.invoke("avalet:meeting-mode-set", mode),
    selectProvider: (providerId: string): Promise<void> =>
      ipcRenderer.invoke("avalet:settings-select-provider", providerId),
    updateProvider: (providerId: string, patch: { model?: string; baseUrl?: string }): Promise<void> =>
      ipcRenderer.invoke("avalet:settings-update-provider", providerId, patch),
    setApiKey: (providerId: string, apiKey: string): Promise<void> =>
      ipcRenderer.invoke("avalet:settings-set-api-key", providerId, apiKey),
    setContext: (text: string): Promise<void> => ipcRenderer.invoke("avalet:context-set", text),
    setAgenda: (text: string): Promise<void> => ipcRenderer.invoke("avalet:agenda-set", text),
    setAutoDetect: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke("avalet:auto-detect-set", enabled),
    setTheme: (theme: "dark" | "light"): Promise<void> => ipcRenderer.invoke("avalet:theme-set", theme),
    setUiLanguage: (language: "ru" | "en"): Promise<void> =>
      ipcRenderer.invoke("avalet:ui-language-set", language),
  },
  session: {
    start: (): Promise<void> => ipcRenderer.invoke("avalet:session-start"),
    stop: (): Promise<void> => ipcRenderer.invoke("avalet:session-stop"),
    reset: (): Promise<void> => ipcRenderer.invoke("avalet:session-reset"),
    ask: (question: string): Promise<void> => ipcRenderer.invoke("avalet:session-ask", question),
    askScreen: (): Promise<void> => ipcRenderer.invoke("avalet:session-ask-screen"),
    processNow: (): Promise<void> => ipcRenderer.invoke("avalet:session-process-now"),
    getState: (): Promise<SessionState> => ipcRenderer.invoke("avalet:session-get-state"),
  },
  capture: {
    screenshot: (): Promise<{ base64: string; width: number; height: number }> =>
      ipcRenderer.invoke("avalet:capture-screenshot"),
    enableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke("enable-loopback-audio"),
    disableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke("disable-loopback-audio"),
    submitAudioChunk: (
      audioBase64: string,
      channel: "me" | "other",
      meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
    ): Promise<void> => ipcRenderer.invoke("avalet:capture-audio-chunk", audioBase64, channel, meta),
    reportAudioDegraded: (state: { me: boolean; other: boolean }): Promise<void> =>
      ipcRenderer.invoke("avalet:audio-degraded-set", state),
    requestReconnect: (channel: "me" | "other" | "both"): Promise<void> =>
      ipcRenderer.invoke("avalet:capture-reconnect-request", channel),
  },
  permissions: {
    check: (): Promise<{ mic: string; screen: string }> => ipcRenderer.invoke("avalet:permissions-check"),
  },
  mic: {
    getPreferred: (): Promise<string> => ipcRenderer.invoke("avalet:mic-get-preferred"),
    setPreferred: (deviceId: string): Promise<void> =>
      ipcRenderer.invoke("avalet:mic-set-preferred", deviceId),
  },
  screen: {
    listSources: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke("avalet:screen-list-sources"),
    getPreferred: (): Promise<string> => ipcRenderer.invoke("avalet:screen-get-preferred"),
    setPreferred: (sourceId: string): Promise<void> =>
      ipcRenderer.invoke("avalet:screen-set-preferred", sourceId),
  },
  overlay: {
    show: (): Promise<void> => ipcRenderer.invoke("avalet:overlay-show"),
    hide: (): Promise<void> => ipcRenderer.invoke("avalet:overlay-hide"),
    setClickThrough: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke("avalet:overlay-click-through", enabled),
    setOpacity: (opacity: number): Promise<void> =>
      ipcRenderer.invoke("avalet:overlay-set-opacity", opacity),
    setCollapsed: (collapsed: boolean): Promise<void> =>
      ipcRenderer.invoke("avalet:overlay-set-collapsed", collapsed),
  },
  app: {
    toggleMainWindow: (): Promise<void> => ipcRenderer.invoke("avalet:main-toggle"),
    quit: (): Promise<void> => ipcRenderer.invoke("avalet:app-quit"),
  },
  history: {
    clear: (): Promise<void> => ipcRenderer.invoke("avalet:history-clear"),
    get: (): Promise<HistoryBlock[]> => ipcRenderer.invoke("avalet:history-get"),
    append: (block: { id: string; text: string; status: "done" | "error" }): Promise<void> =>
      ipcRenderer.invoke("avalet:history-append", block),
  },
  meetings: {
    list: (): Promise<MeetingListItem[]> => ipcRenderer.invoke("avalet:meetings-list"),
    current: (): Promise<Meeting | null> => ipcRenderer.invoke("avalet:meetings-current"),
    get: (id: string): Promise<Meeting | null> => ipcRenderer.invoke("avalet:meetings-get", id),
    rename: (id: string, title: string): Promise<void> => ipcRenderer.invoke("avalet:meetings-rename", id, title),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("avalet:meetings-delete", id),
    summarize: (id: string): Promise<string> => ipcRenderer.invoke("avalet:meetings-summarize", id),
    export: (id: string, labels: ExportLabels, modeLabel: string): Promise<string | null> =>
      ipcRenderer.invoke("avalet:meetings-export", id, labels, modeLabel),
    exportTranscript: (id: string, labels: ExportLabels): Promise<string | null> =>
      ipcRenderer.invoke("avalet:meetings-export-transcript", id, labels),
    setAgenda: (id: string, agenda: string[]): Promise<Meeting | null> =>
      ipcRenderer.invoke("avalet:meetings-set-agenda", id, agenda),
    toText: (id: string, labels: ExportLabels, modeLabel: string): Promise<string> =>
      ipcRenderer.invoke("avalet:meetings-to-text", id, labels, modeLabel),
  },
  events: {
    onBlockStart: (cb: (e: LiveBlockEvent) => void) => on("avalet:event:block-start", cb),
    onBlockDelta: (cb: (e: LiveBlockDeltaEvent) => void) => on("avalet:event:block-delta", cb),
    onBlockDone: (cb: (e: LiveBlockEvent) => void) => on("avalet:event:block-done", cb),
    onBlockError: (cb: (e: LiveBlockErrorEvent) => void) => on("avalet:event:block-error", cb),
    onSessionState: (cb: (state: SessionState) => void) => on("avalet:event:session-state", cb),
    onHistoryCleared: (cb: () => void) => on("avalet:event:history-cleared", cb),
    onAutoDetectChanged: (cb: (enabled: boolean) => void) => on("avalet:event:auto-detect-changed", cb),
    onThemeChanged: (cb: (theme: "dark" | "light") => void) => on("avalet:event:theme-changed", cb),
    onUiLanguageChanged: (cb: (language: "ru" | "en") => void) =>
      on("avalet:event:ui-language-changed", cb),
    onAudioDegraded: (cb: (state: { me: boolean; other: boolean }) => void) =>
      on("avalet:event:audio-degraded", cb),
    onReconnectAudioRequested: (cb: (channel: "me" | "other" | "both") => void) =>
      on("avalet:event:reconnect-audio-requested", cb),
    onTranscriptionError: (cb: (message: string) => void) => on("avalet:event:transcription-error", cb),
    onTranscriptionRecovered: (cb: () => void) => on("avalet:event:transcription-recovered", cb),
    onMeetingModeChanged: (cb: (mode: MeetingMode) => void) => on("avalet:event:meeting-mode-changed", cb),
    onTranscriptSegment: (cb: (segment: TranscriptSegment) => void) => on("avalet:event:transcript-segment", cb),
    onMeetingStarted: (cb: (meeting: Meeting) => void) => on("avalet:event:meeting-started", cb),
    onMeetingEnded: (cb: (meeting: Meeting | null) => void) => on("avalet:event:meeting-ended", cb),
    onSummaryDelta: (cb: (e: { id: string; delta: string }) => void) => on("avalet:event:summary-delta", cb),
    onSummaryDone: (
      cb: (e: { id: string; text: string; agendaStatus: AgendaStatusItem[] | null; actions: ActionItem[] | null }) => void,
    ) => on("avalet:event:summary-done", cb),
    onSummaryError: (cb: (e: { id: string; message: string }) => void) => on("avalet:event:summary-error", cb),
  },
};

contextBridge.exposeInMainWorld("avalet", api);

export type AvaletBridge = typeof api;
