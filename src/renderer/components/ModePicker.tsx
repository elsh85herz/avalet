import { useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { MeetingMode } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { modeOptions } from "../lib/locks.js";
import { useAccess } from "./AccessCard.js";
import { LockedPreview } from "./LockedPreview.js";

type Props = { id: string; uiLanguage: UiLanguage };

/**
 * The meeting type select, shared by the Simple home, Settings and the
 * wizard. A mode the current Avalet plan does not include keeps its place
 * with the plan name; choosing it opens a preview instead of switching.
 * With an own key the options are plain and every choice switches.
 */
export function ModePicker({ id, uiLanguage }: Props) {
  const bridge = getBridge();
  const { settings, patch } = useAppSettings();
  const access = useAccess();
  const strings = UI_STRINGS[uiLanguage];
  const [preview, setPreview] = useState<MeetingMode | null>(null);
  const options = modeOptions(access, strings);

  async function select(mode: MeetingMode) {
    patch({ meetingMode: mode });
    await bridge.settings.setMeetingMode(mode);
  }

  function choose(mode: MeetingMode) {
    // The select is controlled: not switching leaves it on the current mode.
    if (options.find((o) => o.mode === mode)?.locked) setPreview(mode);
    else void select(mode);
  }

  return (
    <>
      <select id={id} value={settings.meetingMode} onChange={(e) => choose(e.target.value as MeetingMode)} data-testid="mode-picker">
        {options.map((option) => (
          <option key={option.mode} value={option.mode} data-locked={option.locked ? "true" : undefined}>
            {option.label}
          </option>
        ))}
      </select>
      {preview ? (
        <LockedPreview
          uiLanguage={uiLanguage}
          feature={{ kind: "mode", mode: preview }}
          onClose={() => setPreview(null)}
          onUse={() => {
            void select(preview);
            setPreview(null);
          }}
        />
      ) : null}
    </>
  );
}
