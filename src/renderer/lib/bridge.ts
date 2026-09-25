import type {
  ActionItem,
  AgendaStatusItem,
  ExportLabels,
  HistoryBlock,
  LiveBlockDeltaEvent,
  LiveBlockErrorEvent,
  LiveBlockEvent,
  Meeting,
  MeetingListItem,
  MeetingMode,
  ProviderSettingsPublic,
  SessionState,
  TranscriptSegment,
} from "./types.js";

type AvaletBridge = {
  settings: {
    getAll: () => Promise<{
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
    }>;
    setSpeech: (patch: { language?: "ru" | "en" | "auto"; model?: "small" | "medium" | "turbo" }) => Promise<void>;
    setScreenshotText: (enabled: boolean) => Promise<void>;
    setMainPinned: (pinned: boolean) => Promise<void>;
    setMeetingMode: (mode: MeetingMode) => Promise<void>;
    selectProvider: (providerId: string) => Promise<void>;
    updateProvider: (providerId: string, patch: { model?: string; baseUrl?: string }) => Promise<void>;
    setApiKey: (providerId: string, apiKey: string) => Promise<void>;
    setContext: (text: string) => Promise<void>;
    setAgenda: (text: string) => Promise<void>;
    setAutoDetect: (enabled: boolean) => Promise<void>;
    setTheme: (theme: "dark" | "light") => Promise<void>;
    setUiLanguage: (language: "ru" | "en") => Promise<void>;
  };
  session: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    reset: () => Promise<void>;
    ask: (question: string) => Promise<void>;
    /** Prioritizes a fresh screenshot, combined with the transcript. */
    askScreen: () => Promise<void>;
    /** Manually flushes whatever's been transcribed so far into a block —
     * for when auto-suggest is off and nothing triggers on its own. */
    processNow: () => Promise<void>;
    getState: () => Promise<SessionState>;
  };
  capture: {
    screenshot: () => Promise<{ base64: string; width: number; height: number }>;
    enableLoopbackAudio: () => Promise<void>;
    disableLoopbackAudio: () => Promise<void>;
    submitAudioChunk: (
      audioBase64: string,
      channel: "me" | "other",
      meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
    ) => Promise<void>;
    reportAudioDegraded: (state: { me: boolean; other: boolean }) => Promise<void>;
    requestReconnect: (channel: "me" | "other" | "both") => Promise<void>;
  };
  permissions: {
    check: () => Promise<{ mic: string; screen: string }>;
  };
  mic: {
    getPreferred: () => Promise<string>;
    setPreferred: (deviceId: string) => Promise<void>;
  };
  screen: {
    listSources: () => Promise<{ id: string; name: string }[]>;
    getPreferred: () => Promise<string>;
    setPreferred: (sourceId: string) => Promise<void>;
  };
  overlay: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    setClickThrough: (enabled: boolean) => Promise<void>;
    setOpacity: (opacity: number) => Promise<void>;
    setCollapsed: (collapsed: boolean) => Promise<void>;
  };
  app: {
    toggleMainWindow: () => Promise<void>;
    quit: () => Promise<void>;
  };
  history: {
    clear: () => Promise<void>;
    get: () => Promise<HistoryBlock[]>;
    append: (block: { id: string; text: string; status: "done" | "error" }) => Promise<void>;
  };
  meetings: {
    list: () => Promise<MeetingListItem[]>;
    current: () => Promise<Meeting | null>;
    get: (id: string) => Promise<Meeting | null>;
    rename: (id: string, title: string) => Promise<void>;
    delete: (id: string) => Promise<void>;
    summarize: (id: string) => Promise<string>;
    export: (id: string, labels: ExportLabels, modeLabel: string) => Promise<string | null>;
    exportTranscript: (id: string, labels: ExportLabels) => Promise<string | null>;
    setAgenda: (id: string, agenda: string[]) => Promise<Meeting | null>;
    toText: (id: string, labels: ExportLabels, modeLabel: string) => Promise<string>;
  };
  events: {
    onBlockStart: (cb: (e: LiveBlockEvent) => void) => () => void;
    onBlockDelta: (cb: (e: LiveBlockDeltaEvent) => void) => () => void;
    onBlockDone: (cb: (e: LiveBlockEvent) => void) => () => void;
    onBlockError: (cb: (e: LiveBlockErrorEvent) => void) => () => void;
    onSessionState: (cb: (state: SessionState) => void) => () => void;
    onHistoryCleared: (cb: () => void) => () => void;
    onAutoDetectChanged: (cb: (enabled: boolean) => void) => () => void;
    onThemeChanged: (cb: (theme: "dark" | "light") => void) => () => void;
    onUiLanguageChanged: (cb: (language: "ru" | "en") => void) => () => void;
    onAudioDegraded: (cb: (state: { me: boolean; other: boolean }) => void) => () => void;
    onReconnectAudioRequested: (cb: (channel: "me" | "other" | "both") => void) => () => void;
    onTranscriptionError: (cb: (message: string) => void) => () => void;
    onTranscriptionRecovered: (cb: () => void) => () => void;
    onMeetingModeChanged: (cb: (mode: MeetingMode) => void) => () => void;
    onTranscriptSegment: (cb: (segment: TranscriptSegment) => void) => () => void;
    onMeetingStarted: (cb: (meeting: Meeting) => void) => () => void;
    onMeetingEnded: (cb: (meeting: Meeting | null) => void) => () => void;
    onSummaryDelta: (cb: (e: { id: string; delta: string }) => void) => () => void;
    onSummaryDone: (
      cb: (e: { id: string; text: string; agendaStatus: AgendaStatusItem[] | null; actions: ActionItem[] | null }) => void,
    ) => () => void;
    onSummaryError: (cb: (e: { id: string; message: string }) => void) => () => void;
  };
};

declare global {
  interface Window {
    avalet?: AvaletBridge;
  }
}

export function getBridge(): AvaletBridge {
  const bridge = window.avalet;
  if (!bridge) throw new Error("Avalet bridge unavailable: preload.cjs did not load");
  return bridge;
}

export type { AvaletBridge };
