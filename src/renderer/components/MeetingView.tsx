import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { ExportLabels, Meeting, TranscriptSegment } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

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
};

/** Transcript + summary for one meeting, either the live one or a saved one. */
export function MeetingView({ meeting: initial, uiLanguage, live, onBack, onDeleted, onChanged }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const [meeting, setMeeting] = useState<Meeting>(initial);
  const [titleDraft, setTitleDraft] = useState(initial.title);
  const [summaryDraft, setSummaryDraft] = useState(initial.summary ?? "");
  const [summarizing, setSummarizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);

  useEffect(() => {
    setMeeting(initial);
    setTitleDraft(initial.title);
    setSummaryDraft(initial.summary ?? "");
  }, [initial.id]);

  useEffect(() => {
    if (!live) return;
    const unsubscribers = [
      bridge.events.onTranscriptSegment((segment: TranscriptSegment) => {
        setMeeting((prev) => ({ ...prev, transcript: [...prev.transcript, segment] }));
      }),
      bridge.events.onMeetingModeChanged((mode) => setMeeting((prev) => ({ ...prev, mode }))),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, [live, meeting.id]);

  useEffect(() => {
    const unsubscribers = [
      bridge.events.onSummaryDelta(({ id, delta }) => {
        if (id !== meeting.id) return;
        setSummaryDraft((prev) => prev + delta);
      }),
      bridge.events.onSummaryDone(({ id, text }) => {
        if (id !== meeting.id) return;
        setSummaryDraft(text);
        setSummarizing(false);
        setMeeting((prev) => {
          const next = { ...prev, summary: text, summaryAt: Date.now() };
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

  async function exportMd() {
    const saved = await bridge.meetings.export(meeting.id, labels, t.modes[meeting.mode]);
    if (saved) setNotice(t.meeting.exported);
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

  function onTranscriptScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <section className="meeting-view">
      <div className="meeting-head">
        {onBack ? (
          <button type="button" className="link-btn" onClick={onBack}>
            ← {t.meeting.back}
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
          <span>{new Date(meeting.startedAt).toLocaleString()}</span>
          <span className="badge">{t.modes[meeting.mode]}</span>
          <span className={`badge ${meeting.endedAt ? "" : "live"}`}>{meeting.endedAt ? t.meeting.ended : t.meeting.live}</span>
        </div>
      </div>

      <div className="meeting-actions">
        <button type="button" onClick={() => void summarize()} disabled={summarizing || meeting.transcript.length === 0}>
          {summarizing ? t.meeting.summarizing : t.meeting.summarize}
        </button>
        <button type="button" onClick={() => void exportMd()} disabled={meeting.transcript.length === 0}>
          {t.meeting.exportMd}
        </button>
        <button type="button" onClick={() => void copyText()} disabled={meeting.transcript.length === 0}>
          {t.meeting.copyText}
        </button>
        {!live && onDeleted ? (
          <button type="button" className="danger" onClick={() => void remove()}>
            {t.meeting.delete}
          </button>
        ) : null}
        {notice ? <span className="notice">{notice}</span> : null}
      </div>

      <div className="meeting-summary">
        <h3>{t.meeting.summaryTitle}</h3>
        {summaryDraft ? <pre className="summary-text">{summaryDraft}</pre> : <p className="hint">{t.meeting.summaryEmpty}</p>}
      </div>

      <div className="meeting-transcript" onScroll={onTranscriptScroll}>
        <h3>{t.meeting.transcriptTitle}</h3>
        {meeting.transcript.length === 0 ? (
          <p className="hint">{live ? t.meeting.transcriptEmpty : t.meeting.transcriptEmpty}</p>
        ) : (
          meeting.transcript.map((seg, i) => (
            <div key={`${seg.at}-${i}`} className={`segment ${seg.speaker}`}>
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
