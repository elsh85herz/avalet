import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MeetingMode } from "./modes.js";

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

export function startMeeting(input: { title?: string; titlePrefix?: string; mode: MeetingMode; context: string }): Meeting {
  if (current && !current.endedAt) return current;
  const startedAt = Date.now();
  current = {
    id: randomUUID(),
    title: input.title?.trim() || defaultTitle(startedAt, input.titlePrefix ?? "Meeting"),
    startedAt,
    mode: input.mode,
    context: input.context,
    transcript: [],
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
  current.transcript.push(segment);
  scheduleFlush();
}

export function setCurrentMode(mode: MeetingMode): void {
  if (!current) return;
  current.mode = mode;
  scheduleFlush();
}

export function renameMeeting(id: string, title: string): void {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return;
  meeting.title = title.trim() || meeting.title;
  if (meeting === current) scheduleFlush();
  else writeMeeting(meeting);
}

export function setSummary(id: string, summary: string): void {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return;
  meeting.summary = summary;
  meeting.summaryAt = Date.now();
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
