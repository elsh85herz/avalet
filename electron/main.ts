import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell,
  type DesktopCapturerSource,
} from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { initMain as initAudioLoopbackMain } from "electron-audio-loopback";
import { AppCore, type Emit, type Handler, type WindowChannel } from "./app-core.js";
import { PythonRuntime, defaultSidecarCommand, type SidecarCommand } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { FakeCapture } from "./fake-capture.js";
import { BillingService } from "./billing/service.js";
import { billingConfigFromEnv } from "./billing/config.js";
import { HttpBillingProvider } from "./billing/http-provider.js";
import { MockBillingProvider } from "./billing/mock-provider.js";
import { hfHubCacheDir } from "./speech-models.js";
import { captureScreenshot } from "./ipc/screenshot.js";
import { isOcrAvailable, recognizeScreenText, warmUpOcr } from "./ocr/index.js";
import { configureLog, logLine } from "./log.js";
import { configurePaths, getPaths, sidecarDir } from "./platform/paths.js";
import type { KeyValueStore } from "./platform/kv.js";
import { checkMicAccess, checkScreenAccess } from "./ipc/permissions.js";
import { listScreenSources } from "./ipc/screen-sources.js";
import { initHistoryStore } from "./history-store.js";
import { appendSegment, endCurrentMeeting, flushCurrentMeeting, initMeetingsStore, setLiveAnalysis, startMeeting } from "./meetings-store.js";
import {
  getMainPinned,
  getOverlayOpacity,
  getPreferredScreenSourceId,
  getSelectedProviderId,
  getTheme,
  initSettingsStore,
  setMainPinned,
  setOverlayOpacity,
  setTheme,
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
import { EXTERNAL_CHANNELS, INVOKE_CHANNELS, type InvokeChannel, type Theme } from "./shared/ipc-contract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = path.join(__dirname, "preload.cjs");
const rendererDistPath = path.join(__dirname, "../dist");
const iconPath = path.join(__dirname, "../assets/icon.png");
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
/** Test mode: fake sidecar, fake model download, no real capture. Never set in a normal launch. */
const e2e = process.env.AVALET_E2E === "1";

// Tests run each launch against its own profile directory.
if (process.env.AVALET_USER_DATA_DIR) app.setPath("userData", process.env.AVALET_USER_DATA_DIR);

let mainWindow: BrowserWindow | null = null;
let core: AppCore | null = null;

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
    // material System Settings uses) with inset traffic lights; the HTML
    // body stays transparent (styles.css) and lets it show through. Other
    // platforms fall back to a plain opaque window.
    show: false,
    backgroundColor: isMac ? undefined : getTheme() === "light" ? "#f5f5f7" : "#0b0d10",
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    vibrancy: isMac ? "sidebar" : undefined,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });
  // Same as the overlay: the transcript and summary stay out of the user's
  // own screen share and recordings (macOS, Windows 10 2004+).
  win.setContentProtection(true);
  win.setOpacity(getOverlayOpacity());
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
  lockDownNavigation(win);
  void win.loadURL(entryUrl("main"));
  if (devServerUrl) win.webContents.openDevTools({ mode: "detach" });
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
}

/** Only web pages go to the system browser; never file: or custom schemes. */
function openExternal(url: string): void {
  if (!/^https?:\/\//.test(url)) return;
  // E2E has no browser: the test reads the URL (a mock checkout page) from a file.
  if (e2e && process.env.AVALET_E2E_EXPORT_DIR) {
    fs.appendFileSync(path.join(process.env.AVALET_E2E_EXPORT_DIR, "opened-urls.txt"), `${url}\n`);
    return;
  }
  void shell.openExternal(url);
}

/** The app's pages never navigate or open windows; links go to the system browser only if they are http(s). */
function lockDownNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
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

const emit: Emit = (channel, payload, target = "both") => {
  if (target !== "main") {
    const overlay = getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
  }
  if (target !== "overlay" && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

// Real native switch, not just CSS: window vibrancy on macOS follows
// nativeTheme; elsewhere there is no vibrancy, so the window's own
// background has to change with the theme or light mode ends up dark-on-dark.
function applyTheme(theme: Theme): void {
  setTheme(theme);
  nativeTheme.themeSource = theme;
  if (!isMac) mainWindow?.setBackgroundColor(theme === "light" ? "#f5f5f7" : "#0b0d10");
}

function fixture(name: string): string {
  return path.join(getPaths().devRoot, "test", "fixtures", name);
}

function sidecarCommand(): SidecarCommand {
  if (!e2e) return defaultSidecarCommand();
  return { command: process.execPath, args: [fixture("fake-sidecar.mjs")], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

function spawnModelDownload(model: string) {
  if (e2e) {
    return spawn(process.execPath, [fixture("fake-model-download.mjs"), model], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
  }
  const { command, args } = defaultSidecarCommand();
  return spawn(command, [args[0], "--download", model], {
    cwd: sidecarDir(),
    // Plain HTTP downloads write a growing .incomplete file, which is what the
    // progress bar measures; the chunked transfer backend does not.
    env: { ...process.env, HF_HUB_DISABLE_XET: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function electronStore(name: string, defaults: Record<string, unknown> = {}): KeyValueStore {
  return new Store<Record<string, unknown>>({ name, defaults }) as unknown as KeyValueStore;
}

function initStores(): void {
  // Linux CI has no keychain; test mode accepts Electron's plain-text backend there.
  if (e2e && process.platform === "linux") safeStorage.setUsePlainTextEncryption?.(true);
  configureLog(app.getPath("logs"));
  configurePaths({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
  initSettingsStore(electronStore("avalet-settings"), safeStorage, { forceAdvanced: process.env.AVALET_ADVANCED === "1" });
  initHistoryStore(electronStore("avalet-history", { blocks: [] }));
  initMeetingsStore(path.join(app.getPath("userData"), "meetings"));
}

async function chooseSavePath(defaultName: string, filterName: string, extension: string): Promise<string | null> {
  const options = {
    defaultPath: path.join(app.getPath("documents"), `${defaultName}.${extension}`),
    filters: [{ name: filterName, extensions: [extension] }],
  };
  // E2E cannot click a native dialog: exports go to a folder the test chose.
  if (e2e && process.env.AVALET_E2E_EXPORT_DIR) {
    return path.join(process.env.AVALET_E2E_EXPORT_DIR, `${defaultName}.${extension}`);
  }
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

function createBilling(): { billing: BillingService; proxyUrl: string } {
  const config = billingConfigFromEnv();
  const billing = new BillingService({
    kv: electronStore("avalet-billing"),
    secrets: safeStorage,
    publicKeys: config.publicKeys,
    makeProvider: (identity) =>
      config.mode === "mock"
        ? new MockBillingProvider(() => identity().installId, Date.now, { autoPay: "succeed" })
        : new HttpBillingProvider(config.baseUrl, identity),
    selectedProviderId: getSelectedProviderId,
    ownKeyReady: () => AppCore.ownKeyReady(getSelectedProviderId()),
    onChange: (state) => emit("avalet:event:access-changed", state),
    openExternal,
  });
  return { billing, proxyUrl: `${config.baseUrl}/v1/llm` };
}

function createCore(): AppCore {
  const { billing, proxyUrl } = createBilling();
  const sidecar = new PythonRuntime(sidecarCommand);
  const models = new SpeechModelManager({
    cacheDir: () => hfHubCacheDir(),
    spawnDownload: spawnModelDownload,
    onChange: (rows) => emit("avalet:event:models-changed", rows, "main"),
  });
  return new AppCore({
    sidecar,
    models,
    ledger: new UsageLedger(electronStore("avalet-usage")),
    billing,
    avaletProxyUrl: proxyUrl,
    emit,
    captureScreen: async () => {
      if (e2e) return null;
      try {
        const shot = await captureScreenshot();
        return { image: shot.base64, ocrImage: shot.ocrBase64 };
      } catch (error) {
        console.error("[main] screenshot capture failed:", error);
        return null;
      }
    },
    recognizeText: async (imageBase64) => {
      try {
        return await recognizeScreenText(imageBase64);
      } catch (error) {
        console.error("[main] text recognition failed:", error);
        return null;
      }
    },
    isOcrAvailable,
    chooseSavePath,
    fakeCapture: e2e,
    onSessionStarted: () => {
      void warmUpOcr().catch(() => {});
      createOverlayWindow(preloadPath, entryUrl("overlay"));
      showOverlayWindow();
      fakeCapture?.start();
    },
  });
}

/** E2E only: canned audio into the normal pipeline (see fake-capture.ts). */
let fakeCapture: FakeCapture | null = null;

function registerIpc(appCore: AppCore): void {
  // Loopback capture picks a screen source itself (no native share picker):
  // steer it toward whatever the user chose in Settings, falling back to
  // the first available source if nothing's set or the saved one vanished.
  initAudioLoopbackMain({
    onAfterGetSources: (sources: DesktopCapturerSource[]) => {
      const preferred = getPreferredScreenSourceId();
      const match = preferred ? sources.find((s) => s.id === preferred) : undefined;
      return [match ?? sources[0]];
    },
  });

  // Channels that need a window, a dialog or an Electron-only API.
  const windowHandlers: { [C in WindowChannel]: Handler<C> } = {
    "avalet:main-set-pinned": (pinned) => {
      const next = Boolean(pinned);
      setMainPinned(next);
      if (mainWindow) applyMainPinned(mainWindow, next);
    },
    "avalet:main-toggle": () => toggleMainWindow(),
    "avalet:main-show-access": () => {
      if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
      mainWindow?.show();
      mainWindow?.focus();
      emit("avalet:event:navigate", "access", "main");
    },
    "avalet:app-quit": () => app.quit(),
    "avalet:open-logs": () => {
      void shell.openPath(app.getPath("logs"));
    },
    "avalet:overlay-set-opacity": (opacity) => {
      if (typeof opacity !== "number" || Number.isNaN(opacity)) throw new Error("opacity must be a number");
      setOverlayOpacity(opacity);
      const applied = getOverlayOpacity();
      // One setting drives every window: overlay and main, and every open slider follows.
      setOverlayWindowOpacity(applied);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(applied);
      emit("avalet:event:opacity-changed", applied);
    },
    "avalet:overlay-set-collapsed": (collapsed) => setOverlayCollapsed(Boolean(collapsed)),
    "avalet:overlay-show": () => showOverlayWindow(),
    "avalet:overlay-hide": () => hideOverlayWindow(),
    "avalet:overlay-click-through": (enabled) => toggleClickThrough(Boolean(enabled)),
    "avalet:theme-set": (theme) => {
      if (theme !== "dark" && theme !== "light") throw new Error("theme must be 'dark' or 'light'");
      applyTheme(theme);
      emit("avalet:event:theme-changed", theme);
    },
    "avalet:capture-screenshot": () => captureScreenshot(),
    "avalet:permissions-check": () => ({ mic: checkMicAccess(), screen: checkScreenAccess() }),
    "avalet:open-privacy-settings": (kind) => {
      if (!isMac) return;
      const pane = kind === "screen" ? "Privacy_ScreenCapture" : "Privacy_Microphone";
      void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
    },
    "avalet:screen-list-sources": () => listScreenSources(),
  };

  const all = { ...appCore.handlers, ...windowHandlers } as Record<string, Handler<InvokeChannel>>;
  const missing = INVOKE_CHANNELS.filter((channel) => !all[channel] && !EXTERNAL_CHANNELS.includes(channel));
  if (missing.length > 0) throw new Error(`IPC channels without a handler: ${missing.join(", ")}`);
  for (const [channel, handler] of Object.entries(all)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
  }
}

// Design check without a Mac: AVALET_SCREENSHOT_DIR=<dir> electron . renders
// both windows in both themes to PNGs and quits. Used under Xvfb on CI/servers.
async function runScreenshotMode(dir: string, appCore: AppCore): Promise<void> {
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
  emit("avalet:event:theme-changed", "light");
  await wait(500);
  await shoot(main, "main-settings-light");
  applyTheme("dark");
  emit("avalet:event:theme-changed", "dark");
  main.setSize(480, 720);
  const overlay = createOverlayWindow(preloadPath, entryUrl("overlay"));
  showOverlayWindow();
  await wait(1200);
  const fake = startMeeting({
    mode: "requirements",
    context: "",
    agenda: ["Кто подтверждает изменение лимита", "Какой лимит: дневной или разовый", "Сроки и владелец интеграции"],
  });
  setLiveAnalysis(fake.id, {
    agendaStatus: [
      { question: "Кто подтверждает изменение лимита", closed: false, active: true, note: "выше 300 тыс. звонок из колл-центра" },
      { question: "Какой лимит: дневной или разовый", closed: true, note: "дневной" },
      { question: "Сроки и владелец интеграции", closed: false, note: "" },
    ],
    actions: [
      { id: "demo-1", task: "Прислать описание процесса колл-центра", owner: "Собеседник", due: "до пятницы", state: "proposed" },
      { id: "demo-2", task: "Завести задачу по лимитам", owner: "Я", due: "срок не назван", state: "confirmed" },
    ],
  });
  const base = Date.now() - 90_000;
  appendSegment({ at: base, speaker: "other", text: "Нам нужно, чтобы клиент мог менять лимит по карте прямо в приложении." });
  appendSegment({ at: base + 12_000, speaker: "me", text: "Лимит дневной или разовый? И кто подтверждает изменение выше порога?" });
  appendSegment({ at: base + 30_000, speaker: "other", text: "Дневной. Выше 300 тысяч нужен звонок из колл-центра, это уже есть в другом процессе." });
  emit("avalet:event:meeting-started", fake, "main");
  for (const theme of ["dark", "light"] as const) {
    applyTheme(theme);
    emit("avalet:event:theme-changed", theme);
    await wait(400);
    await shoot(main, `main-meeting-${theme}`);
    overlay.webContents.send("avalet:event:session-state", "listening");
    overlay.webContents.send("avalet:event:tracker-update", appCore.liveTracker.getState());
    await wait(400);
    await shoot(overlay, `overlay-${theme}-expanded`);
    await overlay.webContents.executeJavaScript('document.querySelector(".tracker-toggle")?.click()');
    await wait(400);
    await shoot(overlay, `overlay-${theme}-checklist`);
    await overlay.webContents.executeJavaScript('document.querySelector(".tracker-toggle")?.click()');
    overlay.webContents.send("avalet:event:session-state", "paused");
    await wait(400);
    await shoot(overlay, `overlay-${theme}-collapsed`);
  }
  emit("avalet:event:meeting-ended", endCurrentMeeting(), "main");
  applyTheme("dark");
  emit("avalet:event:theme-changed", "dark");
  await wait(400);
  app.quit();
}

app.whenReady().then(() => {
  initStores();
  logLine(`[app] Avalet ${app.getVersion()} on ${process.platform}/${process.arch}, ${app.isPackaged ? "packaged" : "dev"}${e2e ? ", e2e" : ""}`);
  nativeTheme.themeSource = getTheme();
  // Every launch starts fully opaque; the opacity slider then adjusts both windows.
  setOverlayOpacity(1);
  core = createCore();
  if (e2e) {
    const handler = core.handlers["avalet:capture-audio-chunk"]!;
    fakeCapture = new FakeCapture(async (audio, channel, meta) => {
      await handler(audio, channel, meta);
    });
    const reset = core.handlers["avalet:session-reset"]!;
    core.handlers["avalet:session-reset"] = (...args) => {
      fakeCapture?.reset();
      return reset(...args);
    };
  }
  registerIpc(core);
  core.startBackground();
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createMainWindow();
  const screenshotDir = process.env.AVALET_SCREENSHOT_DIR;
  if (screenshotDir) {
    const appCore = core;
    mainWindow?.webContents.once("did-finish-load", () => void runScreenshotMode(screenshotDir, appCore));
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  flushCurrentMeeting();
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (event) => {
  if (quitting || !core) return;
  // Save the meeting and stop the recognizer before the process goes away.
  event.preventDefault();
  quitting = true;
  void core.shutdown().finally(() => app.quit());
});
