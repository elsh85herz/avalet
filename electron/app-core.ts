import fs from "node:fs";
import { LiveSession, type LiveBlock } from "./live-session.js";
import { LiveTracker } from "./live-tracker.js";
import { isMeetingMode, MODE_SUMMARY } from "./modes.js";
import type { PythonRuntime } from "./python-runtime.js";
import type { SpeechModelManager } from "./model-manager.js";
import { isSpeechModel } from "./speech-models.js";
import type { UsageLedger } from "./metering/ledger.js";
import { configureMetering, meteredGenerate } from "./metering/metered.js";
import type { BillingService } from "./billing/service.js";
import { configureAvaletProvider, resolveCredentials } from "./provider-credentials.js";
import type { AccessProblem } from "./providers/errors.js";
import { accessProblemOf } from "./providers/errors.js";
import { humanProviderError, noKeyMessage } from "./human-errors.js";
import { PROVIDER_PRESETS } from "./providers/types.js";
import { appendHistoryBlock, clearHistory, getHistory } from "./history-store.js";
import {
  appendSegment,
  deleteMeeting,
  endCurrentMeeting,
  flushCurrentMeeting,
  getCurrentMeeting,
  listMeetings,
  readMeeting,
  renameMeeting,
  setAgenda,
  setCurrentContext,
  setCurrentMode,
  startMeeting,
  transcriptToRawText,
} from "./meetings-store.js";
import { summarizeMeeting } from "./meeting-summary.js";
import { buildProtocolMarkdown, parseAgendaText } from "./summary-format.js";
import {
  getAgendaText,
  getAllProviderSettings,
  getAutoDetectEnabled,
  getLiveTrackerEnabled,
  getMainPinned,
  getMeetingMode,
  getOnboardingDone,
  getOverlayOpacity,
  getPreferredMicDeviceId,
  getPreferredScreenSourceId,
  getScreenshotTextEnabled,
  getSelectedProviderId,
  getSessionContext,
  getSpeechLanguage,
  getSpeechModel,
  getTheme,
  getUiLanguage,
  getUiLevel,
  hasApiKey,
  isUiLevelForced,
  setAgendaText,
  setApiKey,
  setAutoDetectEnabled,
  setLiveTrackerEnabled,
  setMeetingMode,
  setOnboardingDone,
  setPreferredMicDeviceId,
  setPreferredScreenSourceId,
  setScreenshotTextEnabled,
  setSelectedProviderId,
  setSessionContext,
  setSpeechLanguage,
  setSpeechModel,
  setUiLanguage,
  setUiLevel,
  SPEECH_LANGUAGES,
  updateProviderSettings,
} from "./settings-store.js";
import type {
  EventChannel,
  EventMap,
  InvokeChannel,
  InvokeResult,
  SettingsSnapshot,
} from "./shared/ipc-contract.js";

/** Which window(s) an event goes to. */
export type EventTarget = "main" | "overlay" | "both";
export type Emit = <C extends EventChannel>(channel: C, payload: EventMap[C], target?: EventTarget) => void;

/** Channels main.ts handles itself because they need a window, a dialog or an Electron-only API. */
export const WINDOW_CHANNELS = [
  "avalet:main-set-pinned",
  "avalet:main-toggle",
  "avalet:main-show-access",
  "avalet:app-quit",
  "avalet:overlay-set-opacity",
  "avalet:overlay-set-collapsed",
  "avalet:overlay-show",
  "avalet:overlay-hide",
  "avalet:overlay-click-through",
  "avalet:theme-set",
  "avalet:capture-screenshot",
  "avalet:permissions-check",
  "avalet:screen-list-sources",
] as const satisfies readonly InvokeChannel[];
export type WindowChannel = (typeof WINDOW_CHANNELS)[number];

/** Arguments arrive from a renderer and are untrusted: every handler validates them. */
export type Handler<C extends InvokeChannel> = (...args: unknown[]) => InvokeResult<C> | Promise<InvokeResult<C>>;
export type HandlerTable = { [C in InvokeChannel]?: Handler<C> };

export type AppCoreDeps = {
  sidecar: PythonRuntime;
  models: SpeechModelManager;
  ledger: UsageLedger;
  /** Built-in provider and plans; absent in tests that only use own keys. */
  billing?: BillingService;
  /** LLM proxy of the billing server, e.g. https://billing.example/v1/llm. */
  avaletProxyUrl?: string;
  emit: Emit;
  /** Grabs a screenshot for the model; null when not possible. */
  captureScreen: () => Promise<{ image: string; ocrImage: string } | null>;
  recognizeText: (imageBase64: string) => Promise<string | null>;
  isOcrAvailable: () => Promise<boolean>;
  /** Asks where to save an export; null when the user cancelled. */
  chooseSavePath: (defaultName: string, filterName: string, extension: string) => Promise<string | null>;
  /** Called on Start, e.g. to open the overlay window. */
  onSessionStarted?: () => void;
};

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function pickLabels(labels: unknown): (key: string, fallback: string) => string {
  const l = (labels && typeof labels === "object" ? labels : {}) as Record<string, unknown>;
  return (key, fallback) => (typeof l[key] === "string" ? (l[key] as string) : fallback);
}

/** Characters that are not allowed in file names on macOS or Windows, plus control characters. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return cleaned || "meeting";
}

/**
 * Everything the app does between the IPC boundary and the stores, without
 * any window. main.ts registers `handlers` with ipcMain and adds the few
 * window-only channels itself; the integration tests call the same handlers
 * directly with a fake sidecar and a mock provider.
 */
export class AppCore {
  readonly liveSession: LiveSession;
  readonly liveTracker: LiveTracker;
  readonly handlers: HandlerTable;
  private summaryAbort: AbortController | null = null;

  constructor(private readonly deps: AppCoreDeps) {
    const { emit } = deps;
    this.liveTracker = new LiveTracker({
      onUpdate: (state) => emit("avalet:event:tracker-update", state),
      isEnabled: getLiveTrackerEnabled,
      onAccessProblem: (problem) => this.handleAccessProblem(problem, false),
    });
    this.liveSession = new LiveSession(
      deps.sidecar,
      {
        onBlockStart: (block: LiveBlock) => emit("avalet:event:block-start", { id: block.id }, "overlay"),
        onBlockDelta: (id, delta) => emit("avalet:event:block-delta", { id, delta }, "overlay"),
        onBlockDone: (id) => emit("avalet:event:block-done", { id }, "overlay"),
        onBlockError: (id, message, code) => emit("avalet:event:block-error", { id, message, code }, "overlay"),
        onAccessProblem: (problem) => this.handleAccessProblem(problem),
        onStateChange: (state) => emit("avalet:event:session-state", state),
        onTranscriptionError: (message) => emit("avalet:event:transcription-error", message),
        onTranscriptionRecovered: () => emit("avalet:event:transcription-recovered", undefined),
        onTranscriptSegment: (segment, meta) => {
          appendSegment(segment);
          emit("avalet:event:transcript-segment", segment, "main");
          this.liveTracker.note(meta.endsWithPause);
        },
      },
      deps.captureScreen,
      deps.recognizeText,
    );
    const billing = deps.billing;
    configureMetering({
      ledger: deps.ledger,
      tierOf: (providerId) => billing?.tierOf(providerId) ?? { tier: "own", trial: false },
      currentMeetingId: () => this.meetingForUsage(),
    });
    configureAvaletProvider(
      billing && deps.avaletProxyUrl
        ? { proxyBaseUrl: () => deps.avaletProxyUrl!, token: () => billing.proxyToken() }
        : null,
    );
    deps.ledger.onChange(() => emit("avalet:event:usage-changed", this.usageSummary()));
    deps.ledger.onRecord((entry, weighted) => {
      if (entry.tier === "avalet") billing?.noteAvaletUsage(weighted);
    });
    this.handlers = this.buildHandlers();
  }

  /** The running meeting, or the last one it ran for (a summary after End still belongs to it). */
  private lastMeetingId: string | null = null;
  private meetingForUsage(): string | null {
    const current = getCurrentMeeting();
    if (current) this.lastMeetingId = current.id;
    return current?.id ?? this.lastMeetingId;
  }

  /** Budget or plan problem on a live call: tell the billing state and show the offer (not for background calls). */
  private handleAccessProblem(problem: AccessProblem, showPaywall = true): void {
    const billing = this.deps.billing;
    if (!billing) return;
    if (problem === "exhausted") billing.markExhausted();
    else if (problem === "rejected") billing.markRejected();
    if (showPaywall) this.deps.emit("avalet:event:paywall", billing.access());
  }

  /** The selected own-key provider can make calls: a saved key, or a local server that needs none. */
  static ownKeyReady(providerId: string): boolean {
    if (providerId === "avalet") return false;
    return providerId === "custom" || hasApiKey(providerId);
  }

  usageSummary() {
    return this.deps.ledger.summary(Date.now(), this.meetingForUsage());
  }

  async settingsSnapshot(): Promise<SettingsSnapshot> {
    return {
      selectedProviderId: getSelectedProviderId(),
      providers: getAllProviderSettings().map((s) => ({
        providerId: s.providerId,
        model: s.model,
        backgroundModel: s.backgroundModel ?? "",
        baseUrl: s.baseUrl,
        hasApiKey: hasApiKey(s.providerId),
      })),
      sessionContext: getSessionContext(),
      agendaText: getAgendaText(),
      autoDetectEnabled: getAutoDetectEnabled(),
      overlayOpacity: getOverlayOpacity(),
      theme: getTheme(),
      uiLanguage: getUiLanguage(),
      uiLevel: getUiLevel(),
      uiLevelForced: isUiLevelForced(),
      onboardingDone: getOnboardingDone(),
      meetingMode: getMeetingMode(),
      mainPinned: getMainPinned(),
      screenshotText: getScreenshotTextEnabled(),
      ocrAvailable: await this.deps.isOcrAvailable(),
      speechLanguage: getSpeechLanguage(),
      speechModel: getSpeechModel(),
      liveTrackerEnabled: getLiveTrackerEnabled(),
    };
  }

  renderProtocol(id: string, labels: unknown, modeLabel: unknown): string {
    const meeting = readMeeting(id);
    if (!meeting) throw new Error("meeting not found");
    const pick = pickLabels(labels);
    return buildProtocolMarkdown(
      meeting,
      {
        date: pick("date", "Date"),
        mode: pick("mode", "Mode"),
        participants: pick("participants", "Participants"),
        agenda: pick("agenda", "Agenda"),
        discussions: pick("discussions", "Discussion"),
        actions: pick("actions", "Agreements and tasks"),
        actionTask: pick("actionTask", "Task"),
        actionOwner: pick("actionOwner", "Owner"),
        actionDue: pick("actionDue", "Due"),
        agendaClosed: pick("agendaClosed", "closed"),
        agendaOpen: pick("agendaOpen", "open"),
      },
      typeof modeLabel === "string" ? modeLabel : meeting.mode,
      MODE_SUMMARY[meeting.mode].headings,
    );
  }

  renderRawTranscript(id: string, labels: unknown): string {
    const meeting = readMeeting(id);
    if (!meeting) throw new Error("meeting not found");
    const pick = pickLabels(labels);
    return transcriptToRawText(meeting, { me: pick("me", "Me"), other: pick("other", "Other"), date: pick("date", "Date") });
  }

  private async saveFile(defaultName: string, filterName: string, extension: string, content: string): Promise<string | null> {
    const target = await this.deps.chooseSavePath(safeFileName(defaultName), filterName, extension);
    if (!target) return null;
    fs.writeFileSync(target, content, "utf8");
    return target;
  }

  /** Work that runs without any window asking: billing refresh. */
  startBackground(): void {
    this.deps.billing?.start();
  }

  /** Stop listening and save; used by Quit. */
  async shutdown(): Promise<void> {
    this.liveSession.stop();
    flushCurrentMeeting();
    this.deps.billing?.dispose();
    this.deps.models.dispose();
    await this.deps.sidecar.stop();
  }

  private buildHandlers(): HandlerTable {
    const { emit, sidecar, models } = this.deps;
    const h: HandlerTable = {};

    h["avalet:settings-get-all"] = () => this.settingsSnapshot();
    h["avalet:usage-get"] = () => this.usageSummary();

    const billingOrThrow = () => {
      if (!this.deps.billing) throw new Error("billing is not available");
      return this.deps.billing;
    };
    h["avalet:access-get"] = () => billingOrThrow().access();
    h["avalet:billing-activate-trial"] = () => billingOrThrow().activateTrial();
    h["avalet:billing-refresh"] = () => billingOrThrow().refresh();
    h["avalet:billing-checkout"] = (plan) => {
      if (plan !== "pro") throw new Error("unknown plan");
      return billingOrThrow().checkout(plan);
    };
    h["avalet:billing-cancel-info"] = () => billingOrThrow().cancelInfo();
    h["avalet:billing-open-manage"] = () => billingOrThrow().openManage();

    // One tiny real call, so a wrong key shows up in setup and not in the first meeting.
    h["avalet:provider-test"] = async (rawId) => {
      const providerId = requireString(rawId, "providerId");
      if (!PROVIDER_PRESETS.some((p) => p.id === providerId)) throw new Error("unknown provider");
      const language = getUiLanguage();
      if (providerId !== "avalet" && providerId !== "custom" && !hasApiKey(providerId)) {
        return { ok: false, message: noKeyMessage(language) };
      }
      try {
        const { apiKey, baseUrl } = resolveCredentials(providerId);
        await meteredGenerate("suggestion", {
          providerId,
          apiKey,
          baseUrl,
          model: getAllProviderSettings().find((p) => p.providerId === providerId)?.model ?? "",
          systemPrompt: "Reply with the single word OK.",
          transcript: "Test.",
          maxTokens: 5,
          stream: false,
          signal: AbortSignal.timeout(20_000),
          onDelta: () => {},
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: humanProviderError(error, language) };
      }
    };

    h["avalet:speech-set"] = (patch) => {
      const p = (patch ?? {}) as { language?: unknown; model?: unknown };
      if (p.language !== undefined) {
        if (!SPEECH_LANGUAGES.includes(p.language as never)) throw new Error("unknown speech language");
        setSpeechLanguage(p.language as never);
      }
      if (p.model !== undefined) {
        if (!isSpeechModel(p.model)) throw new Error("unknown speech model");
        setSpeechModel(p.model);
      }
    };
    h["avalet:speech-models"] = () => models.rows();
    h["avalet:speech-model-download"] = (model) => {
      if (!isSpeechModel(model)) throw new Error("unknown speech model");
      models.download(model);
    };
    h["avalet:speech-model-cancel"] = (model) => {
      if (!isSpeechModel(model)) throw new Error("unknown speech model");
      models.cancel(model);
    };
    h["avalet:speech-model-delete"] = (model) => {
      if (!isSpeechModel(model)) throw new Error("unknown speech model");
      models.remove(model);
    };

    h["avalet:screenshot-text-set"] = (enabled) => setScreenshotTextEnabled(Boolean(enabled));
    h["avalet:live-tracker-set"] = (enabled) => {
      setLiveTrackerEnabled(Boolean(enabled));
      emit("avalet:event:tracker-update", this.liveTracker.getState());
    };
    h["avalet:ui-level-set"] = (level) => {
      if (level !== "simple" && level !== "advanced") throw new Error("unknown ui level");
      setUiLevel(level);
      emit("avalet:event:ui-level-changed", getUiLevel());
      emit("avalet:event:tracker-update", this.liveTracker.getState());
    };
    h["avalet:onboarding-set"] = (done) => setOnboardingDone(Boolean(done));

    // Clears only the suggestion blocks in the overlay; the meeting record and its transcript are untouched.
    h["avalet:history-clear"] = () => {
      clearHistory();
      emit("avalet:event:history-cleared", undefined, "overlay");
    };
    h["avalet:history-get"] = () => getHistory();
    h["avalet:history-append"] = (block) => {
      const b = (block ?? {}) as { id?: unknown; text?: unknown; status?: unknown };
      if (typeof b.id !== "string" || typeof b.text !== "string") throw new Error("invalid history block");
      if (b.status !== "done" && b.status !== "error") throw new Error("invalid history block status");
      appendHistoryBlock({ id: b.id, text: b.text, status: b.status, createdAt: Date.now() });
    };

    h["avalet:meeting-mode-set"] = (mode) => {
      if (!isMeetingMode(mode)) throw new Error("unknown meeting mode");
      setMeetingMode(mode);
      setCurrentMode(mode);
      emit("avalet:event:meeting-mode-changed", mode);
    };

    h["avalet:meetings-list"] = () => listMeetings();
    h["avalet:meetings-current"] = () => getCurrentMeeting();
    h["avalet:meetings-get"] = (id) => readMeeting(requireString(id, "id"));
    h["avalet:meetings-rename"] = (id, title) => renameMeeting(requireString(id, "id"), requireString(title, "title"));
    h["avalet:meetings-delete"] = (id) => deleteMeeting(requireString(id, "id"));

    h["avalet:meetings-summarize"] = async (rawId) => {
      const id = requireString(rawId, "id");
      this.summaryAbort?.abort();
      const controller = new AbortController();
      this.summaryAbort = controller;
      flushCurrentMeeting();
      try {
        const { text, analysis } = await summarizeMeeting(id, controller.signal, {
          onDelta: (delta) => emit("avalet:event:summary-delta", { id, delta }, "main"),
        });
        emit(
          "avalet:event:summary-done",
          { id, text, agendaStatus: analysis?.agendaStatus ?? null, actions: analysis?.actions ?? null },
          "main",
        );
        return text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const problem = accessProblemOf(error);
        if (problem) this.handleAccessProblem(problem);
        emit("avalet:event:summary-error", { id, message, code: problem ? "paywall" : undefined }, "main");
        throw error;
      } finally {
        if (this.summaryAbort === controller) this.summaryAbort = null;
      }
    };

    // The protocol: agenda checklist, per-topic discussion and the action table. No transcript in it.
    h["avalet:meetings-export"] = async (rawId, labels, modeLabel) => {
      const id = requireString(rawId, "id");
      const meeting = readMeeting(id);
      if (!meeting) throw new Error("meeting not found");
      return this.saveFile(meeting.title, "Markdown", "md", this.renderProtocol(id, labels, modeLabel));
    };
    // The raw transcript exactly as recognized, without any model processing.
    h["avalet:meetings-export-transcript"] = async (rawId, labels) => {
      const id = requireString(rawId, "id");
      const meeting = readMeeting(id);
      if (!meeting) throw new Error("meeting not found");
      return this.saveFile(`${meeting.title} - transcript`, "Text", "txt", this.renderRawTranscript(id, labels));
    };
    // Plain-text variant of the protocol for the clipboard: markdown marks stripped.
    h["avalet:meetings-to-text"] = (id, labels, modeLabel) =>
      this.renderProtocol(requireString(id, "id"), labels, modeLabel)
        .replace(/^#+ /gm, "")
        .replace(/\*\*/g, "");

    h["avalet:meetings-set-agenda"] = (id, agenda) => {
      if (!Array.isArray(agenda) || agenda.some((q) => typeof q !== "string")) throw new Error("agenda must be a string array");
      return setAgenda(
        requireString(id, "id"),
        (agenda as string[]).map((q) => q.trim()).filter(Boolean),
      );
    };
    h["avalet:agenda-set"] = (text) => setAgendaText(requireString(text, "text"));
    h["avalet:context-set"] = (raw) => {
      const text = requireString(raw, "text");
      setSessionContext(text);
      setCurrentContext(text);
    };
    h["avalet:auto-detect-set"] = (enabled) => {
      const next = Boolean(enabled);
      setAutoDetectEnabled(next);
      // Toggleable from both windows; broadcast so the other one stays in sync.
      emit("avalet:event:auto-detect-changed", next);
    };
    h["avalet:ui-language-set"] = (language) => {
      if (language !== "ru" && language !== "en") throw new Error("language must be 'ru' or 'en'");
      setUiLanguage(language);
      emit("avalet:event:ui-language-changed", language);
    };

    h["avalet:session-ask"] = async (question) => this.liveSession.askManual(requireString(question, "question"));
    h["avalet:session-ask-screen"] = async () => this.liveSession.askAboutScreen();
    h["avalet:session-process-now"] = async () => this.liveSession.processNow();

    h["avalet:settings-select-provider"] = (providerId) => {
      setSelectedProviderId(requireString(providerId, "providerId"));
      this.deps.billing?.emit();
    };
    h["avalet:settings-update-provider"] = (providerId, patch) => {
      const p = (patch ?? {}) as { model?: unknown; baseUrl?: unknown; backgroundModel?: unknown };
      updateProviderSettings(requireString(providerId, "providerId"), {
        model: typeof p.model === "string" ? p.model : undefined,
        baseUrl: typeof p.baseUrl === "string" ? p.baseUrl : undefined,
        backgroundModel: typeof p.backgroundModel === "string" ? p.backgroundModel : undefined,
      });
    };
    h["avalet:settings-set-api-key"] = (providerId, apiKey) => {
      setApiKey(requireString(providerId, "providerId"), requireString(apiKey, "apiKey"));
      this.deps.billing?.emit();
    };

    // Never downloads anything: a missing speech model is reported so the UI
    // can explain it and offer the Download button.
    h["avalet:session-start"] = async () => {
      const model = getSpeechModel();
      if (!models.isReady(model)) return { ok: false, reason: "model-missing", model };
      if (!sidecar.getStatus().ready) {
        await sidecar.start().catch((error) => {
          console.error("[core] python-sidecar failed to start:", error);
        });
      }
      const meeting = startMeeting({
        titlePrefix: getUiLanguage() === "ru" ? "Встреча" : "Meeting",
        mode: getMeetingMode(),
        context: getSessionContext(),
        agenda: parseAgendaText(getAgendaText()),
      });
      emit("avalet:event:meeting-started", meeting, "main");
      this.deps.onSessionStarted?.();
      this.liveSession.start();
      emit("avalet:event:tracker-update", this.liveTracker.getState());
      return { ok: true };
    };

    h["avalet:session-stop"] = () => {
      this.liveSession.stop();
      flushCurrentMeeting();
      // One last pass so the checklist matches what was said before the pause.
      void this.liveTracker.refresh();
    };

    h["avalet:tracker-get"] = () => this.liveTracker.getState();
    h["avalet:tracker-refresh"] = async () => {
      await this.liveTracker.refresh();
      return this.liveTracker.getState();
    };
    h["avalet:tracker-toggle-agenda"] = (index) => {
      if (!Number.isInteger(index)) throw new Error("index must be an integer");
      return this.liveTracker.toggleAgenda(index as number);
    };
    h["avalet:tracker-add-agenda"] = (text) => this.liveTracker.addAgenda(requireString(text, "text"));
    h["avalet:tracker-set-action"] = (id, state) => {
      if (state !== "proposed" && state !== "confirmed" && state !== "dismissed") throw new Error("invalid state");
      return this.liveTracker.setActionState(requireString(id, "id"), state);
    };
    h["avalet:tracker-add-action"] = (text) => this.liveTracker.addAction(requireString(text, "text"));

    // The overlay page can finish loading after session-start already
    // broadcast its state (send() has no queue), so it asks once on mount.
    h["avalet:session-get-state"] = () => this.liveSession.getState();

    // Ends the current meeting record as well: the next Start opens a new one.
    h["avalet:session-reset"] = () => {
      this.liveSession.stop();
      this.liveSession.reset();
      this.liveTracker.reset();
      clearHistory();
      const ended = endCurrentMeeting();
      emit("avalet:event:history-cleared", undefined, "overlay");
      emit("avalet:event:meeting-ended", ended, "main");
    };

    h["avalet:mic-get-preferred"] = () => getPreferredMicDeviceId();
    h["avalet:mic-set-preferred"] = (deviceId) => setPreferredMicDeviceId(requireString(deviceId, "deviceId"));
    h["avalet:screen-get-preferred"] = () => getPreferredScreenSourceId();
    h["avalet:screen-set-preferred"] = (sourceId) => setPreferredScreenSourceId(requireString(sourceId, "sourceId"));

    h["avalet:capture-audio-chunk"] = async (audioBase64, channel, meta) => {
      const audio = requireString(audioBase64, "audioBase64");
      const m = (meta ?? {}) as { startedAt?: unknown; endedAt?: unknown; endedBySilence?: unknown };
      const endedAt = typeof m.endedAt === "number" ? m.endedAt : Date.now();
      await this.liveSession.ingestAudioChunk(audio, channel === "other" ? "other" : "me", {
        startedAt: typeof m.startedAt === "number" ? m.startedAt : endedAt,
        endedAt,
        endedBySilence: Boolean(m.endedBySilence),
      });
    };
    // The main window owns the MediaStreams (see audio-capture.ts); it reports
    // up/down state here so the overlay can show it.
    h["avalet:audio-degraded-set"] = (state) => {
      const s = (state ?? {}) as { me?: unknown; other?: unknown };
      emit("avalet:event:audio-degraded", { me: Boolean(s.me), other: Boolean(s.other) }, "overlay");
    };
    // The overlay cannot reach those streams: relay the request to the window that holds them.
    h["avalet:capture-reconnect-request"] = (channel) => {
      emit("avalet:event:reconnect-audio-requested", channel === "me" || channel === "other" ? channel : "both", "main");
    };

    return h;
  }
}
