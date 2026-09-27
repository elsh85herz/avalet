import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import { UI_STRINGS } from "../lib/i18n.js";
import { SettingsProvider, useAppSettings } from "../lib/settings.js";
import { SessionProvider, useSession } from "../lib/session.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { MeetingView } from "./MeetingView.js";
import { MeetingsList } from "./MeetingsList.js";
import { FirstRunWizard } from "./FirstRunWizard.js";
import { HowItWorks } from "./HowItWorks.js";
import { SimpleHome } from "./SimpleHome.js";
import { SimpleSettings } from "./SimpleSettings.js";
import { IconGear, IconHelp, IconPause, IconPin, IconPlay } from "../icons.js";

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
  const [guideOpen, setGuideOpen] = useState(false);
  const session = useSession();

  async function closeGuide() {
    setGuideOpen(false);
    if (!settings.guideSeen) {
      patch({ guideSeen: true });
      await bridge.settings.setGuideSeen(true);
    }
  }

  const helpButton = (
    <button
      type="button"
      className="pin-btn"
      onClick={() => setGuideOpen(true)}
      title={t.simple.help}
      aria-label={t.simple.help}
      data-testid="open-guide"
    >
      <IconHelp />
    </button>
  );

  useEffect(() => {
    void bridge.meetings.current().then(setCurrent);
    const unsubscribers = [
      bridge.events.onMeetingStarted((meeting) => {
        setCurrent(meeting);
        setLastEnded(null);
        setAdvancedTab("meeting");
        setSimpleView("home");
        // Interview: overlay only, the notes window would just be a second
        // thing to look at while answering questions.
        if (meeting.mode === "interview") void bridge.app.hideMain();
      }),
      bridge.events.onMeetingEnded((ended) => {
        setCurrent(null);
        setLastEnded(ended);
        // Always land on the summary, whichever tab was open (Settings, History...)
        // when End was pressed, in the main window or from the overlay, and
        // whether or not the window was hidden for an interview meeting.
        setAdvancedTab("meeting");
        setSimpleView("home");
        void bridge.app.focusMain();
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
  if (guideOpen || !settings.guideSeen) {
    return (
      <HowItWorks
        uiLanguage={settings.uiLanguage}
        mode={settings.guideSeen ? "reopened" : "first-run"}
        meetingMode={settings.meetingMode}
        onClose={() => void closeGuide()}
      />
    );
  }

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

  // While a meeting runs, Pause/Resume is one click away from every screen of the main window.
  const listening = session.state === "listening";
  const sessionChip =
    session.state === "idle" ? null : (
      <button
        type="button"
        className={`header-session ${session.state}`}
        onClick={() => void (listening ? session.pause() : session.start())}
        title={listening ? t.overlay.pauseTitle : t.overlay.resumeTitle}
        data-testid="header-pause"
      >
        <span className={`dot ${session.state}`} aria-hidden="true" />
        {listening ? <IconPause /> : <IconPlay />}
        <span>{listening ? t.simple.pause : t.simple.resume}</span>
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
            {helpButton}
            {simpleView !== "home" ? sessionChip : null}
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
          {helpButton}
          {sessionChip}
          {pinButton}
        </nav>
      </header>
      <div className="app-scroll">
        <div className={advancedTab === "settings" ? "" : "tab-hidden"}>
          <SettingsPanel onRunSetup={runSetupAgain} />
        </div>
        {advancedTab === "meeting" ? (
          <div className="tab-body">
            {current ?? lastEnded ? (
              <MeetingView meeting={(current ?? lastEnded)!} uiLanguage={settings.uiLanguage} live={!(current ?? lastEnded)!.endedAt} />
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
