import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { PermissionStatus } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

/**
 * Microphone and screen recording, each with why it is needed, its live
 * status (re-checked every 2 s, so granting it in System Settings shows up
 * here) and one button: ask, or open the right System Settings pane.
 */
export function PermissionRows({ uiLanguage, platform }: { uiLanguage: UiLanguage; platform: string }) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const [status, setStatus] = useState<{ mic: PermissionStatus; screen: PermissionStatus } | null>(null);
  const [micWorks, setMicWorks] = useState(false);

  async function check() {
    setStatus(await bridge.permissions.check());
    // macOS can keep saying "not determined" for a mic that works (see README); labels prove access.
    const devices = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
    if (devices?.some((d) => d.kind === "audioinput" && d.label)) setMicWorks(true);
  }

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 2_000);
    return () => clearInterval(timer);
  }, []);

  async function askMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicWorks(true);
    } catch {
      void bridge.permissions.openSettings("mic");
    }
    await check();
  }

  async function askScreen() {
    // Listing screens is what makes macOS show its screen recording prompt.
    await bridge.screen.listSources().catch(() => []);
    await check();
  }

  if (platform !== "darwin") return <p className="hint">{t.wizard.permNotMac}</p>;

  const rows: Array<{ kind: "mic" | "screen"; why: string; state: PermissionStatus; ask: () => void }> = [
    { kind: "mic", why: t.wizard.micWhy, state: micWorks ? "granted" : (status?.mic ?? "unknown"), ask: () => void askMic() },
    { kind: "screen", why: t.wizard.screenWhy, state: status?.screen ?? "unknown", ask: () => void askScreen() },
  ];

  return (
    <div className="perm-list">
      {rows.map((row) => (
        <div key={row.kind} className="perm-item" data-testid={`perm-${row.kind}`}>
          <div className="perm-row">
            <span>{row.kind === "mic" ? t.settings.microphone : t.settings.screenRecording}</span>
            <span className={`perm-pill ${row.state}`}>{t.settings.perm[row.state]}</span>
          </div>
          <p className="hint">{row.why}</p>
          {row.state !== "granted" ? (
            <div className="access-actions">
              {row.state === "not-determined" || row.state === "unknown" ? (
                <button type="button" className="primary" onClick={row.ask}>
                  {t.wizard.allow}
                </button>
              ) : null}
              <button type="button" onClick={() => void bridge.permissions.openSettings(row.kind)}>
                {t.wizard.howToFix}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
