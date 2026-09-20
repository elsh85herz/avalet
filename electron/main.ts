import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, type DesktopCapturerSource } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initMain as initAudioLoopbackMain } from "electron-audio-loopback";
import { PythonRuntime } from "./python-runtime.js";
import { captureScreenshot } from "./ipc/screenshot.js";
import { checkMicAccess, checkScreenAccess } from "./ipc/permissions.js";
import { listScreenSources } from "./ipc/screen-sources.js";
import { appendHistoryBlock, clearHistory, getHistory, type HistoryBlock } from "./history-store.js";
import { LiveSession, type LiveBlock } from "./live-session.js";
import {
  getAllProviderSettings,
  getAutoDetectEnabled,
  getOverlayOpacity,
  getPreferredMicDeviceId,
  getPreferredScreenSourceId,
  getSelectedProviderId,
  getSessionContext,
  getTheme,
  getUiLanguage,
  hasApiKey,
  setApiKey,
  setAutoDetectEnabled,
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
  void win.loadURL(entryUrl("main"));
  if (devServerUrl) win.webContents.openDevTools({ mode: "detach" });
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
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
  },
  async () => {
    try {
      const shot = await captureScreenshot();
      return shot.base64;
    } catch (error) {
      console.error("[main] screenshot capture failed:", error);
      return null;
    }
  },
);

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

  ipcMain.handle("avalet:settings-get-all", () => ({
    selectedProviderId: getSelectedProviderId(),
    providers: getAllProviderSettings().map((s) => ({
      providerId: s.providerId,
      model: s.model,
      baseUrl: s.baseUrl,
      hasApiKey: hasApiKey(s.providerId),
    })),
    sessionContext: getSessionContext(),
    autoDetectEnabled: getAutoDetectEnabled(),
    overlayOpacity: getOverlayOpacity(),
    theme: getTheme(),
    uiLanguage: getUiLanguage(),
  }));

  ipcMain.handle("avalet:context-set", (_event, text: unknown) => {
    if (typeof text !== "string") throw new Error("text must be a string");
    setSessionContext(text);
  });

  ipcMain.handle("avalet:auto-detect-set", (_event, enabled: unknown) => {
    const next = Boolean(enabled);
    setAutoDetectEnabled(next);
    // Toggleable both from the settings window and from the overlay itself
    // (mid-session) — broadcast so whichever window didn't originate the
    // change stays in sync.
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
    setTheme(theme);
    // Real native switch, not just CSS: makes window vibrancy (and any
    // other OS chrome) actually render in the matching shade, independent
    // of the system's own appearance setting.
    nativeTheme.themeSource = theme;
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
    createOverlayWindow(preloadPath, entryUrl("overlay"));
    showOverlayWindow();
    liveSession.start();
  });

  ipcMain.handle("avalet:session-stop", () => {
    liveSession.stop();
  });

  // The overlay window's page can finish loading after `session-start`
  // already broadcast its state change (send() has no queue for a
  // renderer that hasn't attached its listener yet) — fetched once on
  // mount so the collapsed/expanded strip never gets stuck on a stale
  // default instead of the real current state.
  ipcMain.handle("avalet:session-get-state", () => liveSession.getState());

  ipcMain.handle("avalet:session-reset", () => {
    liveSession.reset();
    clearHistory();
    broadcastToOverlay("avalet:event:history-cleared");
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

  ipcMain.handle("avalet:capture-audio-chunk", async (_event, audioBase64: unknown, channel: unknown) => {
    if (typeof audioBase64 !== "string") throw new Error("audioBase64 must be a string");
    await liveSession.ingestAudioChunk(audioBase64, channel === "other" ? "other" : "me");
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

app.whenReady().then(() => {
  nativeTheme.themeSource = getTheme();
  registerIpc();
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", async () => {
  await pythonRuntime.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await pythonRuntime.stop();
});
