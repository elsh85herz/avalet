import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getBridge } from "./bridge.js";
import type { SettingsSnapshot } from "./types.js";

type SettingsApi = {
  settings: SettingsSnapshot;
  /** Re-reads everything from the main process. */
  reload: () => Promise<SettingsSnapshot>;
  /** Local optimistic update after a successful setter call. */
  patch: (next: Partial<SettingsSnapshot>) => void;
};

const SettingsContext = createContext<SettingsApi | null>(null);

/**
 * One copy of the settings for the whole main window, kept in sync with
 * changes made in the overlay (theme, language, mode, auto-suggest, opacity).
 */
export function SettingsProvider({ children, fallback }: { children: (settings: SettingsSnapshot) => ReactNode; fallback?: ReactNode }) {
  const bridge = getBridge();
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);

  async function reload(): Promise<SettingsSnapshot> {
    const next = await bridge.settings.getAll();
    setSettings(next);
    document.documentElement.dataset.theme = next.theme;
    document.documentElement.lang = next.uiLanguage;
    document.documentElement.dataset.platform = next.platform;
    return next;
  }

  function patch(next: Partial<SettingsSnapshot>): void {
    setSettings((prev) => (prev ? { ...prev, ...next } : prev));
    if (next.theme) document.documentElement.dataset.theme = next.theme;
    if (next.uiLanguage) document.documentElement.lang = next.uiLanguage;
  }

  useEffect(() => {
    void reload();
    const unsubscribers = [
      bridge.events.onThemeChanged((theme) => patch({ theme })),
      bridge.events.onUiLanguageChanged((uiLanguage) => patch({ uiLanguage })),
      bridge.events.onUiLevelChanged(() => void reload()),
      bridge.events.onMeetingModeChanged((meetingMode) => patch({ meetingMode })),
      bridge.events.onAutoDetectChanged((autoDetectEnabled) => patch({ autoDetectEnabled })),
      bridge.events.onOpacityChanged((overlayOpacity) => patch({ overlayOpacity })),
      bridge.events.onMeetingStarted(() => void reload()),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, []);

  if (!settings) return <>{fallback ?? null}</>;
  return <SettingsContext.Provider value={{ settings, reload, patch }}>{children(settings)}</SettingsContext.Provider>;
}

export function useAppSettings(): SettingsApi {
  const api = useContext(SettingsContext);
  if (!api) throw new Error("useAppSettings outside SettingsProvider");
  return api;
}
