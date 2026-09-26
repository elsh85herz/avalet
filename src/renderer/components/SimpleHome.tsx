import { useEffect, useState } from "react";
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
import { useSpeechModels } from "./SpeechModels.js";
import { problemText, readinessOf, topProblem, type Problem, type ProblemInput, type Readiness } from "../lib/problems.js";
import type { PermissionStatus } from "../lib/types.js";

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
  const models = useSpeechModels();
  const [permissions, setPermissions] = useState<{ mic: PermissionStatus; screen: PermissionStatus } | null>(null);
  const [checking, setChecking] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  // Permissions can change in System Settings at any time: look again on focus and every few seconds.
  useEffect(() => {
    const look = () => void bridge.permissions.check().then(setPermissions);
    look();
    const timer = setInterval(look, 5_000);
    window.addEventListener("focus", look);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", look);
    };
  }, []);

  const listening = session.state === "listening";

  async function changeMode(mode: MeetingMode) {
    patch({ meetingMode: mode });
    await bridge.settings.setMeetingMode(mode);
  }

  // One problem at a time, most blocking first (lib/problems.ts), and a
  // one-line summary of what is ready.
  const p = session.problem;
  const problemInput: ProblemInput = {
    model: models?.find((r) => r.name === settings.speechModel) ?? null,
    waitingForModel: session.waitingForModel,
    permissions,
    micBlockedOnStart: p?.kind === "mic-blocked",
    access,
    startError: p?.kind === "other" ? p.message : null,
    transcriptionError: Boolean(session.transcriptionError),
    audioDegraded: session.audioDegraded,
    capturing: session.capturing,
  };
  const top = topProblem(problemInput);
  const status = listening
    ? s.statusListening
    : session.state === "paused"
      ? s.statusPaused
      : session.waitingForModel
        ? s.statusWaiting
        : top
          ? s.statusNotReady
          : s.statusIdle;
  const shown = top ? problemText(top, t) : null;
  const problemMessage = top?.kind === "key-failed" && keyMessage ? `${shown!.text} ${keyMessage}` : shown?.text;

  async function checkKey() {
    setChecking(true);
    try {
      const result = await bridge.billing.testProvider(settings.selectedProviderId);
      setKeyMessage(result.ok ? null : result.message);
    } finally {
      setChecking(false);
    }
  }

  function runProblem(problem: Problem) {
    switch (problem.kind) {
      case "model-missing":
      case "model-partial":
      case "model-error":
        void bridge.speech.download(problem.model);
        return;
      case "model-downloading":
        session.cancelWaiting();
        return;
      case "mic-blocked":
        void bridge.permissions.openSettings("mic");
        return;
      case "screen-blocked":
        void bridge.permissions.openSettings("screen");
        return;
      case "key-unchecked":
        void checkKey();
        return;
      case "start-failed":
        void session.start();
        return;
      case "transcription":
        void session.reconnect("both");
        return;
      case "audio-degraded":
        void session.reconnect(problem.channel);
        return;
      default:
        openSettings("access");
    }
  }

  const readiness = readinessOf(problemInput);
  const r = s.readiness;
  const itemName = (item: Readiness["item"]) =>
    item === "model" ? r.model : item === "access" ? (access?.mode === "avalet" ? r.avalet : r.key) : item === "mic" ? r.mic : r.screen;
  const mark = { ok: "✓", missing: "!", pending: "…" } as const;

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
        <ul className="readiness" aria-label={r.label} data-testid="readiness">
          {readiness.map((item) => (
            <li
              key={item.item}
              className={`ready-pill ${item.state}`}
              data-item={item.item}
              data-state={item.state}
              title={`${itemName(item.item)}: ${r[item.state]}`}
              aria-label={`${itemName(item.item)}: ${r[item.state]}`}
            >
              <span aria-hidden="true">{mark[item.state]}</span> {itemName(item.item)}
            </li>
          ))}
        </ul>
        {top && shown ? (
          <div className="problem" role="alert" data-testid="problem" data-kind={top.kind}>
            <span>{problemMessage}</span>
            {shown.action ? (
              <button type="button" onClick={() => runProblem(top)} disabled={checking} data-testid="problem-action">
                {top.kind === "key-unchecked" && checking ? `${t.wizard.testing}…` : shown.action}
              </button>
            ) : null}
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
