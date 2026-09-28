import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { SPEECH_MODEL, type SpeechModelRow } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { startEarlyDownload } from "../lib/early-download.js";

export const VPN_URL = "https://ast-net.ru";

function gb(bytes: number, language: UiLanguage): string {
  const text = (bytes / 1e9).toFixed(1);
  return language === "ru" ? text.replace(".", ",") : text;
}

/** Live rows from the main process; `null` until the first answer. */
export function useSpeechModels(): SpeechModelRow[] | null {
  const bridge = getBridge();
  const [rows, setRows] = useState<SpeechModelRow[] | null>(null);
  useEffect(() => {
    void bridge.speech.models().then(setRows);
    return bridge.events.onModelsChanged(setRows);
  }, []);
  return rows;
}

/** The one speech model's row (see SPEECH_MODEL); `null` until known. */
export function useSpeechModel(): SpeechModelRow | null {
  return useSpeechModels()?.find((row) => row.name === SPEECH_MODEL) ?? null;
}

/**
 * Starts the speech model download in the background once `active` becomes
 * true (first-run flow), unless it is already there or running. At most once
 * per window, however often the caller renders (lib/early-download.ts).
 */
export function useEarlyModelDownload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const bridge = getBridge();
    void startEarlyDownload({ models: bridge.speech.models, download: bridge.speech.download }).catch(() => {});
  }, [active]);
}

type Props = {
  uiLanguage: UiLanguage;
  allowDelete?: boolean;
  /** Settings show a short plain explanation under the row; the wizard has its own text. */
  showGuide?: boolean;
};

/**
 * Readiness of the one speech model: not downloaded, downloading with
 * progress and Cancel, ready, or failed with Retry. There is no choice of
 * model; the download starts early in the first run or from the button here.
 */
export function SpeechModels({ uiLanguage, allowDelete, showGuide }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const row = useSpeechModel();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  if (!row) return <p className="hint">…</p>;
  const label = t.models.title;
  const size = `${gb(row.sizeBytes, uiLanguage)} ${t.models.size}`;
  const partial = row.state === "absent" && row.bytes > 0;
  const trouble = row.state === "error" || (row.state === "downloading" && (row.attempt ?? 1) > 1);
  const status =
    row.state === "ready"
      ? t.models.ready
      : row.state === "downloading"
        ? (row.attempt ?? 1) > 1
          ? t.models.retrying
          : t.models.downloading
        : row.state === "error"
          ? t.models.error
          : partial
            ? t.models.partial
            : t.models.absent;

  return (
    <div className="model-list" data-testid="speech-models">
      <div className={`model-row ${row.state} active`} data-model={row.name}>
        <div className="model-head">
          <span className="model-name">{label}</span>
          <span className="model-size">{size}</span>
        </div>
        <div className="model-status" role="status" aria-live="polite">
          <span className={`perm-pill ${row.state === "ready" ? "granted" : row.state === "error" ? "denied" : "unknown"}`}>{status}</span>
          {row.state === "downloading" || partial ? (
            <span className="model-percent">
              {row.percent}% ({gb(row.bytes, uiLanguage)} / {size})
            </span>
          ) : null}
        </div>
        {row.state === "downloading" ? (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent} aria-label={label}>
            <div className="progress-fill" style={{ width: `${row.percent}%` }} />
          </div>
        ) : null}
        {row.state === "error" && row.error ? <p className="error model-error">{row.error}</p> : null}
        <div className="model-actions">
          {row.state === "downloading" ? (
            <button type="button" onClick={() => void run(() => bridge.speech.cancel(row.name))}>
              {t.models.cancel}
            </button>
          ) : null}
          {row.state === "absent" || row.state === "error" ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void run(() => bridge.speech.download(row.name))}>
              {row.state === "error" ? t.models.retry : partial ? t.models.continue : t.models.download}
            </button>
          ) : null}
          {allowDelete && (row.state === "ready" || partial || row.state === "error") ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm(t.models.removeConfirm)) void run(() => bridge.speech.remove(row.name));
              }}
            >
              {t.models.remove}
            </button>
          ) : null}
        </div>
      </div>
      {showGuide ? (
        <p className="hint" data-testid="speech-models-guide">
          {t.models.guide}
        </p>
      ) : null}
      <p className={`hint ${trouble ? "warn" : ""}`}>
        {t.models.vpnHint}{" "}
        <a href={VPN_URL} target="_blank" rel="noreferrer">
          {t.models.vpnLink}
        </a>
      </p>
    </div>
  );
}
