import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { SpeechModelName, SpeechModelRow } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

export const RECOMMENDED_MODEL: SpeechModelName = "small";
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

type Props = {
  uiLanguage: UiLanguage;
  selected: SpeechModelName;
  onSelect: (model: SpeechModelName) => void;
  /** Rows to show; the wizard shows only the recommended one. */
  only?: SpeechModelName[];
  allowDelete?: boolean;
};

/**
 * One row per speech model: not downloaded, downloading with progress and
 * Cancel, ready, or failed with Retry. Downloads only start from a button.
 */
export function SpeechModels({ uiLanguage, selected, onSelect, only, allowDelete }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const rows = useSpeechModels();
  const [busy, setBusy] = useState<SpeechModelName | null>(null);

  // A model that just finished downloading becomes the active one when the
  // active one is not usable, so Start works right away.
  useEffect(() => {
    if (!rows) return;
    const current = rows.find((r) => r.name === selected);
    if (current?.state === "ready") return;
    const ready = rows.find((r) => r.state === "ready");
    if (ready) onSelect(ready.name);
  }, [rows?.map((r) => r.state).join(",")]);

  async function run(model: SpeechModelName, action: () => Promise<void>) {
    setBusy(model);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <p className="hint">…</p>;
  const visible = only ? rows.filter((r) => only.includes(r.name)) : rows;
  const anyTrouble = visible.some((r) => r.state === "error" || (r.state === "downloading" && (r.attempt ?? 1) > 1));

  return (
    <div className="model-list" data-testid="speech-models">
      {visible.map((row) => {
        const label = t.settings.speechModels[row.name];
        const size = `${gb(row.sizeBytes, uiLanguage)} ${t.models.size}`;
        const partial = row.state === "absent" && row.bytes > 0;
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
          <div key={row.name} className={`model-row ${row.state} ${selected === row.name ? "active" : ""}`} data-model={row.name}>
            <div className="model-head">
              <span className="model-name">
                {label}
                {row.name === RECOMMENDED_MODEL ? <span className="badge">{t.models.recommended}</span> : null}
              </span>
              <span className="model-size">{size}</span>
            </div>
            <div className="model-status" role="status" aria-live="polite">
              <span className={`perm-pill ${row.state === "ready" ? "granted" : row.state === "error" ? "denied" : "unknown"}`}>
                {status}
              </span>
              {row.state === "downloading" || partial ? (
                <span className="model-percent">
                  {row.percent}% ({gb(row.bytes, uiLanguage)} / {size})
                </span>
              ) : null}
            </div>
            {row.state === "downloading" ? (
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.percent}
                aria-label={label}
              >
                <div className="progress-fill" style={{ width: `${row.percent}%` }} />
              </div>
            ) : null}
            {row.state === "error" && row.error ? <p className="error model-error">{row.error}</p> : null}
            <div className="model-actions">
              {row.state === "downloading" ? (
                <button type="button" onClick={() => void run(row.name, () => bridge.speech.cancel(row.name))}>
                  {t.models.cancel}
                </button>
              ) : null}
              {row.state === "absent" || row.state === "error" ? (
                <button
                  type="button"
                  className="primary"
                  disabled={busy === row.name}
                  onClick={() => void run(row.name, () => bridge.speech.download(row.name))}
                >
                  {row.state === "error" ? t.models.retry : partial ? t.models.continue : t.models.download}
                </button>
              ) : null}
              {row.state === "ready" && !only ? (
                selected === row.name ? (
                  <span className="hint">{t.models.inUse}</span>
                ) : (
                  <button type="button" onClick={() => onSelect(row.name)}>
                    {t.models.use}
                  </button>
                )
              ) : null}
              {allowDelete && (row.state === "ready" || partial || row.state === "error") ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (window.confirm(t.models.removeConfirm)) void run(row.name, () => bridge.speech.remove(row.name));
                  }}
                >
                  {t.models.remove}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {only ? null : (
        <p className="hint" data-testid="speech-models-guide">
          {t.models.guide}
        </p>
      )}
      <p className={`hint ${anyTrouble ? "warn" : ""}`}>
        {t.models.vpnHint}{" "}
        <a href={VPN_URL} target="_blank" rel="noreferrer">
          {t.models.vpnLink}
        </a>
      </p>
    </div>
  );
}
