import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting, MeetingListItem } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { MeetingView } from "./MeetingView.js";

export function MeetingsList({ uiLanguage }: { uiLanguage: UiLanguage }) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const [items, setItems] = useState<MeetingListItem[]>([]);
  const [open, setOpen] = useState<Meeting | null>(null);

  async function refresh() {
    setItems(await bridge.meetings.list());
  }

  useEffect(() => {
    void refresh();
    const unsubscribers = [
      bridge.events.onMeetingStarted(() => void refresh()),
      bridge.events.onMeetingEnded(() => void refresh()),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, []);

  async function openMeeting(id: string) {
    const meeting = await bridge.meetings.get(id);
    if (meeting) setOpen(meeting);
  }

  if (open) {
    return (
      <MeetingView
        meeting={open}
        uiLanguage={uiLanguage}
        live={!open.endedAt}
        onBack={() => {
          setOpen(null);
          void refresh();
        }}
        onDeleted={() => {
          setOpen(null);
          void refresh();
        }}
        onChanged={() => void refresh()}
      />
    );
  }

  return (
    <section className="meetings-list">
      {items.length === 0 ? <p className="hint">{t.meeting.listEmpty}</p> : null}
      {items.map((m) => (
        <button key={m.id} type="button" className="meeting-row" onClick={() => void openMeeting(m.id)}>
          <span className="meeting-row-title">{m.title}</span>
          <span className="meeting-row-meta">
            {new Date(m.startedAt).toLocaleString(uiLanguage === "ru" ? "ru-RU" : "en-US")} · {t.modes[m.mode]} · {m.segmentCount} {t.meeting.segments}
            {m.hasSummary ? ` · ${t.meeting.hasSummary}` : ""}
            {!m.endedAt ? ` · ${t.meeting.live}` : ""}
          </span>
        </button>
      ))}
    </section>
  );
}
