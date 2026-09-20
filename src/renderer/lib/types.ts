export type ProviderSettingsPublic = {
  providerId: string;
  model: string;
  baseUrl?: string;
  hasApiKey: boolean;
};

export type SessionState = "idle" | "listening" | "paused";

export type LiveBlockEvent = { id: string };
export type LiveBlockDeltaEvent = { id: string; delta: string };
export type LiveBlockErrorEvent = { id: string; message: string };
export type HistoryBlock = { id: string; text: string; status: "done" | "error"; createdAt: number };

export type MeetingMode = "free" | "requirements" | "grooming" | "demo" | "interview";
export const MEETING_MODES: MeetingMode[] = ["free", "requirements", "grooming", "demo", "interview"];

export type TranscriptSegment = { at: number; speaker: "me" | "other"; text: string };

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

export type ExportLabels = { me: string; other: string; summary: string; transcript: string; date: string; mode: string };
