import { useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useSession } from "../lib/session.js";
import { useAppSettings } from "../lib/settings.js";
import { useAccess } from "./AccessCard.js";
import { ContextFields } from "./ContextFields.js";
import { MeetingView } from "./MeetingView.js";
import { MEETING_MODES, type MeetingMode } from "../lib/types.js";
import { IconChevron } from "../icons.js";

type Props = {
  uiLanguage: UiLanguage;
  meeting: Meeting | null;
  /** Opens Simple settings at a section. */
  openSettings: (section?: "access" | "speech") => void;
};

/**
 * The Simple main screen: one Start/Pause button, meeting type, context,
 * then the meeting itself (transcript, summary, export). Every problem is one
 * sentence and one button.
 */
export function SimpleHome({ uiLanguage, meeting, openSettings }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const s = t.simple;
  const session = useSession();
  const { settings, patch } = useAppSettings();
  const access = useAccess();
  const [contextOpen, setContextOpen] = useState(!meeting);

  const listening = session.state === "listening";
  const status = listening ? s.statusListening : session.state === "paused" ? s.statusPaused : s.statusIdle;

  async function changeMode(mode: MeetingMode) {
    patch({ meetingMode: mode });
    await bridge.settings.setMeetingMode(mode);
  }

  // One problem at a time, most blocking first.
  let problem: { text: string; action: string; run: () => void } | null = null;
  const p = session.problem;
  if (p?.kind === "model-missing") {
    problem = {
      text: t.models.missingForStart,
      action: t.models.missingAction,
      run: () => {
        void bridge.speech.download(p.model);
        openSettings("speech");
      },
    };
  } else if (p?.kind === "mic-blocked") {
    problem = { text: s.micBlocked, action: s.openSystemSettings, run: () => void bridge.permissions.openSettings("mic") };
  } else if (p?.kind === "other") {
    problem = { text: p.message, action: s.tryAgain, run: () => void session.start() };
  } else if (session.transcriptionError) {
    problem = { text: s.speechBroken, action: s.reconnect, run: () => void session.reconnect("both") };
  } else if (access && ((access.mode === "own" && access.status === "no-key") || (access.mode === "avalet" && !access.canUseAvalet))) {
    const byStatus: Partial<Record<typeof access.status, string>> = {
      exhausted: t.access.exhausted,
      expired: t.access.expired,
      "offline-expired": t.access.offlineExpired,
      invalid: t.access.invalid,
    };
    problem = { text: byStatus[access.status] ?? s.needAccess, action: s.setUpAccess, run: () => openSettings("access") };
  }

  return (
    <div className="simple-home" data-testid="simple-home">
      <section className="session-card" aria-label={s.statusListening}>
        <div className="session-card-row">
          <span className={`dot ${session.state}`} aria-hidden="true" />
          <span className="session-status" role="status" data-testid="session-status">
            {status}
          </span>
        </div>
        <div className="session-card-row buttons">
          {listening ? (
            <button type="button" className="primary big" onClick={() => void session.pause()} data-testid="pause">
              {s.pause}
            </button>
          ) : (
            <button type="button" className="primary big" onClick={() => void session.start()} data-testid="start">
              {session.state === "paused" ? s.resume : s.start}
            </button>
          )}
          {session.state !== "idle" || meeting ? (
            <button type="button" onClick={() => void session.end()} data-testid="end">
              {s.end}
            </button>
          ) : null}
        </div>
        {problem ? (
          <div className="problem" role="alert" data-testid="problem">
            <span>{problem.text}</span>
            <button type="button" onClick={problem.run}>
              {problem.action}
            </button>
          </div>
        ) : null}
      </section>

      <section className="field">
        <label htmlFor="simple-mode">{t.modeLabel}</label>
        <select id="simple-mode" value={settings.meetingMode} onChange={(e) => void changeMode(e.target.value as MeetingMode)}>
          {MEETING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t.modes[mode]}
            </option>
          ))}
        </select>
      </section>

      <section className="collapsible">
        <button type="button" className="agenda-toggle" aria-expanded={contextOpen} onClick={() => setContextOpen((o) => !o)}>
          <span className={`chevron ${contextOpen ? "open" : ""}`} aria-hidden="true">
            <IconChevron />
          </span>
          <span>{s.contextToggle}</span>
        </button>
        {contextOpen ? <ContextFields uiLanguage={uiLanguage} hideMode /> : null}
      </section>

      {meeting ? (
        <MeetingView meeting={meeting} uiLanguage={uiLanguage} live={!meeting.endedAt} simple />
      ) : (
        <p className="hint empty-state">{s.noMeeting}</p>
      )}
    </div>
  );
}
