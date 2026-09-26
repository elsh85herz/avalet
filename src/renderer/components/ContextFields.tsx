import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { MEETING_MODES, type MeetingMode } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { parseAgendaText } from "../lib/agenda.js";
import { useAppSettings } from "../lib/settings.js";
import { IconHelp } from "../icons.js";

type Props = {
  uiLanguage: UiLanguage;
  /** Wizard wording: "what is this project or your role" instead of "meeting context". */
  roleWording?: boolean;
  /** Advanced: agenda from a file and the per-mode help list. */
  advanced?: boolean;
  /** Hide the mode picker (shown elsewhere). */
  hideMode?: boolean;
};

/**
 * Meeting type, briefing and agenda. Text saves itself shortly after typing
 * stops, so what Start picks up (and what the summary later uses) is always
 * what is on screen.
 */
export function ContextFields({ uiLanguage, roleWording, advanced, hideMode }: Props) {
  const bridge = getBridge();
  const { settings, patch } = useAppSettings();
  const strings = UI_STRINGS[uiLanguage];
  const t = strings.settings;
  const [context, setContext] = useState(settings.sessionContext);
  const [contextSaved, setContextSaved] = useState(true);
  const [agenda, setAgenda] = useState(settings.agendaText);
  const [agendaSaved, setAgendaSaved] = useState(true);
  const [modeHelpOpen, setModeHelpOpen] = useState(false);
  // "Saved" only makes sense after the user typed something.
  const [edited, setEdited] = useState({ context: false, agenda: false });
  const fileRef = useRef<HTMLInputElement | null>(null);

  // A meeting start re-reads the stored briefing; never overwrite unsaved typing.
  useEffect(() => {
    if (contextSaved) setContext(settings.sessionContext);
    if (agendaSaved) setAgenda(settings.agendaText);
  }, [settings.sessionContext, settings.agendaText]);

  useEffect(() => {
    if (contextSaved) return;
    const timer = setTimeout(() => {
      void bridge.settings.setContext(context).then(() => {
        setContextSaved(true);
        patch({ sessionContext: context });
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [context, contextSaved]);

  useEffect(() => {
    if (agendaSaved) return;
    const timer = setTimeout(() => void saveAgenda(agenda, false), 500);
    return () => clearTimeout(timer);
  }, [agenda, agendaSaved]);

  async function saveAgenda(text: string, rewrite = true) {
    const normalized = parseAgendaText(text).join("\n");
    if (rewrite) setAgenda(normalized);
    await bridge.settings.setAgenda(normalized);
    setAgendaSaved(true);
    patch({ agendaText: normalized });
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    await saveAgenda(agenda ? `${agenda}\n${text}` : text);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function changeMode(mode: MeetingMode) {
    patch({ meetingMode: mode });
    await bridge.settings.setMeetingMode(mode);
  }

  return (
    <div className="context-fields">
      {hideMode ? null : (
        <div className="field">
          <div className="mode-label-row">
            <label htmlFor="meeting-mode">{strings.modeLabel}</label>
            {advanced ? (
              <button
                type="button"
                className={`help-btn ${modeHelpOpen ? "on" : ""}`}
                onClick={() => setModeHelpOpen((v) => !v)}
                title={t.modeHelpTitle}
                aria-label={t.modeHelpTitle}
                aria-expanded={modeHelpOpen}
              >
                <IconHelp />
              </button>
            ) : null}
          </div>
          <select id="meeting-mode" value={settings.meetingMode} onChange={(e) => void changeMode(e.target.value as MeetingMode)}>
            {MEETING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {strings.modes[mode]}
              </option>
            ))}
          </select>
          <p className="hint">{strings.modeHelp[settings.meetingMode]}</p>
          {modeHelpOpen ? (
            <dl className="mode-help">
              {MEETING_MODES.map((mode) => (
                <div key={mode} className={mode === settings.meetingMode ? "active" : ""}>
                  <dt>{strings.modes[mode]}</dt>
                  <dd>{strings.modeHelp[mode]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )}
      <div className="field">
        <label htmlFor="meeting-context">
          {roleWording ? strings.wizard.roleLabel : t.contextLabel}{" "}
          <span className="optional">{roleWording ? strings.wizard.optional : t.contextOptional}</span>
        </label>
        <textarea
          id="meeting-context"
          value={context}
          onChange={(e) => {
            setContext(e.target.value);
            setContextSaved(false);
            setEdited((prev) => ({ ...prev, context: true }));
          }}
          placeholder={roleWording ? strings.wizard.rolePlaceholder : t.contextPlaceholder}
          rows={roleWording ? 2 : 4}
        />
        <p className="hint save-state" aria-live="polite">
          {!edited.context ? "" : contextSaved ? t.contextSaved : "…"}
        </p>
      </div>
      <div className="field">
        <label htmlFor="meeting-agenda">
          {t.agendaLabel} <span className="optional">{t.agendaOptional}</span>
        </label>
        <textarea
          id="meeting-agenda"
          value={agenda}
          onChange={(e) => {
            setAgenda(e.target.value);
            setAgendaSaved(false);
            setEdited((prev) => ({ ...prev, agenda: true }));
          }}
          placeholder={t.agendaPlaceholder}
          rows={3}
        />
        <div className="agenda-edit-actions">
          <span className="hint save-state" aria-live="polite">
            {!edited.agenda ? "" : agendaSaved ? t.agendaSaved : "…"}
          </span>
          {advanced ? (
            <>
              <button type="button" onClick={() => fileRef.current?.click()}>
                {t.agendaLoadFile}
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,text/plain" hidden onChange={(e) => void loadFile(e.target.files?.[0])} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
