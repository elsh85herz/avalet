import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { ExportLabels, Meeting, TranscriptSegment } from "../lib/types.js";
import type { AgendaStatusItem, QuoteRef } from "../../../electron/shared/ipc-contract.js";
import { parseAgendaText } from "../lib/agenda.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { IconChevron, IconCheck } from "../icons.js";
import { DecisionsPanel } from "./DecisionsPanel.js";
import { formatTokens, summaryExtraCost } from "../lib/artifact-cost.js";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clock(at: number, startedAt: number): string {
  const s = Math.max(0, Math.floor((at - startedAt) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

type Props = {
  meeting: Meeting;
  uiLanguage: UiLanguage;
  /** Live meeting: transcript keeps growing via events. */
  live: boolean;
  onBack?: () => void;
  onDeleted?: () => void;
  onChanged?: (meeting: Meeting) => void;
  /** Simple level: fewer buttons (no copy as text, no agenda file import). */
  simple?: boolean;
};

/** Transcript + summary for one meeting, either the live one or a saved one. */
export function MeetingView({ meeting: initial, uiLanguage, live, onBack, onDeleted, onChanged, simple }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const [meeting, setMeeting] = useState<Meeting>(initial);
  const [titleDraft, setTitleDraft] = useState(initial.title);
  const [summaryDraft, setSummaryDraft] = useState(initial.summary ?? "");
  const [summarizing, setSummarizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaDraft, setAgendaDraft] = useState((initial.agenda ?? []).join("\n"));
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [highlightAt, setHighlightAt] = useState<number | null>(null);
  const followRef = useRef(true);

  useEffect(() => {
    setMeeting(initial);
    setTitleDraft(initial.title);
    setSummaryDraft(initial.summary ?? "");
    setAgendaDraft((initial.agenda ?? []).join("\n"));
  }, [initial.id]);

  useEffect(() => {
    if (!live) return;
    const unsubscribers = [
      bridge.events.onTranscriptSegment((segment: TranscriptSegment) => {
        setMeeting((prev) => {
          const transcript = [...prev.transcript];
          let index = transcript.length;
          while (index > 0 && transcript[index - 1].at > segment.at) index--;
          transcript.splice(index, 0, segment);
          return { ...prev, transcript };
        });
      }),
      bridge.events.onMeetingModeChanged((mode) => setMeeting((prev) => ({ ...prev, mode }))),
      bridge.events.onTrackerUpdate((state) => {
        if (state.meetingId !== meeting.id) return;
        setMeeting((prev) => ({ ...prev, agendaStatus: state.agendaStatus, actions: state.actions }));
      }),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, [live, meeting.id]);

  useEffect(() => {
    const unsubscribers = [
      bridge.events.onSummaryDelta(({ id, delta }) => {
        if (id !== meeting.id) return;
        setSummaryDraft((prev) => prev + delta);
      }),
      bridge.events.onSummaryDone(({ id, text, agendaStatus, actions, decisions }) => {
        if (id !== meeting.id) return;
        setSummaryDraft(text);
        setSummarizing(false);
        setMeeting((prev) => {
          const next = {
            ...prev,
            summary: text,
            summaryAt: Date.now(),
            agendaStatus: agendaStatus ?? prev.agendaStatus,
            actions: actions ?? prev.actions,
            decisions: decisions ?? prev.decisions,
          };
          onChanged?.(next);
          return next;
        });
      }),
      bridge.events.onSummaryError(({ id, message }) => {
        if (id !== meeting.id) return;
        setSummarizing(false);
        setNotice(`${t.meeting.error}: ${message}`);
      }),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, [meeting.id, uiLanguage]);

  useEffect(() => {
    if (followRef.current) transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [meeting.transcript.length]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const labels: ExportLabels = {
    me: t.meeting.me,
    other: t.meeting.other,
    summary: t.meeting.summaryTitle,
    transcript: t.meeting.transcriptTitle,
    date: t.meeting.date,
    mode: t.modeLabel,
    participants: t.meeting.participants,
    agenda: t.meeting.agendaTitle,
    discussions: t.meeting.discussions,
    actions: t.meeting.actionsTitle,
    actionTask: t.meeting.actionTask,
    actionOwner: t.meeting.actionOwner,
    actionDue: t.meeting.actionDue,
    agendaClosed: t.meeting.agendaClosed,
    agendaOpen: t.meeting.agendaOpen,
  };

  async function commitTitle() {
    const title = titleDraft.trim();
    if (!title || title === meeting.title) {
      setTitleDraft(meeting.title);
      return;
    }
    await bridge.meetings.rename(meeting.id, title);
    setMeeting((prev) => {
      const next = { ...prev, title };
      onChanged?.(next);
      return next;
    });
  }

  async function summarize() {
    if (summarizing || meeting.transcript.length === 0) return;
    setSummarizing(true);
    setSummaryDraft("");
    try {
      await bridge.meetings.summarize(meeting.id);
    } catch {
      // surfaced via onSummaryError
    }
  }

  async function exportProtocol() {
    const saved = await bridge.meetings.export(meeting.id, labels, t.modes[meeting.mode]);
    if (saved) setNotice(t.meeting.exported);
  }

  async function exportTranscript() {
    const saved = await bridge.meetings.exportTranscript(meeting.id, labels);
    if (saved) setNotice(t.meeting.exported);
  }

  async function saveAgenda(text: string) {
    const agenda = parseAgendaText(text);
    setAgendaDraft(agenda.join("\n"));
    const updated = await bridge.meetings.setAgenda(meeting.id, agenda);
    if (updated) {
      setMeeting((prev) => ({ ...prev, agenda: updated.agenda, agendaStatus: updated.agendaStatus }));
      onChanged?.(updated);
    }
  }

  async function copyText() {
    const text = await bridge.meetings.toText(meeting.id, labels, t.modes[meeting.mode]);
    await navigator.clipboard.writeText(text);
    setNotice(t.meeting.copied);
  }

  async function remove() {
    await bridge.meetings.delete(meeting.id);
    onDeleted?.();
  }

  // Agenda checkmarks come from the live checklist and the last summary; before either every question is open.
  const agendaItems: AgendaStatusItem[] = (meeting.agendaStatus && meeting.agendaStatus.length > 0
    ? meeting.agendaStatus
    : (meeting.agenda ?? []).map((question) => ({ question, closed: false, note: "" })));
  const agendaTotal = agendaItems.length;
  const agendaClosedCount = agendaItems.filter((item) => item.closed).length;

  // "Jump to transcript": the segment a quote came from, scrolled into view and lit for a moment.
  function jumpTo(at: number) {
    followRef.current = false;
    const index = meeting.transcript.findIndex((seg) => seg.at >= at);
    const el = transcriptRef.current?.querySelector<HTMLElement>(`[data-segment="${index < 0 ? meeting.transcript.length - 1 : index}"]`);
    el?.scrollIntoView({ block: "center" });
    setHighlightAt(at);
    setTimeout(() => setHighlightAt((current) => (current === at ? null : current)), 2500);
  }

  // What was actually said for an agenda item or a task: the words, who, and a button to that moment.
  function quote(item: QuoteRef) {
    if (!item.quote) return null;
    const who = item.speaker === "me" ? t.meeting.me : item.speaker === "other" ? t.meeting.other : "";
    return (
      <span className="agenda-quote" data-testid="meeting-quote">
        «{item.quote}»{who ? <span className="agenda-quote-who"> {who}</span> : null}
        {typeof item.at === "number" ? (
          <button type="button" className="link-btn segment-jump" title={t.meeting.jumpTitle} aria-label={t.meeting.jumpTitle} onClick={() => jumpTo(item.at!)}>
            {clock(item.at, meeting.startedAt)}
          </button>
        ) : null}
      </span>
    );
  }

  // Review with a document: the summary request is bigger; said before it is sent.
  const summaryCost = summaryExtraCost(meeting);

  function updateMeeting(next: Meeting) {
    setMeeting((prev) => ({ ...prev, ...next, transcript: next.transcript.length >= prev.transcript.length ? next.transcript : prev.transcript }));
    onChanged?.(next);
  }

  const highlightIndex = highlightAt === null ? -1 : meeting.transcript.findIndex((seg) => seg.at >= highlightAt);

  function onTranscriptScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <section className="meeting-view">
      <div className="meeting-head">
        {onBack ? (
          <button type="button" className="link-btn" onClick={onBack}>
            <IconChevron direction="left" /> {t.meeting.back}
          </button>
        ) : null}
        <input
          className="meeting-title"
          value={titleDraft}
          placeholder={t.meeting.titlePlaceholder}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <div className="meeting-meta">
          <span>{new Date(meeting.startedAt).toLocaleString(uiLanguage === "ru" ? "ru-RU" : "en-US")}</span>
          <span className="badge">{t.modes[meeting.mode]}</span>
          <span className={`badge ${meeting.endedAt ? "" : "live"}`}>{meeting.endedAt ? t.meeting.ended : t.meeting.live}</span>
        </div>
      </div>

      <div className="meeting-actions">
        <button type="button" onClick={() => void summarize()} disabled={summarizing || meeting.transcript.length === 0}>
          {summarizing ? t.meeting.summarizing : t.meeting.summarize}
        </button>
        <button type="button" onClick={() => void exportProtocol()} disabled={!meeting.summary}>
          {t.meeting.exportProtocol}
        </button>
        <button type="button" onClick={() => void exportTranscript()} disabled={meeting.transcript.length === 0}>
          {t.meeting.exportTranscript}
        </button>
        {simple ? null : (
          <button type="button" onClick={() => void copyText()} disabled={!meeting.summary}>
            {t.meeting.copyText}
          </button>
        )}
        {!live && onDeleted ? (
          <button type="button" className="danger" onClick={() => void remove()}>
            {t.meeting.delete}
          </button>
        ) : null}
        {notice ? <span className="notice">{notice}</span> : null}
      </div>
      {summaryCost ? (
        <p className={`cost-note${summaryCost.high ? " high" : ""}`} data-testid="summary-cost" role="note">
          {t.spec.summaryCost.replace("{tokens}", formatTokens(summaryCost.tokens, uiLanguage))}
        </p>
      ) : null}

      <div className="meeting-agenda">
        <button
          type="button"
          className="agenda-toggle"
          aria-expanded={agendaOpen}
          title={t.meeting.agendaToggleTitle}
          onClick={() => setAgendaOpen((open) => !open)}
        >
          <span className={`chevron ${agendaOpen ? "open" : ""}`}>
            <IconChevron />
          </span>
          <span>{t.meeting.agendaToggleTitle}</span>
          {agendaTotal > 0 ? (
            <span className="agenda-progress">
              {agendaClosedCount}/{agendaTotal} {t.meeting.agendaProgress}
            </span>
          ) : null}
        </button>
        {agendaOpen ? (
          <div className="agenda-body">
            <h3>{t.meeting.agendaTitle}</h3>
            {agendaItems.length === 0 ? (
              <p className="hint">{t.meeting.agendaEmpty}</p>
            ) : (
              <ul className="agenda-list">
                {agendaItems.map((item) => (
                  <li key={item.question} className={item.closed ? "closed" : "open"}>
                    <span className="agenda-check" aria-label={item.closed ? t.meeting.agendaClosed : t.meeting.agendaOpen}>
                      {item.closed ? <IconCheck /> : null}
                    </span>
                    <span className="agenda-text">
                      {item.question}
                      {item.note ? <span className="agenda-note">{item.note}</span> : null}
                      {quote(item)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {agendaItems.length > 0 && !meeting.agendaStatus ? <p className="hint">{t.meeting.agendaNotChecked}</p> : null}
            <label className="agenda-edit">
              {t.meeting.agendaEditLabel}
              <textarea
                value={agendaDraft}
                rows={4}
                placeholder={t.meeting.agendaPlaceholder}
                onChange={(e) => setAgendaDraft(e.target.value)}
              />
            </label>
            <div className="agenda-edit-actions">
              <button type="button" onClick={() => void saveAgenda(agendaDraft)}>
                {t.meeting.agendaSaveList}
              </button>
            </div>

            <h3>{t.meeting.actionsTitle}</h3>
            {(meeting.actions ?? []).filter((a) => a.state !== "dismissed").length === 0 ? (
              <p className="hint">{t.meeting.actionsEmpty}</p>
            ) : (
              <ul className="action-list">
                {(meeting.actions ?? []).filter((a) => a.state !== "dismissed").map((action, i) => (
                  <li key={`${i}-${action.task}`}>
                    <span className="action-task">{action.task}</span>
                    <span className="action-meta">
                      {action.owner || "-"} · {action.due || "-"}
                    </span>
                    {quote(action)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {meeting.mode === "review" ? (
        <DecisionsPanel
          meeting={meeting}
          uiLanguage={uiLanguage}
          simple={simple}
          onChange={updateMeeting}
          jumpTo={jumpTo}
          clock={(at) => clock(at, meeting.startedAt)}
        />
      ) : null}

      <div className="meeting-summary">
        <h3>{t.meeting.summaryTitle}</h3>
        {summaryDraft ? <pre className="summary-text">{summaryDraft}</pre> : <p className="hint">{t.meeting.summaryEmpty}</p>}
      </div>

      <div className="meeting-transcript" onScroll={onTranscriptScroll} ref={transcriptRef}>
        <h3>{t.meeting.transcriptTitle}</h3>
        {meeting.transcript.length === 0 ? (
          <p className="hint">{live ? t.meeting.transcriptEmpty : t.meeting.transcriptEmpty}</p>
        ) : (
          meeting.transcript.map((seg, i) => (
            <div
              key={`${seg.at}-${i}`}
              data-segment={i}
              className={`segment ${seg.speaker}${i === highlightIndex ? " highlight" : ""}`}
            >
              <span className="segment-time">{clock(seg.at, meeting.startedAt)}</span>
              <span className="segment-speaker">{seg.speaker === "me" ? t.meeting.me : t.meeting.other}</span>
              <span className="segment-text">{seg.text}</span>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>
    </section>
  );
}
