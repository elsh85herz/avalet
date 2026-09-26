import { getBridge } from "../lib/bridge.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";

/** One setting for both windows (overlay and main); every open slider follows it. */
export function OpacitySlider({ uiLanguage }: { uiLanguage: UiLanguage }) {
  const bridge = getBridge();
  const { settings, patch } = useAppSettings();
  const t = UI_STRINGS[uiLanguage];
  return (
    <div className="field-row opacity-field">
      <label htmlFor="settings-opacity">{t.simple.opacity}</label>
      <input
        id="settings-opacity"
        type="range"
        min={0.2}
        max={1}
        step={0.05}
        value={settings.overlayOpacity}
        title={t.opacityTitle}
        onChange={(e) => {
          const value = Number(e.target.value);
          patch({ overlayOpacity: value });
          void bridge.overlay.setOpacity(value);
        }}
      />
    </div>
  );
}
