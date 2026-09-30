import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MeetingMode } from "./modes.js";
import type { ActionItem, AgendaStatusItem } from "./summary-format.js";
import type { ArtifactDoc, Decision, Meeting, MeetingListItem, Participant, TranscriptSegment } from "./shared/ipc-contract.js";
import { cleanMeeting, visibleSegments } from "./transcript-clean.js";

export type { Meeting, MeetingListItem, TranscriptSegment };

// One JSON file per meeting under userData/meetings. A transcript grows by a
// segment every few seconds for an hour or more, so rewriting a single small
// file beats rewriting one big store with every meeting in it.
let rootDir: string | null = null;
let current: Meeting | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** main.ts passes <userData>/meetings; tests pass a temp directory. Resets the in-memory current meeting. */
export function initMeetingsStore(dir: string): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  current = null;
  rootDir = dir;
}

function meetingsDir(): string {
  if (!rootDir) throw new Error("meetings store not initialized");
  fs.mkdirSync(rootDir, { recursive: true });
  return rootDir;
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
  artifact?: ArtifactDoc;
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
    ...(input.artifact?.text ? { artifact: { name: input.artifact.name, text: input.artifact.text } } : {}),
  };
  writeMeeting(current);
  return current;
}

export function endCurrentMeeting(): Meeting | null {
  if (!current) return null;
  if (!current.endedAt) current.endedAt = Date.now();
  // The whole call is known now: doubled lines and invented credit lines are marked (CLOUD_TASK_6).
  const cleaned = cleanMeeting(current);
  if (cleaned) Object.assign(current, cleaned);
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

/**
 * The document of a review meeting. Replacing it drops what was computed from
 * the old one (patch preview, result); decisions stay, they came from the call.
 */
export function setMeetingArtifact(id: string, doc: ArtifactDoc | null): Meeting | null {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return null;
  if (doc?.text) meeting.artifact = { name: doc.name, text: doc.text };
  else delete meeting.artifact;
  delete meeting.artifactProposal;
  delete meeting.artifactResult;
  if (meeting === current) scheduleFlush();
  else writeMeeting(meeting);
  return meeting;
}

/** Saves any change to a meeting record (the running one is flushed right away). */
export function updateMeeting(id: string, change: (meeting: Meeting) => void): Meeting | null {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return null;
  change(meeting);
  if (meeting === current) flushNow();
  else writeMeeting(meeting);
  return meeting;
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
  decisions?: Decision[] | null,
  participants?: Participant[] | null,
): void {
  const meeting = current?.id === id ? current : readMeeting(id);
  if (!meeting) return;
  meeting.summary = summary;
  meeting.summaryAt = Date.now();
  if (analysis) {
    meeting.agendaStatus = analysis.agendaStatus;
    meeting.actions = analysis.actions;
  }
  if (decisions) meeting.decisions = decisions;
  if (participants) meeting.participants = participants;
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

/**
 * One line per phrase, the lines marked `filtered` left out. `unsure`, when
 * given, tags the lines the recognizer was unsure of (the summary is told
 * they cannot back an accepted decision).
 */
export function transcriptToText(meeting: Meeting, labels: { me: string; other: string; unsure?: string }): string {
  return visibleSegments(meeting.transcript)
    .map((seg) => {
      const who = seg.speaker === "me" ? labels.me : labels.other;
      const tag = labels.unsure && seg.lowConfidence ? ` ${labels.unsure}` : "";
      return `[${formatClock(seg.at, meeting.startedAt)}] ${who}${tag}: ${seg.text}`;
    })
    .join("\n");
}

/** "Lines left out as noise: 3 ..." under an export, or nothing: a hidden line never disappears silently. */
function hiddenNote(meeting: Meeting, label: string | undefined): string[] {
  const hidden = meeting.transcript.length - visibleSegments(meeting.transcript).length;
  return hidden > 0 && label ? ["", label.replace("{n}", String(hidden))] : [];
}

/** Transcript with no summary: title, date, then one line per phrase (noise lines left out and counted). */
export function transcriptToRawText(meeting: Meeting, labels: { me: string; other: string; date: string; hiddenLines?: string }): string {
  const header = [meeting.title, `${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`, ""];
  return [...header, transcriptToText(meeting, labels), ...hiddenNote(meeting, labels.hiddenLines), ""].join("\n");
}

export function meetingToMarkdown(
  meeting: Meeting,
  labels: { me: string; other: string; summary: string; transcript: string; date: string; mode: string; hiddenLines?: string },
  modeLabel: string,
): string {
  const lines: string[] = [`# ${meeting.title}`, ""];
  lines.push(`${labels.date}: ${new Date(meeting.startedAt).toLocaleString()}`);
  lines.push(`${labels.mode}: ${modeLabel}`, "");
  if (meeting.summary) lines.push(`## ${labels.summary}`, "", meeting.summary.trim(), "");
  lines.push(`## ${labels.transcript}`, "", transcriptToText(meeting, labels), ...hiddenNote(meeting, labels.hiddenLines), "");
  return lines.join("\n");
}
