import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import { UI_STRINGS } from "../lib/i18n.js";
import { SettingsProvider, useAppSettings } from "../lib/settings.js";
import { SessionProvider } from "../lib/session.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { MeetingView } from "./MeetingView.js";
import { MeetingsList } from "./MeetingsList.js";
import { FirstRunWizard } from "./FirstRunWizard.js";
import { SimpleHome } from "./SimpleHome.js";
import { SimpleSettings } from "./SimpleSettings.js";
import { IconGear, IconPin } from "../icons.js";

export function MainApp() {
  return (
    <SettingsProvider fallback={<div className="main-app" />}>
      {(settings) => (
        <SessionProvider fakeCapture={settings.fakeCapture}>
          <Shell />
        </SessionProvider>
      )}
    </SettingsProvider>
  );
}

type AdvancedTab = "settings" | "meeting" | "meetings";
type SimpleView = "home" | "history" | "settings";

/**
 * One app, two levels. A new user gets the first-run wizard, then the Simple
 * level; Advanced (every setting) is one switch away, or AVALET_ADVANCED=1.
 */
function Shell() {
  const bridge = getBridge();
  const { settings, patch } = useAppSettings();
  const t = UI_STRINGS[settings.uiLanguage];
  const [wizard, setWizard] = useState(!settings.onboardingDone);
  const [current, setCurrent] = useState<Meeting | null>(null);
  // The meeting that just ended stays on the Simple screen for its summary and export.
  const [lastEnded, setLastEnded] = useState<Meeting | null>(null);
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>("settings");
  const [simpleView, setSimpleView] = useState<SimpleView>("home");
  const [settingsFocus, setSettingsFocus] = useState<"access" | "speech" | undefined>(undefined);

  useEffect(() => {
    void bridge.meetings.current().then(setCurrent);
    const unsubscribers = [
      bridge.events.onMeetingStarted((meeting) => {
        setCurrent(meeting);
        setLastEnded(null);
        setAdvancedTab("meeting");
        setSimpleView("home");
      }),
      bridge.events.onMeetingEnded((ended) => {
        setCurrent(null);
        setLastEnded(ended);
      }),
      bridge.events.onNavigate((to) => {
        if (to !== "access") return;
        setAdvancedTab("settings");
        setSettingsFocus("access");
        setSimpleView("settings");
      }),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, []);

  async function togglePinned() {
    const next = !settings.mainPinned;
    patch({ mainPinned: next });
    await bridge.settings.setMainPinned(next);
  }

  function runSetupAgain() {
    void bridge.settings.setOnboardingDone(false);
    setWizard(true);
  }

  if (wizard) return <FirstRunWizard onDone={() => setWizard(false)} />;

  const pinButton = (
    <button
      type="button"
      className={`pin-btn ${settings.mainPinned ? "on" : ""}`}
      onClick={() => void togglePinned()}
      title={settings.mainPinned ? t.settings.pinTitle : t.settings.unpinTitle}
      aria-label={settings.mainPinned ? t.settings.pinTitle : t.settings.unpinTitle}
      aria-pressed={settings.mainPinned}
    >
      <IconPin />
    </button>
  );

  if (settings.uiLevel === "simple") {
    const tabs: Array<[SimpleView, string]> = [
      ["home", t.tabs.meeting],
      ["history", t.tabs.meetings],
    ];
    return (
      <div className="main-app simple" data-level="simple">
        <header className="app-header">
          <nav className="tabs" aria-label="Avalet">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`tab ${simpleView === id ? "active" : ""}`}
                aria-current={simpleView === id ? "page" : undefined}
                onClick={() => setSimpleView(id)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={`pin-btn gear-btn ${simpleView === "settings" ? "on" : ""}`}
              onClick={() => {
                setSettingsFocus(undefined);
                setSimpleView(simpleView === "settings" ? "home" : "settings");
              }}
              title={t.simple.settings}
              aria-label={t.simple.settings}
              data-testid="open-settings"
            >
              <IconGear />
            </button>
            {pinButton}
          </nav>
        </header>
        <div className="app-scroll">
          {simpleView === "home" ? (
            <div className="tab-body">
              <SimpleHome
                uiLanguage={settings.uiLanguage}
                meeting={current ?? lastEnded}
                openSettings={(section) => {
                  setSettingsFocus(section);
                  setSimpleView("settings");
                }}
              />
            </div>
          ) : null}
          {simpleView === "history" ? (
            <div className="tab-body">
              <MeetingsList uiLanguage={settings.uiLanguage} simple />
            </div>
          ) : null}
          {simpleView === "settings" ? (
            <SimpleSettings uiLanguage={settings.uiLanguage} focus={settingsFocus} onBack={() => setSimpleView("home")} onRunSetup={runSetupAgain} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="main-app" data-level="advanced">
      <header className="app-header">
        <nav className="tabs" aria-label="Avalet">
          {(["settings", "meeting", "meetings"] as AdvancedTab[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`tab ${advancedTab === id ? "active" : ""}`}
              aria-current={advancedTab === id ? "page" : undefined}
              onClick={() => setAdvancedTab(id)}
            >
              {t.tabs[id]}
            </button>
          ))}
          {pinButton}
        </nav>
      </header>
      <div className="app-scroll">
        <div className={advancedTab === "settings" ? "" : "tab-hidden"}>
          <SettingsPanel onRunSetup={runSetupAgain} />
        </div>
        {advancedTab === "meeting" ? (
          <div className="tab-body">
            {current ? (
              <MeetingView meeting={current} uiLanguage={settings.uiLanguage} live />
            ) : (
              <p className="hint">{t.meeting.noCurrent}</p>
            )}
          </div>
        ) : null}
        {advancedTab === "meetings" ? (
          <div className="tab-body">
            <MeetingsList uiLanguage={settings.uiLanguage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
