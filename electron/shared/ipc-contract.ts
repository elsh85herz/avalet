// Single source of truth for everything that crosses the IPC boundary.
//
// The main process (electron/main.ts), the preload bridge (electron/preload.cts)
// and the renderer (src/renderer/lib/bridge.ts, src/renderer/lib/types.ts) all
// import from here, so a channel or payload that changes in one place and not
// in the others fails `npm run typecheck`. Types and a few constant lists only:
// no Electron, no Node, safe to bundle into the renderer.

export type MeetingMode = "free" | "requirements" | "grooming" | "demo" | "review" | "interview";
export const MEETING_MODES: MeetingMode[] = ["free", "requirements", "grooming", "demo", "review", "interview"];

export type SpeechLanguage = "ru" | "en" | "auto";
export const SPEECH_LANGUAGES: SpeechLanguage[] = ["ru", "en", "auto"];
export type SpeechModelName = "small" | "medium" | "turbo";
export const SPEECH_MODELS: SpeechModelName[] = ["small", "medium", "turbo"];

export type Theme = "dark" | "light";
export type UiLanguage = "ru" | "en";
export type UiLevel = "simple" | "advanced";
export type SessionState = "idle" | "listening" | "paused";
export type AudioChannel = "me" | "other";
export type PermissionStatus = "granted" | "denied" | "restricted" | "not-determined" | "unknown";

export type ProviderSettingsPublic = {
  providerId: string;
  model: string;
  /** Model for background calls (live checklist); empty means "same as model". */
  backgroundModel: string;
  baseUrl?: string;
  hasApiKey: boolean;
};

export type SettingsSnapshot = {
  selectedProviderId: string;
  providers: ProviderSettingsPublic[];
  sessionContext: string;
  agendaText: string;
  autoDetectEnabled: boolean;
  overlayOpacity: number;
  theme: Theme;
  uiLanguage: UiLanguage;
  uiLevel: UiLevel;
  /** True when AVALET_ADVANCED=1 forces the Advanced level for this launch. */
  uiLevelForced: boolean;
  onboardingDone: boolean;
  meetingMode: MeetingMode;
  mainPinned: boolean;
  screenshotText: boolean;
  ocrAvailable: boolean;
  speechLanguage: SpeechLanguage;
  speechModel: SpeechModelName;
  /** Effective value: the stored choice, or the default for the current level. */
  liveTrackerEnabled: boolean;
  /** process.platform of the main process ("darwin" on a Mac). */
  platform: string;
  /** Test mode: audio comes from a fake feeder in the main process, not from the mic. */
  fakeCapture: boolean;
  /** Folder the save dialog opens in for exports (chosen in Settings, default Documents). */
  exportDir: string;
  /** The built-in "Avalet" provider exists in this build (a billing server is configured). */
  builtInProviderAvailable: boolean;
};

export type LiveBlockEvent = { id: string };
export type LiveBlockDeltaEvent = { id: string; delta: string };
/** code "paywall": the call was refused for budget or plan reasons; the overlay shows the offer instead of text. */
export type LiveBlockErrorEvent = { id: string; message: string; code?: "paywall" };
export type HistoryBlock = { id: string; text: string; status: "done" | "error"; createdAt: number };

export type TranscriptSegment = { at: number; speaker: AudioChannel; text: string };

export type AgendaStatusItem = {
  question: string;
  closed: boolean;
  note: string;
  /** Being discussed right now (live tracker only). */
  active?: boolean;
  /** Set by the analyst by hand: the tracker and the summary leave it alone. */
  manual?: boolean;
};
/** proposed = found by the model, waiting for the analyst; a missing state means confirmed (older records). */
export type ActionState = "proposed" | "confirmed" | "dismissed";
export type ActionItem = { task: string; owner: string; due: string; id?: string; state?: ActionState };
export type TrackerState = {
  meetingId: string | null;
  agendaStatus: AgendaStatusItem[];
  actions: ActionItem[];
  busy: boolean;
  /** False when the live checklist is switched off: agenda marks stay manual. */
  enabled: boolean;
};

export type Meeting = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  context: string;
  transcript: TranscriptSegment[];
  summary?: string;
  summaryAt?: number;
  /** Questions to get answered on this call, one per entry; may be edited during the meeting. */
  agenda?: string[];
  /** Per-question outcome: closed or still open. */
  agendaStatus?: AgendaStatusItem[];
  /** Action points. */
  actions?: ActionItem[];
};

export type MeetingListItem = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  segmentCount: number;
  hasSummary: boolean;
};

export type ExportLabels = {
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

export type SummaryDoneEvent = {
  id: string;
  text: string;
  agendaStatus: AgendaStatusItem[] | null;
  actions: ActionItem[] | null;
};

// --- speech models ---

/**
 * absent: not on disk (maybe partly downloaded: bytes > 0, a new download resumes);
 * downloading: in progress, `percent` is live; ready: on disk, usable offline;
 * error: the last download failed after its retries, `error` says why.
 */
export type SpeechModelState = "absent" | "downloading" | "ready" | "error";
export type SpeechModelRow = {
  name: SpeechModelName;
  state: SpeechModelState;
  bytes: number;
  sizeBytes: number;
  percent: number;
  error?: string;
  /** Retry attempt of the running download (1 = first try). */
  attempt?: number;
};

export type StartResult = { ok: true } | { ok: false; reason: "model-missing"; model: SpeechModelName };

// --- token metering ---

export type UsagePurpose = "suggestion" | "tracker" | "summary" | "screenshot";
export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  /** Tokens times the model weight (flash x1, premium x4): what an Avalet budget counts. */
  weighted: number;
  calls: number;
  /** Calls whose provider sent no usage: their numbers are a local estimate. */
  estimatedCalls: number;
};
export type UsageSummary = {
  /** "2026-09" */
  month: string;
  own: UsageTotals;
  avalet: UsageTotals;
  byPurpose: Record<UsagePurpose, UsageTotals>;
  /** Weighted tokens spent on the trial so far (local count). */
  trialWeighted: number;
  /** The running (or last) meeting, when there is one. */
  meeting: UsageTotals | null;
  recent: Array<{
    at: number;
    model: string;
    purpose: UsagePurpose;
    inputTokens: number;
    outputTokens: number;
    weighted: number;
    estimated: boolean;
    tier: "own" | "avalet";
  }>;
};

// --- access and billing ---

/**
 * Derived, never stored. own: the user's provider key, free and unlimited.
 * trial / pro: the built-in Avalet provider with a budget. none: the Avalet
 * provider is selected but there is no usable plan.
 */
export type AccessTier = "own" | "trial" | "pro" | "none";
export type AccessStatus =
  | "ok"
  /** Own-key mode, but the selected provider has no key yet. */
  | "no-key"
  /** Avalet selected, never activated on this install. */
  | "not-activated"
  /** Budget used up: offer buying more or switching to an own key. */
  | "exhausted"
  /** Paid period over and not renewed. */
  | "expired"
  /** Server unreachable, last token still valid: works until graceEndsAt. */
  | "offline-grace"
  /** Server unreachable for longer than the grace period: back to own key. */
  | "offline-expired"
  /** The server's answer did not verify (tampered or foreign token). */
  | "invalid";

export type AccessState = {
  mode: "own" | "avalet";
  tier: AccessTier;
  status: AccessStatus;
  /** Live calls through the Avalet provider are allowed right now. */
  canUseAvalet: boolean;
  /** Whether this install has ever held an Avalet token (trial started). */
  activated: boolean;
  plan: "trial" | "pro" | "none" | null;
  budget: number;
  used: number;
  remaining: number;
  periodEnd: number | null;
  renews: boolean;
  lastSyncAt: number | null;
  graceEndsAt: number | null;
  price: { amount: number; currency: string; period: "month" };
  proBudget: number;
  trialBudget: number;
  /** A checkout was opened in the browser and is being waited for. */
  checkoutPending: boolean;
  /** Code of the last failed server contact ("network", "no_keychain", a server error code), or null. */
  syncError: string | null;
  /** This build has a billing server: the Avalet options can be offered (otherwise "Coming soon"). */
  builtInAvailable: boolean;
  /**
   * Own-key mode with a saved key: whether it was checked (key test or a real
   * call). null in Avalet mode, without a key, or for a local server without one.
   */
  keyCheck: "unchecked" | "ok" | "failed" | null;
};

export type CancelInfoPublic = { active: boolean; renews: boolean; periodEnd: number | null; manageUrl: string | null };

// --- invoke channels: channel -> [arguments, result] ---

export type InvokeMap = {
  "avalet:settings-get-all": [[], SettingsSnapshot];
  "avalet:usage-get": [[], UsageSummary];
  "avalet:access-get": [[], AccessState];
  "avalet:billing-activate-trial": [[], AccessState];
  "avalet:billing-refresh": [[], AccessState];
  "avalet:billing-checkout": [[plan: "pro"], AccessState];
  "avalet:billing-cancel-info": [[], CancelInfoPublic];
  "avalet:billing-open-manage": [[], void];
  "avalet:provider-test": [[providerId: string], { ok: true } | { ok: false; message: string }];
  /** Wizard "Try it": one suggestion for a canned transcript, with the current provider and mode. */
  "avalet:selftest-suggestion": [[], { ok: true; text: string } | { ok: false; message: string }];
  "avalet:open-privacy-settings": [[kind: "mic" | "screen"], void];
  "avalet:speech-set": [[patch: { language?: SpeechLanguage; model?: SpeechModelName }], void];
  "avalet:speech-models": [[], SpeechModelRow[]];
  "avalet:speech-model-download": [[model: SpeechModelName], void];
  "avalet:speech-model-cancel": [[model: SpeechModelName], void];
  "avalet:speech-model-delete": [[model: SpeechModelName], void];
  "avalet:screenshot-text-set": [[enabled: boolean], void];
  "avalet:live-tracker-set": [[enabled: boolean], void];
  "avalet:ui-level-set": [[level: UiLevel], void];
  "avalet:onboarding-set": [[done: boolean], void];
  "avalet:main-set-pinned": [[pinned: boolean], void];
  "avalet:export-dir-choose": [[], string | null];
  "avalet:main-toggle": [[], void];
  /** Shows the main window on the access settings (from the overlay's paywall). */
  "avalet:main-show-access": [[], void];
  "avalet:app-quit": [[], void];
  "avalet:open-logs": [[], void];
  "avalet:history-clear": [[], void];
  "avalet:history-get": [[], HistoryBlock[]];
  "avalet:history-append": [[block: { id: string; text: string; status: "done" | "error" }], void];
  "avalet:meeting-mode-set": [[mode: MeetingMode], void];
  "avalet:meetings-list": [[], MeetingListItem[]];
  "avalet:meetings-current": [[], Meeting | null];
  "avalet:meetings-get": [[id: string], Meeting | null];
  "avalet:meetings-rename": [[id: string, title: string], void];
  "avalet:meetings-delete": [[id: string], void];
  "avalet:meetings-summarize": [[id: string], string];
  "avalet:meetings-export": [[id: string, labels: ExportLabels, modeLabel: string], string | null];
  "avalet:meetings-export-transcript": [[id: string, labels: ExportLabels], string | null];
  "avalet:meetings-to-text": [[id: string, labels: ExportLabels, modeLabel: string], string];
  "avalet:meetings-set-agenda": [[id: string, agenda: string[]], Meeting | null];
  "avalet:agenda-set": [[text: string], void];
  "avalet:context-set": [[text: string], void];
  "avalet:auto-detect-set": [[enabled: boolean], void];
  "avalet:overlay-set-opacity": [[opacity: number], void];
  "avalet:overlay-set-collapsed": [[collapsed: boolean], void];
  "avalet:overlay-show": [[], void];
  "avalet:overlay-hide": [[], void];
  "avalet:overlay-click-through": [[enabled: boolean], void];
  "avalet:theme-set": [[theme: Theme], void];
  "avalet:ui-language-set": [[language: UiLanguage], void];
  "avalet:session-start": [[], StartResult];
  "avalet:session-stop": [[], void];
  "avalet:session-reset": [[], void];
  "avalet:session-ask": [[question: string], void];
  "avalet:session-ask-screen": [[], void];
  "avalet:session-process-now": [[], void];
  "avalet:session-get-state": [[], SessionState];
  "avalet:settings-select-provider": [[providerId: string], void];
  "avalet:settings-update-provider": [[providerId: string, patch: { model?: string; baseUrl?: string; backgroundModel?: string }], void];
  "avalet:settings-set-api-key": [[providerId: string, apiKey: string], void];
  "avalet:tracker-get": [[], TrackerState];
  "avalet:tracker-refresh": [[], TrackerState];
  "avalet:tracker-toggle-agenda": [[index: number], TrackerState];
  "avalet:tracker-add-agenda": [[text: string], TrackerState];
  "avalet:tracker-set-action": [[id: string, state: ActionState], TrackerState];
  "avalet:tracker-add-action": [[text: string], TrackerState];
  "avalet:capture-screenshot": [[], { base64: string; width: number; height: number }];
  "avalet:capture-audio-chunk": [
    [audioBase64: string, channel: AudioChannel, meta: { startedAt: number; endedAt: number; endedBySilence: boolean }],
    void,
  ];
  "avalet:audio-degraded-set": [[state: { me: boolean; other: boolean }], void];
  "avalet:capture-reconnect-request": [[channel: AudioChannel | "both"], void];
  "avalet:permissions-check": [[], { mic: PermissionStatus; screen: PermissionStatus }];
  "avalet:mic-get-preferred": [[], string];
  "avalet:mic-set-preferred": [[deviceId: string], void];
  "avalet:screen-list-sources": [[], { id: string; name: string }[]];
  "avalet:screen-get-preferred": [[], string];
  "avalet:screen-set-preferred": [[sourceId: string], void];
  // Registered by electron-audio-loopback itself, not by main.ts.
  "enable-loopback-audio": [[], void];
  "disable-loopback-audio": [[], void];
};

export type InvokeChannel = keyof InvokeMap;
export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C][0];
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C][1];

// --- events pushed from main: channel -> payload ---

export type EventMap = {
  "avalet:event:block-start": LiveBlockEvent;
  "avalet:event:block-delta": LiveBlockDeltaEvent;
  "avalet:event:block-done": LiveBlockEvent;
  "avalet:event:block-error": LiveBlockErrorEvent;
  "avalet:event:session-state": SessionState;
  "avalet:event:history-cleared": undefined;
  "avalet:event:auto-detect-changed": boolean;
  "avalet:event:theme-changed": Theme;
  "avalet:event:opacity-changed": number;
  "avalet:event:ui-language-changed": UiLanguage;
  "avalet:event:ui-level-changed": UiLevel;
  "avalet:event:audio-degraded": { me: boolean; other: boolean };
  "avalet:event:reconnect-audio-requested": AudioChannel | "both";
  "avalet:event:transcription-error": string;
  "avalet:event:transcription-recovered": undefined;
  "avalet:event:models-changed": SpeechModelRow[];
  "avalet:event:meeting-mode-changed": MeetingMode;
  "avalet:event:transcript-segment": TranscriptSegment;
  "avalet:event:meeting-started": Meeting;
  "avalet:event:meeting-ended": Meeting | null;
  "avalet:event:summary-delta": { id: string; delta: string };
  "avalet:event:summary-done": SummaryDoneEvent;
  "avalet:event:summary-error": { id: string; message: string; code?: "paywall" };
  "avalet:event:tracker-update": TrackerState;
  "avalet:event:usage-changed": UsageSummary;
  "avalet:event:access-changed": AccessState;
  /** A live call was refused for budget or plan reasons: show the paywall. */
  "avalet:event:paywall": AccessState;
  /** Main window: open this place (the overlay asked for it). */
  "avalet:event:navigate": "access";
};

export type EventChannel = keyof EventMap;
export type Unsubscribe = () => void;
type Listener<C extends EventChannel> = (cb: (payload: EventMap[C]) => void) => Unsubscribe;

/** What `window.avalet` exposes to both renderer pages. */
export type AvaletApi = {
  settings: {
    getAll: () => Promise<SettingsSnapshot>;
    setSpeech: (patch: { language?: SpeechLanguage; model?: SpeechModelName }) => Promise<void>;
    setScreenshotText: (enabled: boolean) => Promise<void>;
    setLiveTracker: (enabled: boolean) => Promise<void>;
    setUiLevel: (level: UiLevel) => Promise<void>;
    setOnboardingDone: (done: boolean) => Promise<void>;
    setMainPinned: (pinned: boolean) => Promise<void>;
    /** Folder picker; returns the new export folder, or null when cancelled. */
    chooseExportDir: () => Promise<string | null>;
    setMeetingMode: (mode: MeetingMode) => Promise<void>;
    selectProvider: (providerId: string) => Promise<void>;
    updateProvider: (providerId: string, patch: { model?: string; baseUrl?: string; backgroundModel?: string }) => Promise<void>;
    setApiKey: (providerId: string, apiKey: string) => Promise<void>;
    setContext: (text: string) => Promise<void>;
    setAgenda: (text: string) => Promise<void>;
    setAutoDetect: (enabled: boolean) => Promise<void>;
    setTheme: (theme: Theme) => Promise<void>;
    setUiLanguage: (language: UiLanguage) => Promise<void>;
  };
  usage: {
    get: () => Promise<UsageSummary>;
  };
  billing: {
    access: () => Promise<AccessState>;
    activateTrial: () => Promise<AccessState>;
    refresh: () => Promise<AccessState>;
    /** Opens the payment page in the system browser and waits for the result in the background. */
    checkout: (plan: "pro") => Promise<AccessState>;
    cancelInfo: () => Promise<CancelInfoPublic>;
    openManage: () => Promise<void>;
    /** One tiny real call with the saved key; a human-readable reason when it fails. */
    testProvider: (providerId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
    selfTest: () => Promise<{ ok: true; text: string } | { ok: false; message: string }>;
  };
  speech: {
    models: () => Promise<SpeechModelRow[]>;
    download: (model: SpeechModelName) => Promise<void>;
    cancel: (model: SpeechModelName) => Promise<void>;
    remove: (model: SpeechModelName) => Promise<void>;
  };
  session: {
    start: () => Promise<StartResult>;
    stop: () => Promise<void>;
    reset: () => Promise<void>;
    ask: (question: string) => Promise<void>;
    /** Prioritizes a fresh screenshot, combined with the transcript. */
    askScreen: () => Promise<void>;
    /** Flushes whatever has been transcribed so far into a block (for when auto-suggest is off). */
    processNow: () => Promise<void>;
    getState: () => Promise<SessionState>;
  };
  capture: {
    screenshot: () => Promise<{ base64: string; width: number; height: number }>;
    enableLoopbackAudio: () => Promise<void>;
    disableLoopbackAudio: () => Promise<void>;
    submitAudioChunk: (
      audioBase64: string,
      channel: AudioChannel,
      meta: { startedAt: number; endedAt: number; endedBySilence: boolean },
    ) => Promise<void>;
    reportAudioDegraded: (state: { me: boolean; other: boolean }) => Promise<void>;
    requestReconnect: (channel: AudioChannel | "both") => Promise<void>;
  };
  permissions: {
    check: () => Promise<{ mic: PermissionStatus; screen: PermissionStatus }>;
    /** Opens the matching pane of System Settings (macOS). */
    openSettings: (kind: "mic" | "screen") => Promise<void>;
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
    showAccess: () => Promise<void>;
    /** Opens the folder with avalet.log (timings and errors only, never meeting text). */
    openLogs: () => Promise<void>;
    quit: () => Promise<void>;
  };
  tracker: {
    get: () => Promise<TrackerState>;
    refresh: () => Promise<TrackerState>;
    toggleAgenda: (index: number) => Promise<TrackerState>;
    addAgenda: (text: string) => Promise<TrackerState>;
    setAction: (id: string, state: ActionState) => Promise<TrackerState>;
    addAction: (text: string) => Promise<TrackerState>;
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
    onBlockStart: Listener<"avalet:event:block-start">;
    onBlockDelta: Listener<"avalet:event:block-delta">;
    onBlockDone: Listener<"avalet:event:block-done">;
    onBlockError: Listener<"avalet:event:block-error">;
    onSessionState: Listener<"avalet:event:session-state">;
    onHistoryCleared: Listener<"avalet:event:history-cleared">;
    onAutoDetectChanged: Listener<"avalet:event:auto-detect-changed">;
    onThemeChanged: Listener<"avalet:event:theme-changed">;
    onOpacityChanged: Listener<"avalet:event:opacity-changed">;
    onUiLanguageChanged: Listener<"avalet:event:ui-language-changed">;
    onUiLevelChanged: Listener<"avalet:event:ui-level-changed">;
    onAudioDegraded: Listener<"avalet:event:audio-degraded">;
    onReconnectAudioRequested: Listener<"avalet:event:reconnect-audio-requested">;
    onTranscriptionError: Listener<"avalet:event:transcription-error">;
    onTranscriptionRecovered: Listener<"avalet:event:transcription-recovered">;
    onModelsChanged: Listener<"avalet:event:models-changed">;
    onMeetingModeChanged: Listener<"avalet:event:meeting-mode-changed">;
    onTranscriptSegment: Listener<"avalet:event:transcript-segment">;
    onMeetingStarted: Listener<"avalet:event:meeting-started">;
    onMeetingEnded: Listener<"avalet:event:meeting-ended">;
    onSummaryDelta: Listener<"avalet:event:summary-delta">;
    onSummaryDone: Listener<"avalet:event:summary-done">;
    onTrackerUpdate: Listener<"avalet:event:tracker-update">;
    onSummaryError: Listener<"avalet:event:summary-error">;
    onUsageChanged: Listener<"avalet:event:usage-changed">;
    onAccessChanged: Listener<"avalet:event:access-changed">;
    onPaywall: Listener<"avalet:event:paywall">;
    onNavigate: Listener<"avalet:event:navigate">;
  };
};

/**
 * Every invoke channel, as a runtime list. Typed as a Record over InvokeChannel,
 * so adding a channel to InvokeMap without listing it here fails the
 * typecheck; main.ts refuses to start if one of them has no handler.
 */
const CHANNEL_SET: Record<InvokeChannel, true> = {
  "avalet:settings-get-all": true,
  "avalet:usage-get": true,
  "avalet:access-get": true,
  "avalet:billing-activate-trial": true,
  "avalet:billing-refresh": true,
  "avalet:billing-checkout": true,
  "avalet:billing-cancel-info": true,
  "avalet:billing-open-manage": true,
  "avalet:provider-test": true,
  "avalet:selftest-suggestion": true,
  "avalet:open-privacy-settings": true,
  "avalet:speech-set": true,
  "avalet:speech-models": true,
  "avalet:speech-model-download": true,
  "avalet:speech-model-cancel": true,
  "avalet:speech-model-delete": true,
  "avalet:screenshot-text-set": true,
  "avalet:live-tracker-set": true,
  "avalet:ui-level-set": true,
  "avalet:onboarding-set": true,
  "avalet:main-set-pinned": true,
  "avalet:export-dir-choose": true,
  "avalet:main-toggle": true,
  "avalet:main-show-access": true,
  "avalet:app-quit": true,
  "avalet:open-logs": true,
  "avalet:history-clear": true,
  "avalet:history-get": true,
  "avalet:history-append": true,
  "avalet:meeting-mode-set": true,
  "avalet:meetings-list": true,
  "avalet:meetings-current": true,
  "avalet:meetings-get": true,
  "avalet:meetings-rename": true,
  "avalet:meetings-delete": true,
  "avalet:meetings-summarize": true,
  "avalet:meetings-export": true,
  "avalet:meetings-export-transcript": true,
  "avalet:meetings-to-text": true,
  "avalet:meetings-set-agenda": true,
  "avalet:agenda-set": true,
  "avalet:context-set": true,
  "avalet:auto-detect-set": true,
  "avalet:overlay-set-opacity": true,
  "avalet:overlay-set-collapsed": true,
  "avalet:overlay-show": true,
  "avalet:overlay-hide": true,
  "avalet:overlay-click-through": true,
  "avalet:theme-set": true,
  "avalet:ui-language-set": true,
  "avalet:session-start": true,
  "avalet:session-stop": true,
  "avalet:session-reset": true,
  "avalet:session-ask": true,
  "avalet:session-ask-screen": true,
  "avalet:session-process-now": true,
  "avalet:session-get-state": true,
  "avalet:settings-select-provider": true,
  "avalet:settings-update-provider": true,
  "avalet:settings-set-api-key": true,
  "avalet:tracker-get": true,
  "avalet:tracker-refresh": true,
  "avalet:tracker-toggle-agenda": true,
  "avalet:tracker-add-agenda": true,
  "avalet:tracker-set-action": true,
  "avalet:tracker-add-action": true,
  "avalet:capture-screenshot": true,
  "avalet:capture-audio-chunk": true,
  "avalet:audio-degraded-set": true,
  "avalet:capture-reconnect-request": true,
  "avalet:permissions-check": true,
  "avalet:mic-get-preferred": true,
  "avalet:mic-set-preferred": true,
  "avalet:screen-list-sources": true,
  "avalet:screen-get-preferred": true,
  "avalet:screen-set-preferred": true,
  "enable-loopback-audio": true,
  "disable-loopback-audio": true,
};

export const INVOKE_CHANNELS = Object.keys(CHANNEL_SET) as InvokeChannel[];

/** Channels electron-audio-loopback registers itself. */
export const EXTERNAL_CHANNELS: InvokeChannel[] = ["enable-loopback-audio", "disable-loopback-audio"];
