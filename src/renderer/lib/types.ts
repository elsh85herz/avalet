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
