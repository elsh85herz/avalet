import { useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { checklistLocked, planLimitsApply } from "../lib/locks.js";
import { useAccess } from "./AccessCard.js";
import { LockedPreview } from "./LockedPreview.js";

type Props = {
  uiLanguage: UiLanguage;
  /**
   * Simple Settings: shown only with the built-in provider (locked on the
   * trial, a switch on Pro), so an own-key Simple screen stays as it was.
   */
  simple?: boolean;
};

/** The live checklist switch, or, when the Avalet plan lacks it, a row that opens its preview. */
export function ChecklistSetting({ uiLanguage, simple }: Props) {
  const bridge = getBridge();
  const { settings, patch } = useAppSettings();
  const access = useAccess();
  const t = UI_STRINGS[uiLanguage];
  const [preview, setPreview] = useState(false);
  const locked = checklistLocked(access);

  async function setLiveTracker(next: boolean) {
    patch({ liveTrackerEnabled: next });
    await bridge.settings.setLiveTracker(next);
  }

  if (simple && !planLimitsApply(access)) return null;

  return (
    <>
      {locked ? (
        <div className="locked-row" data-testid="live-tracker-locked">
          <span>{t.locks.checklistTitle}</span>
          <button type="button" onClick={() => setPreview(true)}>
            {t.locks.howItWorks}
          </button>
        </div>
      ) : (
        <>
          <label className="auto-detect-toggle">
            <span className="switch">
              <input
                type="checkbox"
                checked={settings.liveTrackerEnabled}
                onChange={() => void setLiveTracker(!settings.liveTrackerEnabled)}
                data-testid="live-tracker-toggle"
              />
            </span>
            {t.settings.liveTracker}
          </label>
          <p className="hint">{settings.liveTrackerEnabled ? t.settings.liveTrackerOn : t.settings.liveTrackerOff}</p>
        </>
      )}
      {preview ? (
        <LockedPreview
          uiLanguage={uiLanguage}
          feature={{ kind: "checklist" }}
          onClose={() => setPreview(false)}
          onUse={() => {
            void setLiveTracker(true);
            setPreview(false);
          }}
        />
      ) : null}
    </>
  );
}
