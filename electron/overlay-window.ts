import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOverlayOpacity } from "./settings-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let overlayWindow: BrowserWindow | null = null;
let collapsed = false;
let expandedHeight = 560;
// Strip row + the always-present nav row underneath it (see OverlayApp.tsx
// navRow) — was a single 44px row before paging got its own fixed row.
const COLLAPSED_HEIGHT = 78;

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function createOverlayWindow(preloadPath: string, entryUrl: string): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const display = screen.getPrimaryDisplay();
  const width = 380;
  const height = 560;
  expandedHeight = height;
  collapsed = false;

  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 24,
    y: display.workArea.y + 24,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    // "hud" is the same frosted, floating-tool-palette material macOS uses
    // for things like Photoshop's tool panels — the native look for an
    // always-on-top overlay. No-op on non-macOS (stays flat transparent).
    vibrancy: isMac ? "hud" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // That flag can hide the Dock icon on macOS; keep the app visible there.
  if (isMac) app.dock?.show();
  win.setOpacity(getOverlayOpacity());

  // Keeps the overlay out of screen-share / screen-recording capture on
  // macOS and Windows 10 2004+. Best-effort elsewhere — see README.
  win.setContentProtection(true);

  void win.loadURL(entryUrl);

  win.on("closed", () => {
    overlayWindow = null;
  });

  // Tracks manual/drag-handle resizes made while expanded, so collapsing
  // and expanding again restores exactly the size the user left it at
  // (not always back to the 560px default).
  win.on("resize", () => {
    if (collapsed) return;
    const [, h] = win.getSize();
    expandedHeight = h;
  });

  overlayWindow = win;
  return win;
}

/**
 * Shrinks the overlay down to a thin control strip (header + paging, no
 * block text/quick-actions/ask row — see OverlayApp.tsx) so it stops
 * covering whatever's behind it while stopped, without losing access to
 * the controls or to paging through already-saved blocks. Anchored at the
 * top-right corner, so shrinking only moves the bottom edge up.
 */
export function setOverlayCollapsed(next: boolean): void {
  if (!overlayWindow) return;
  collapsed = next;
  const [w] = overlayWindow.getSize();
  overlayWindow.setSize(w, next ? COLLAPSED_HEIGHT : expandedHeight, false);
}

export function showOverlayWindow(): void {
  overlayWindow?.showInactive();
}

export function hideOverlayWindow(): void {
  overlayWindow?.hide();
}

export function toggleClickThrough(enabled: boolean): void {
  overlayWindow?.setIgnoreMouseEvents(enabled, { forward: true });
}

export function setOverlayWindowOpacity(opacity: number): void {
  overlayWindow?.setOpacity(opacity);
}

export { __dirname as electronDir };
