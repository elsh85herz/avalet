import { randomUUID } from "node:crypto";
import { generate } from "./providers/index.js";
import { logLine } from "./log.js";
import { getApiKey, getProviderSettings, getSelectedProviderId } from "./settings-store.js";
import { getCurrentMeeting, setAgenda, setLiveAnalysis, transcriptToText, type Meeting } from "./meetings-store.js";
import type { ActionItem, ActionState, AgendaStatusItem } from "./summary-format.js";
import { parseAgendaText } from "./summary-format.js";
import {
  TRACKER_EXCERPT_CHARS,
  applyTrackerReply,
  buildTrackerSystemPrompt,
  buildTrackerUserPrompt,
  parseTrackerReply,
  reconcileAgenda,
  shouldRunTracker,
} from "./live-tracker-logic.js";

export type TrackerState = {
  meetingId: string | null;
  agendaStatus: AgendaStatusItem[];
  actions: ActionItem[];
  busy: boolean;
};

const OVERLAP_SEGMENTS = 3;

/**
 * Keeps the running meeting's agenda marks and action points current. Cheap by
 * design: a call only when there is enough new speech, on a pause of the other
 * side (or after a ceiling of 90 s), with just the newest excerpt as input.
 */
export class LiveTracker {
  private meetingId: string | null = null;
  private cursor = 0;
  private lastRunAt = 0;
  private running = false;

  constructor(private readonly onUpdate: (state: TrackerState) => void) {}

  getState(): TrackerState {
    const meeting = getCurrentMeeting();
    if (!meeting || meeting.endedAt) return { meetingId: null, agendaStatus: [], actions: [], busy: false };
    return {
      meetingId: meeting.id,
      agendaStatus: reconcileAgenda(meeting.agenda ?? [], meeting.agendaStatus),
      actions: meeting.actions ?? [],
      busy: this.running,
    };
  }

  /** Called after every committed transcript segment. */
  note(endsWithPause: boolean): void {
    const meeting = this.activeMeeting();
    if (!meeting || this.running) return;
    const newChars = meeting.transcript.slice(this.cursor).reduce((sum, seg) => sum + seg.text.length, 0);
    if (!shouldRunTracker({ now: Date.now(), lastRunAt: this.lastRunAt, newChars, endsWithPause })) return;
    void this.run();
  }

  /** Manual refresh (button) and the final pass on Stop: ignores the pacing rules. */
  async refresh(): Promise<void> {
    if (this.running || !this.activeMeeting()) return;
    await this.run();
  }

  reset(): void {
    this.meetingId = null;
    this.cursor = 0;
    this.lastRunAt = 0;
  }

  private activeMeeting(): Meeting | null {
    const meeting = getCurrentMeeting();
    if (!meeting || meeting.endedAt || meeting.mode === "interview") return null;
    if (meeting.id !== this.meetingId) {
      this.meetingId = meeting.id;
      this.cursor = 0;
      this.lastRunAt = 0;
    }
    return meeting;
  }

  private async run(): Promise<void> {
    const meeting = this.activeMeeting();
    if (!meeting) return;
    const fresh = meeting.transcript.slice(this.cursor);
    if (fresh.length === 0) return;
    this.running = true;
    this.lastRunAt = Date.now();
    this.onUpdate(this.getState());

    const endIndex = meeting.transcript.length;
    const from = Math.max(0, this.cursor - OVERLAP_SEGMENTS);
    const excerptMeeting = { ...meeting, transcript: meeting.transcript.slice(from, endIndex) };
    const excerpt = transcriptToText(excerptMeeting, { me: "[Я]", other: "[Собеседник]" }).slice(-TRACKER_EXCERPT_CHARS);
    const statuses = reconcileAgenda(meeting.agenda ?? [], meeting.agendaStatus);
    const actions = meeting.actions ?? [];

    const providerId = getSelectedProviderId();
    const settings = getProviderSettings(providerId);
    const t0 = Date.now();
    let collected = "";
    try {
      await generate({
        providerId,
        apiKey: getApiKey(providerId),
        baseUrl: settings.baseUrl,
        model: settings.model,
        systemPrompt: buildTrackerSystemPrompt(),
        transcript: buildTrackerUserPrompt(statuses, actions, excerpt),
        maxTokens: 700,
        signal: new AbortController().signal,
        onDelta: (delta) => {
          collected += delta;
        },
      });
      const reply = parseTrackerReply(collected);
      if (!reply) {
        logLine(`[tracker] unparseable reply (${collected.length} chars), will retry on the next pause`);
      } else if (getCurrentMeeting()?.id === meeting.id) {
        // Hand edits made while the call was running must survive: apply the
        // reply to the state as it is now, not as it was when the call started.
        const live = getCurrentMeeting()!;
        const merged = applyTrackerReply(
          reconcileAgenda(live.agenda ?? [], live.agendaStatus),
          live.actions ?? [],
          reply,
          randomUUID,
        );
        setLiveAnalysis(live.id, merged);
        this.cursor = endIndex;
        logLine(
          `[tracker] ${Date.now() - t0}ms, ${excerpt.length} chars in, ${reply.agenda.length} marks, ${reply.actions.length} new actions`,
        );
      }
    } catch (error) {
      logLine(`[tracker] failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
      this.onUpdate(this.getState());
    }
  }

  // --- hand edits from the overlay ---

  toggleAgenda(index: number): TrackerState {
    const meeting = getCurrentMeeting();
    if (meeting && !meeting.endedAt) {
      const statuses = reconcileAgenda(meeting.agenda ?? [], meeting.agendaStatus);
      const item = statuses[index];
      if (item) {
        item.closed = !item.closed;
        item.active = false;
        item.manual = true;
        setLiveAnalysis(meeting.id, { agendaStatus: statuses });
      }
    }
    return this.emit();
  }

  /** New question raised in the call: pinned to the agenda on the spot. */
  addAgenda(text: string): TrackerState {
    const meeting = getCurrentMeeting();
    const added = parseAgendaText(text);
    if (meeting && !meeting.endedAt && added.length > 0) {
      const agenda = [...(meeting.agenda ?? [])];
      for (const q of added) if (!agenda.includes(q)) agenda.push(q);
      setAgenda(meeting.id, agenda);
    }
    return this.emit();
  }

  setActionState(id: string, state: ActionState): TrackerState {
    const meeting = getCurrentMeeting();
    if (meeting && !meeting.endedAt) {
      const actions = (meeting.actions ?? []).map((a) => (a.id === id ? { ...a, state } : a));
      setLiveAnalysis(meeting.id, { actions });
    }
    return this.emit();
  }

  addAction(task: string): TrackerState {
    const meeting = getCurrentMeeting();
    const trimmed = task.trim();
    if (meeting && !meeting.endedAt && trimmed) {
      const actions = [...(meeting.actions ?? []), { id: randomUUID(), task: trimmed, owner: "", due: "", state: "confirmed" as const }];
      setLiveAnalysis(meeting.id, { actions });
    }
    return this.emit();
  }

  private emit(): TrackerState {
    const state = this.getState();
    this.onUpdate(state);
    return state;
  }
}
