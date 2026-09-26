import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MeetingMode } from "./modes.js";
import type { ActionItem, AgendaStatusItem } from "./summary-format.js";

export type TranscriptSegment = {
  at: number;
  speaker: "me" | "other";
  text: string;
};

export type Meeting = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  context: string;
  transcript: TranscriptSegment[];
  summary?: string;
  summaryAt?: number;
  /** Questions to get answered on this call, one per entry; may be edited during the meeting. */
  agenda?: string[];
  /** Per-question outcome from the last summary: closed or still open. */
  agendaStatus?: AgendaStatusItem[];
  /** Action points extracted by the last summary. */
  actions?: ActionItem[];
};

export type MeetingListItem = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  mode: MeetingMode;
  segmentCount: number;
  hasSummary: boolean;
};

// One JSON file per meeting under userData/meetings. A transcript grows by a
// segment every few seconds for an hour or more, so rewriting a single small
// file beats rewriting one big store with every meeting in it.
function meetingsDir(): string {
  const dir = path.join(app.getPath("userData"), "meetings");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function meetingPath(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("invalid meeting id");
  return path.join(meetingsDir(), `${id}.json`);
}

function writeMeeting(meeting: Meeting): void {
  const file = meetingPath(meeting.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meeting), "utf8");
  fs.renameSync(tmp, file);
}

let current: Meeting | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (current) writeMeeting(current);
  }, 2_000);
}

function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (current) writeMeeting(current);
}

export function getCurrentMeeting(): Meeting | null {
  return current;
}

export function startMeeting(input: {
  title?: string;
  titlePrefix?: string;
  mode: MeetingMode;
  context: string;
  agenda?: string[];
}): Meeting {
  if (current && !current.endedAt) return current;
  const startedAt = Date.now();
  current = {
    id: randomUUID(),
    title: input.title?.trim() || defaultTitle(startedAt, input.titlePrefix ?? "Meeting"),
    startedAt,
    mode: input.mode,
    context: input.context,
    transcript: [],
    agenda: input.agenda ?? [],
  };
  writeMeeting(current);
  return current;
}

export function endCurrentMeeting(): Meeting | null {
  if (!current) return null;
  if (!current.endedAt) current.endedAt = Date.now();
  flushNow();
  const ended = current;
  current = null;
  return ended;
}

export function appendSegment(segment: TranscriptSegment): void {
  if (!current || current.endedAt) return;
  // A held mic segment can be committed a few seconds after later ones.
  let index = current.transcript.length;
  while (index > 0 && current.transcript[index - 1].at > segment.at) index--;
  current.transcript.splice(index, 0, segment);
  scheduleFlush();
}

export function setCurrentMode(mode: MeetingMode): void {
  if (!current) return;
  current.mode = mode;
  scheduleFlush();
}

// The briefing lives on the first screen and is one value: editing it during
// a call updates the running meeting too, so the summary uses what is shown.
export function setCurrentContext(context: string): void {
  if (!current || current.endedAt) return;
  current.context = context;
  scheduleFlush();
}

export function renameMeeting(id: string, title: string): void {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return;
  meeting.title = title.trim() || meeting.title;
  if (meeting === current) scheduleFlush();
  else writeMeeting(meeting);
}

export function setAgenda(id: string, agenda: string[]): Meeting | null {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return null;
  meeting.agenda = agenda;
  // Statuses belong to the old question list; they are recomputed by the next summary.
  if (meeting.agendaStatus) {
    const byQuestion = new Map(meeting.agendaStatus.map((item) => [item.question, item]));
    meeting.agendaStatus = agenda.map((question) => byQuestion.get(question) ?? { question, closed: false, note: "" });
  }
  if (meeting === current) scheduleFlush();
  else writeMeeting(meeting);
  return meeting;
}

/** Live checklist state for the running meeting: agenda marks and action points. */
export function setLiveAnalysis(
  id: string,
  patch: { agendaStatus?: AgendaStatusItem[]; actions?: ActionItem[] },
): Meeting | null {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return null;
  if (patch.agendaStatus) meeting.agendaStatus = patch.agendaStatus;
  if (patch.actions) meeting.actions = patch.actions;
  if (meeting === current) scheduleFlush();
  else writeMeeting(meeting);
  return meeting;
}

export function setSummary(
  id: string,
  summary: string,
  analysis?: { agendaStatus: AgendaStatusItem[]; actions: ActionItem[] } | null,
): void {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return;
  meeting.summary = summary;
  meeting.summaryAt = Date.now();
  if (analysis) {
    meeting.agendaStatus = analysis.agendaStatus;
    meeting.actions = analysis.actions;
  }
  if (meeting === current) flushNow();
  else writeMeeting(meeting);
}

export function readMeeting(id: string): Meeting | null {
  if (current?.id === id) return current;
  try {
    return JSON.parse(fs.readFileSync(meetingPath(id), "utf8")) as Meeting;
  } catch {
    return null;
  }
}

export function deleteMeeting(id: string): void {
  if (current?.id === id) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    current = null;
  }
  try {
    fs.unlinkSync(meetingPath(id));
  } catch {
    // already gone
  }
}

export function listMeetings(): MeetingListItem[] {
  const dir = meetingsDir();
  const items: MeetingListItem[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const meeting = readMeeting(id);
    if (!meeting) continue;
    items.push({
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      mode: meeting.mode,
      segmentCount: meeting.transcript.length,
      hasSummary: Boolean(meeting.summary),
    });
  }
  items.sort((a, b) => b.startedAt - a.startedAt);
  return items;
}

export function flushCurrentMeeting(): void {
  flushNow();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultTitle(at: number, prefix: string): string {
  const d = new Date(at);
  return `${prefix} ${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClock(at: number, startedAt: number): string {
  const s = Math.max(0, Math.floor((at - startedAt) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function transcriptToText(meeting: Meeting, labels: { me: string; other: string }): string {
  return meeting.transcript
    .map((seg) => `[${formatClock(seg.at, meeting.startedAt)}] ${seg.speaker === "me" ? labels.me : labels.other}: ${seg.text}`)
    .join("\n");
}

/** Raw transcript with no summary and no processing: title, date, then one line per phrase. */
export function transcriptToRawText(meeting: Meeting, labels: { me: string; other: string; date: string }): string {
  const header = [meeting.title, `${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`, ""];
  return [...header, transcriptToText(meeting, labels), ""].join("\n");
}

export function meetingToMarkdown(
  meeting: Meeting,
  labels: { me: string; other: string; summary: string; transcript: string; date: string; mode: string },
  modeLabel: string,
): string {
  const lines: string[] = [`# ${meeting.title}`, ""];
  lines.push(`${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`);
  lines.push(`${labels.mode}: ${modeLabel}`, "");
  if (meeting.summary) lines.push(`## ${labels.summary}`, "", meeting.summary.trim(), "");
  lines.push(`## ${labels.transcript}`, "", transcriptToText(meeting, labels), "");
  return lines.join("\n");
}
