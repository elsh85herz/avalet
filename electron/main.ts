import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  type DesktopCapturerSource,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initMain as initAudioLoopbackMain } from "electron-audio-loopback";
import { PythonRuntime } from "./python-runtime.js";
import { captureScreenshot } from "./ipc/screenshot.js";
import { isOcrAvailable, recognizeScreenText, warmUpOcr } from "./ocr/index.js";
import { logLine } from "./log.js";
import { checkMicAccess, checkScreenAccess } from "./ipc/permissions.js";
import { listScreenSources } from "./ipc/screen-sources.js";
import { appendHistoryBlock, clearHistory, getHistory, type HistoryBlock } from "./history-store.js";
import { LiveSession, type LiveBlock } from "./live-session.js";
import { isMeetingMode, MODE_SUMMARY } from "./modes.js";
import {
  appendSegment,
  deleteMeeting,
  endCurrentMeeting,
  flushCurrentMeeting,
  getCurrentMeeting,
  listMeetings,
  transcriptToRawText,
  readMeeting,
  renameMeeting,
  setAgenda,
  setCurrentMode,
  startMeeting,
} from "./meetings-store.js";
import { summarizeMeeting } from "./meeting-summary.js";
import { buildProtocolMarkdown, parseAgendaText } from "./summary-format.js";
import {
  getAllProviderSettings,
  getAutoDetectEnabled,
  getMainPinned,
  getMeetingMode,
  getScreenshotTextEnabled,
  getSpeechLanguage,
  getSpeechModel,
  getOverlayOpacity,
  getPreferredMicDeviceId,
  getPreferredScreenSourceId,
  getSelectedProviderId,
  getAgendaText,
  getSessionContext,
  getTheme,
  getUiLanguage,
  hasApiKey,
  setAgendaText,
  setApiKey,
  setAutoDetectEnabled,
  setMainPinned,
  setMeetingMode,
  setScreenshotTextEnabled,
  setSpeechLanguage,
  setSpeechModel,
  SPEECH_LANGUAGES,
  SPEECH_MODELS,
  setOverlayOpacity,
  setPreferredMicDeviceId,
  setPreferredScreenSourceId,
  setSelectedProviderId,
  setSessionContext,
  setTheme,
  setUiLanguage,
  updateProviderSettings,
} from "./settings-store.js";
import {
  createOverlayWindow,
  getOverlayWindow,
  hideOverlayWindow,
  setOverlayCollapsed,
  setOverlayWindowOpacity,
  showOverlayWindow,
  toggleClickThrough,
} from "./overlay-window.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = path.join(__dirname, "preload.cjs");
const rendererDistPath = path.join(__dirname, "../dist");
const iconPath = path.join(__dirname, "../assets/icon.png");
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
const pythonRuntime = new PythonRuntime();

function entryUrl(page: "main" | "overlay"): string {
  if (devServerUrl) return `${devServerUrl}/${page}.html`;
  return `file://${path.join(rendererDistPath, `${page}.html`)}`;
}

const isMac = process.platform === "darwin";

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 420,
    minHeight: 560,
    title: "Avalet",
    // On macOS the window is a translucent "sidebar" vibrancy pane (same
    // material System Settings uses) with inset traffic lights — the HTML
    // body stays transparent (styles.css) and lets it show through. Other
    // platforms fall back to a plain opaque window, same as before.
    show: false,
    backgroundColor: isMac ? undefined : "#0b0d10",
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    vibrancy: isMac ? "sidebar" : undefined,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });
  // Same as the overlay: the transcript and summary stay out of the user's
  // own screen share and recordings (macOS, Windows 10 2004+).
  win.setContentProtection(true);
  applyMainPinned(win, getMainPinned());
  // Launched from Finder the window can open behind other apps: the "visible
  // on full screen" flag below turns the app into a background-style process
  // that does not get activated by itself. Show, raise and activate it
  // explicitly, and put the Dock icon back.
  win.once("ready-to-show", () => {
    win.show();
    win.moveTop();
    if (isMac) {
      app.dock?.show();
      app.focus({ steal: true });
    }
  });
  void win.loadURL(entryUrl("main"));
  if (devServerUrl) win.webContents.openDevTools({ mode: "detach" });
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
}

// "Pinned" = floats above other windows like the overlay, so the notes stay
// reachable during a call; unpinned = an ordinary window.
function applyMainPinned(win: BrowserWindow, pinned: boolean): void {
  win.setAlwaysOnTop(pinned, "floating");
  win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });
}

function toggleMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function broadcastToOverlay(channel: string, payload?: unknown): void {
  getOverlayWindow()?.webContents.send(channel, payload);
}

function broadcastState(state: "idle" | "listening" | "paused"): void {
  broadcastToOverlay("avalet:event:session-state", state);
  mainWindow?.webContents.send("avalet:event:session-state", state);
}

const liveSession = new LiveSession(
  pythonRuntime,
  {
    onBlockStart: (block: LiveBlock) => broadcastToOverlay("avalet:event:block-start", { id: block.id }),
    onBlockDelta: (id, delta) => broadcastToOverlay("avalet:event:block-delta", { id, delta }),
    onBlockDone: (id) => broadcastToOverlay("avalet:event:block-done", { id }),
    onBlockError: (id, message) => broadcastToOverlay("avalet:event:block-error", { id, message }),
    onStateChange: broadcastState,
    onTranscriptionError: (message) => {
      broadcastToOverlay("avalet:event:transcription-error", message);
      mainWindow?.webContents.send("avalet:event:transcription-error", message);
    },
    onTranscriptionRecovered: () => {
      broadcastToOverlay("avalet:event:transcription-recovered");
      mainWindow?.webContents.send("avalet:event:transcription-recovered");
    },
    onTranscriptSegment: (segment) => {
      appendSegment(segment);
      mainWindow?.webContents.send("avalet:event:transcript-segment", segment);
    },
  },
  async () => {
    try {
      const shot = await captureScreenshot();
      return { image: shot.base64, ocrImage: shot.ocrBase64 };
    } catch (error) {
      console.error("[main] screenshot capture failed:", error);
      return null;
    }
  },
  async (pngBase64) => {
    try {
      return await recognizeScreenText(pngBase64);
    } catch (error) {
      console.error("[main] text recognition failed:", error);
      return null;
    }
  },
);

// Real native switch, not just CSS: window vibrancy on macOS follows
// nativeTheme; elsewhere there is no vibrancy, so the window's own
// background has to change with the theme or light mode ends up dark-on-dark.
function applyTheme(theme: "dark" | "light"): void {
  setTheme(theme);
  nativeTheme.themeSource = theme;
  if (!isMac) mainWindow?.setBackgroundColor(theme === "light" ? "#f5f5f7" : "#0b0d10");
}

function pickLabels(labels: unknown): (key: string, fallback: string) => string {
  const l = (labels ?? {}) as Record<string, unknown>;
  return (key, fallback) => (typeof l[key] === "string" ? (l[key] as string) : fallback);
}

function renderProtocol(id: string, labels: unknown, modeLabel: unknown): string {
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

function renderRawTranscript(id: string, labels: unknown): string {
  const meeting = readMeeting(id);
  if (!meeting) throw new Error("meeting not found");
  const pick = pickLabels(labels);
  return transcriptToRawText(meeting, { me: pick("me", "Me"), other: pick("other", "Other"), date: pick("date", "Date") });
}

function registerIpc(): void {
  // Loopback capture picks a screen source itself (no native share picker) —
  // steer it toward whatever the user chose in Settings, falling back to
  // the first available source if nothing's set or the saved one vanished
  // (e.g. a display got unplugged).
  initAudioLoopbackMain({
    onAfterGetSources: (sources: DesktopCapturerSource[]) => {
      const preferred = getPreferredScreenSourceId();
      const match = preferred ? sources.find((s) => s.id === preferred) : undefined;
      return [match ?? sources[0]];
    },
  });

  ipcMain.handle("avalet:settings-get-all", async () => ({
    selectedProviderId: getSelectedProviderId(),
    providers: getAllProviderSettings().map((s) => ({
      providerId: s.providerId,
      model: s.model,
      baseUrl: s.baseUrl,
      hasApiKey: hasApiKey(s.providerId),
    })),
    sessionContext: getSessionContext(),
    agendaText: getAgendaText(),
    autoDetectEnabled: getAutoDetectEnabled(),
    overlayOpacity: getOverlayOpacity(),
    theme: getTheme(),
    uiLanguage: getUiLanguage(),
    meetingMode: getMeetingMode(),
    mainPinned: getMainPinned(),
    screenshotText: getScreenshotTextEnabled(),
    ocrAvailable: await isOcrAvailable(),
    speechLanguage: getSpeechLanguage(),
    speechModel: getSpeechModel(),
  }));

  ipcMain.handle("avalet:speech-set", (_event, patch: unknown) => {
    const p = (patch ?? {}) as { language?: unknown; model?: unknown };
    if (p.language !== undefined) {
      if (!SPEECH_LANGUAGES.includes(p.language as never)) throw new Error("unknown speech language");
      setSpeechLanguage(p.language as never);
    }
    if (p.model !== undefined) {
      if (!SPEECH_MODELS.includes(p.model as never)) throw new Error("unknown speech model");
      setSpeechModel(p.model as never);
    }
  });

  ipcMain.handle("avalet:screenshot-text-set", (_event, enabled: unknown) => {
    setScreenshotTextEnabled(Boolean(enabled));
  });

  ipcMain.handle("avalet:main-set-pinned", (_event, pinned: unknown) => {
    const next = Boolean(pinned);
    setMainPinned(next);
    if (mainWindow) applyMainPinned(mainWindow, next);
  });
  ipcMain.handle("avalet:main-toggle", () => toggleMainWindow());
  ipcMain.handle("avalet:app-quit", () => app.quit());

  // Clears only the suggestion blocks in the overlay; the meeting record and
  // its transcript are untouched.
  ipcMain.handle("avalet:history-clear", () => {
    clearHistory();
    broadcastToOverlay("avalet:event:history-cleared");
  });

  ipcMain.handle("avalet:meeting-mode-set", (_event, mode: unknown) => {
    if (!isMeetingMode(mode)) throw new Error("unknown meeting mode");
    setMeetingMode(mode);
    setCurrentMode(mode);
    broadcastToOverlay("avalet:event:meeting-mode-changed", mode);
    mainWindow?.webContents.send("avalet:event:meeting-mode-changed", mode);
  });

  ipcMain.handle("avalet:meetings-list", () => listMeetings());
  ipcMain.handle("avalet:meetings-current", () => getCurrentMeeting());
  ipcMain.handle("avalet:meetings-get", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    return readMeeting(id);
  });
  ipcMain.handle("avalet:meetings-rename", (_event, id: unknown, title: unknown) => {
    if (typeof id !== "string" || typeof title !== "string") throw new Error("invalid arguments");
    renameMeeting(id, title);
  });
  ipcMain.handle("avalet:meetings-delete", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    deleteMeeting(id);
  });

  let summaryAbort: AbortController | null = null;
  ipcMain.handle("avalet:meetings-summarize", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    summaryAbort?.abort();
    const controller = new AbortController();
    summaryAbort = controller;
    flushCurrentMeeting();
    try {
      const { text, analysis } = await summarizeMeeting(id, controller.signal, {
        onDelta: (delta) => mainWindow?.webContents.send("avalet:event:summary-delta", { id, delta }),
      });
      mainWindow?.webContents.send("avalet:event:summary-done", {
        id,
        text,
        agendaStatus: analysis?.agendaStatus ?? null,
        actions: analysis?.actions ?? null,
      });
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mainWindow?.webContents.send("avalet:event:summary-error", { id, message });
      throw error;
    } finally {
      if (summaryAbort === controller) summaryAbort = null;
    }
  });

  async function saveFile(defaultName: string, filterName: string, extension: string, content: string): Promise<string | null> {
    const safe = defaultName.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
    const options = {
      defaultPath: path.join(app.getPath("documents"), `${safe}.${extension}`),
      filters: [{ name: filterName, extensions: [extension] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, "utf8");
    return result.filePath;
  }

  // The protocol: agenda checklist, per-topic discussion and the action table. No transcript in it.
  ipcMain.handle("avalet:meetings-export", async (_event, id: unknown, labels: unknown, modeLabel: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    const meeting = readMeeting(id);
    if (!meeting) throw new Error("meeting not found");
    return saveFile(meeting.title, "Markdown", "md", renderProtocol(id, labels, modeLabel));
  });

  // The raw transcript exactly as recognized, without any model processing.
  ipcMain.handle("avalet:meetings-export-transcript", async (_event, id: unknown, labels: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    const meeting = readMeeting(id);
    if (!meeting) throw new Error("meeting not found");
    return saveFile(`${meeting.title} - transcript`, "Text", "txt", renderRawTranscript(id, labels));
  });

  // Plain-text variant of the protocol for the clipboard: markdown marks stripped.
  ipcMain.handle("avalet:meetings-to-text", (_event, id: unknown, labels: unknown, modeLabel: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    return renderProtocol(id, labels, modeLabel).replace(/^#+ /gm, "").replace(/\*\*/g, "");
  });

  ipcMain.handle("avalet:meetings-set-agenda", (_event, id: unknown, agenda: unknown) => {
    if (typeof id !== "string") throw new Error("id must be a string");
    if (!Array.isArray(agenda) || agenda.some((q) => typeof q !== "string")) throw new Error("agenda must be a string array");
    return setAgenda(id, (agenda as string[]).map((q) => q.trim()).filter(Boolean));
  });

  ipcMain.handle("avalet:agenda-set", (_event, text: unknown) => {
    if (typeof text !== "string") throw new Error("text must be a string");
    setAgendaText(text);
  });

  ipcMain.handle("avalet:context-set", (_event, text: unknown) => {
    if (typeof text !== "string") throw new Error("text must be a string");
    setSessionContext(text);
  });

  ipcMain.handle("avalet:auto-detect-set", (_event, enabled: unknown) => {
    const next = Boolean(enabled);
    setAutoDetectEnabled(next);
    // Toggleable from both windows; broadcast so the other one stays in sync.
    broadcastToOverlay("avalet:event:auto-detect-changed", next);
    mainWindow?.webContents.send("avalet:event:auto-detect-changed", next);
  });

  ipcMain.handle("avalet:overlay-set-opacity", (_event, opacity: unknown) => {
    if (typeof opacity !== "number" || Number.isNaN(opacity)) throw new Error("opacity must be a number");
    setOverlayOpacity(opacity);
    setOverlayWindowOpacity(getOverlayOpacity());
  });

  ipcMain.handle("avalet:overlay-set-collapsed", (_event, collapsed: unknown) => {
    setOverlayCollapsed(Boolean(collapsed));
  });

  ipcMain.handle("avalet:theme-set", (_event, theme: unknown) => {
    if (theme !== "dark" && theme !== "light") throw new Error("theme must be 'dark' or 'light'");
    applyTheme(theme);
    broadcastToOverlay("avalet:event:theme-changed", theme);
    mainWindow?.webContents.send("avalet:event:theme-changed", theme);
  });

  ipcMain.handle("avalet:ui-language-set", (_event, language: unknown) => {
    if (language !== "ru" && language !== "en") throw new Error("language must be 'ru' or 'en'");
    setUiLanguage(language);
    broadcastToOverlay("avalet:event:ui-language-changed", language);
    mainWindow?.webContents.send("avalet:event:ui-language-changed", language);
  });

  ipcMain.handle("avalet:session-ask", async (_event, question: unknown) => {
    if (typeof question !== "string") throw new Error("question must be a string");
    await liveSession.askManual(question);
  });

  ipcMain.handle("avalet:session-ask-screen", async () => {
    await liveSession.askAboutScreen();
  });

  ipcMain.handle("avalet:session-process-now", async () => {
    await liveSession.processNow();
  });

  ipcMain.handle("avalet:settings-select-provider", (_event, providerId: unknown) => {
    if (typeof providerId !== "string") throw new Error("providerId must be a string");
    setSelectedProviderId(providerId);
  });

  ipcMain.handle(
    "avalet:settings-update-provider",
    (_event, providerId: unknown, patch: unknown) => {
      if (typeof providerId !== "string") throw new Error("providerId must be a string");
      const p = (patch ?? {}) as { model?: unknown; baseUrl?: unknown };
      updateProviderSettings(providerId, {
        model: typeof p.model === "string" ? p.model : undefined,
        baseUrl: typeof p.baseUrl === "string" ? p.baseUrl : undefined,
      });
    },
  );

  ipcMain.handle("avalet:settings-set-api-key", (_event, providerId: unknown, apiKey: unknown) => {
    if (typeof providerId !== "string") throw new Error("providerId must be a string");
    if (typeof apiKey !== "string") throw new Error("apiKey must be a string");
    setApiKey(providerId, apiKey);
  });

  ipcMain.handle("avalet:session-start", async () => {
    if (!pythonRuntime.getStatus().running) {
      await pythonRuntime.start().catch((error) => {
        console.error("[main] python-sidecar failed to start:", error);
      });
    }
    void warmUpOcr().catch(() => {});
    const meeting = startMeeting({
      titlePrefix: getUiLanguage() === "ru" ? "Встреча" : "Meeting",
      mode: getMeetingMode(),
      context: getSessionContext(),
      agenda: parseAgendaText(getAgendaText()),
    });
    mainWindow?.webContents.send("avalet:event:meeting-started", meeting);
    createOverlayWindow(preloadPath, entryUrl("overlay"));
    showOverlayWindow();
    liveSession.start();
  });

  ipcMain.handle("avalet:session-stop", () => {
    liveSession.stop();
    flushCurrentMeeting();
  });

  // The overlay window's page can finish loading after `session-start`
  // already broadcast its state change (send() has no queue for a
  // renderer that hasn't attached its listener yet) — fetched once on
  // mount so the collapsed/expanded strip never gets stuck on a stale
  // default instead of the real current state.
  ipcMain.handle("avalet:session-get-state", () => liveSession.getState());

  // Ends the current meeting record as well: the next Start opens a new one.
  ipcMain.handle("avalet:session-reset", () => {
    liveSession.reset();
    clearHistory();
    const ended = endCurrentMeeting();
    broadcastToOverlay("avalet:event:history-cleared");
    mainWindow?.webContents.send("avalet:event:meeting-ended", ended);
  });

  ipcMain.handle("avalet:history-get", (): HistoryBlock[] => getHistory());
  ipcMain.handle("avalet:history-append", (_event, block: unknown) => {
    const b = block as Partial<HistoryBlock>;
    if (typeof b.id !== "string" || typeof b.text !== "string") throw new Error("invalid history block");
    if (b.status !== "done" && b.status !== "error") throw new Error("invalid history block status");
    appendHistoryBlock({ id: b.id, text: b.text, status: b.status, createdAt: Date.now() });
  });

  ipcMain.handle("avalet:capture-screenshot", () => captureScreenshot());

  ipcMain.handle("avalet:permissions-check", () => ({
    mic: checkMicAccess(),
    screen: checkScreenAccess(),
  }));

  ipcMain.handle("avalet:mic-get-preferred", () => getPreferredMicDeviceId());
  ipcMain.handle("avalet:mic-set-preferred", (_event, deviceId: unknown) => {
    if (typeof deviceId !== "string") throw new Error("deviceId must be a string");
    setPreferredMicDeviceId(deviceId);
  });

  ipcMain.handle("avalet:screen-list-sources", () => listScreenSources());
  ipcMain.handle("avalet:screen-get-preferred", () => getPreferredScreenSourceId());
  ipcMain.handle("avalet:screen-set-preferred", (_event, sourceId: unknown) => {
    if (typeof sourceId !== "string") throw new Error("sourceId must be a string");
    setPreferredScreenSourceId(sourceId);
  });

  ipcMain.handle("avalet:capture-audio-chunk", async (_event, audioBase64: unknown, channel: unknown, meta: unknown) => {
    if (typeof audioBase64 !== "string") throw new Error("audioBase64 must be a string");
    const m = (meta ?? {}) as { startedAt?: unknown; endedAt?: unknown; endedBySilence?: unknown };
    const endedAt = typeof m.endedAt === "number" ? m.endedAt : Date.now();
    await liveSession.ingestAudioChunk(audioBase64, channel === "other" ? "other" : "me", {
      startedAt: typeof m.startedAt === "number" ? m.startedAt : endedAt,
      endedAt,
      endedBySilence: Boolean(m.endedBySilence),
    });
  });

  // Settings window owns the actual MediaStreams (see audio-capture.ts) — it
  // reports up/down state here so it can be broadcast to the overlay, which
  // has no direct access to those streams.
  ipcMain.handle("avalet:audio-degraded-set", (_event, state: unknown) => {
    const s = (state ?? {}) as { me?: unknown; other?: unknown };
    broadcastToOverlay("avalet:event:audio-degraded", { me: Boolean(s.me), other: Boolean(s.other) });
  });

  // The overlay can't reach the Settings window's MediaStreams directly —
  // relay the request there so whichever renderer holds the live
  // AudioCaptureHandle can actually call .reconnect() on it.
  ipcMain.handle("avalet:capture-reconnect-request", (_event, channel: unknown) => {
    mainWindow?.webContents.send(
      "avalet:event:reconnect-audio-requested",
      channel === "me" || channel === "other" ? channel : "both",
    );
  });

  ipcMain.handle("avalet:overlay-show", () => showOverlayWindow());
  ipcMain.handle("avalet:overlay-hide", () => hideOverlayWindow());
  ipcMain.handle("avalet:overlay-click-through", (_event, enabled: unknown) =>
    toggleClickThrough(Boolean(enabled)),
  );
}

// Design check without a Mac: AVALET_SCREENSHOT_DIR=<dir> electron . renders
// both windows in both themes to PNGs and quits. Used under Xvfb on CI/servers.
async function runScreenshotMode(dir: string): Promise<void> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const shoot = async (win: BrowserWindow, name: string) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
  };
  fs.mkdirSync(dir, { recursive: true });
  const main = mainWindow;
  if (!main) return;
  main.setSize(480, 1700);
  await wait(1500);
  await shoot(main, "main-settings-dark");
  applyTheme("light");
  main.webContents.send("avalet:event:theme-changed", "light");
  await wait(500);
  await shoot(main, "main-settings-light");
  applyTheme("dark");
  main.webContents.send("avalet:event:theme-changed", "dark");
  main.setSize(480, 720);
  const overlay = createOverlayWindow(preloadPath, entryUrl("overlay"));
  showOverlayWindow();
  await wait(1200);
  const fake = startMeeting({ mode: "requirements", context: "" });
  const base = Date.now() - 90_000;
  appendSegment({ at: base, speaker: "other", text: "Нам нужно, чтобы клиент мог менять лимит по карте прямо в приложении." });
  appendSegment({ at: base + 12_000, speaker: "me", text: "Лимит дневной или разовый? И кто подтверждает изменение выше порога?" });
  appendSegment({ at: base + 30_000, speaker: "other", text: "Дневной. Выше 300 тысяч нужен звонок из колл-центра, это уже есть в другом процессе." });
  main.webContents.send("avalet:event:meeting-started", fake);
  for (const theme of ["dark", "light"] as const) {
    applyTheme(theme);
    main.webContents.send("avalet:event:theme-changed", theme);
    overlay.webContents.send("avalet:event:theme-changed", theme);
    await wait(400);
    await shoot(main, `main-meeting-${theme}`);
    overlay.webContents.send("avalet:event:session-state", "listening");
    await wait(400);
    await shoot(overlay, `overlay-${theme}-expanded`);
    overlay.webContents.send("avalet:event:session-state", "paused");
    await wait(400);
    await shoot(overlay, `overlay-${theme}-collapsed`);
  }
  main.webContents.send("avalet:event:meeting-ended", endCurrentMeeting());
  applyTheme("dark");
  main.webContents.send("avalet:event:theme-changed", "dark");
  await wait(400);
  app.quit();
}

app.whenReady().then(() => {
  logLine(`[app] Avalet ${app.getVersion()} on ${process.platform}/${process.arch}, ${app.isPackaged ? "packaged" : "dev"}`);
  nativeTheme.themeSource = getTheme();
  registerIpc();
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createMainWindow();
  const screenshotDir = process.env.AVALET_SCREENSHOT_DIR;
  if (screenshotDir) {
    mainWindow?.webContents.once("did-finish-load", () => void runScreenshotMode(screenshotDir));
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", async () => {
  flushCurrentMeeting();
  await pythonRuntime.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  flushCurrentMeeting();
  await pythonRuntime.stop();
});
