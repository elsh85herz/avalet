import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { MeetingView } from "./MeetingView.js";
import { MeetingsList } from "./MeetingsList.js";
import { IconPin } from "../icons.js";

type Tab = "settings" | "meeting" | "meetings";

export function MainApp() {
  const bridge = getBridge();
  const [tab, setTab] = useState<Tab>("settings");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("ru");
  const [current, setCurrent] = useState<Meeting | null>(null);
  const [pinned, setPinned] = useState(true);
  const [opacity, setOpacity] = useState(1);

  async function togglePinned() {
    const next = !pinned;
    setPinned(next);
    await bridge.settings.setMainPinned(next);
  }

  useEffect(() => {
    void bridge.settings.getAll().then((all) => {
      setUiLanguage(all.uiLanguage);
      setPinned(all.mainPinned);
      setOpacity(all.overlayOpacity);
    });
    void bridge.meetings.current().then(setCurrent);
    const unsubscribers = [
      bridge.events.onUiLanguageChanged(setUiLanguage),
      bridge.events.onOpacityChanged(setOpacity),
      bridge.events.onMeetingStarted((meeting) => {
        setCurrent(meeting);
        setTab("meeting");
      }),
      bridge.events.onMeetingEnded(() => setCurrent(null)),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, []);

  const t = UI_STRINGS[uiLanguage];

  return (
    <div className="main-app">
      <header className="app-header">
        <nav className="tabs">
          {(["settings", "meeting", "meetings"] as Tab[]).map((id) => (
            <button key={id} type="button" className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              {t.tabs[id]}
            </button>
          ))}
          <label className="opacity-control header-opacity" title={t.opacityTitle}>
            <span>{t.opacityLabel}</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => {
                const value = Number(e.target.value);
                setOpacity(value);
                void bridge.overlay.setOpacity(value);
              }}
            />
          </label>
          <button
            type="button"
            className={`pin-btn ${pinned ? "on" : ""}`}
            onClick={() => void togglePinned()}
            title={pinned ? t.settings.pinTitle : t.settings.unpinTitle}
          >
            <IconPin />
          </button>
        </nav>
      </header>
      <div className="app-scroll">
        <div className={tab === "settings" ? "" : "tab-hidden"}>
          <SettingsPanel />
        </div>
        {tab === "meeting" ? (
          current ? (
            <div className="tab-body">
              <MeetingView meeting={current} uiLanguage={uiLanguage} live />
            </div>
          ) : (
            <div className="tab-body">
              <p className="hint">{t.meeting.noCurrent}</p>
            </div>
          )
        ) : null}
        {tab === "meetings" ? (
          <div className="tab-body">
            <MeetingsList uiLanguage={uiLanguage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
