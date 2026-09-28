import { SPEECH_MODEL, type SpeechModelName, type SpeechModelRow } from "../../../electron/shared/ipc-contract.js";

// The speech model is downloaded in the background as soon as a new user
// starts the first-run flow (leaving the first wizard screen, or opening the
// how-it-works guide), so it is ready or close by the time of the first Start.
// Start itself still waits for a ready model (lib/session.tsx); this only
// changes when the download begins.

export type EarlyDownloadApi = {
  models: () => Promise<SpeechModelRow[]>;
  download: (model: SpeechModelName) => Promise<void>;
};

/**
 * Only a model that is simply not there (or partly there, which resumes) is
 * fetched: never one that is ready, already downloading, or failed (failures
 * already retried twice; the row offers Retry, a silent loop would not help).
 */
export function shouldStartEarly(row: SpeechModelRow | undefined): boolean {
  return row?.state === "absent";
}

/** Once per window: a cancel in the wizard is not undone by the guide. */
const shared = { tried: false };

/**
 * Starts the download if it makes sense; resolves to whether it did. At most
 * one attempt per `state` (per app window by default), however often the
 * screens that call it render or reopen.
 */
export async function startEarlyDownload(api: EarlyDownloadApi, state: { tried: boolean } = shared): Promise<boolean> {
  if (state.tried) return false;
  state.tried = true;
  const rows = await api.models();
  if (!shouldStartEarly(rows.find((row) => row.name === SPEECH_MODEL))) return false;
  await api.download(SPEECH_MODEL);
  return true;
}
