import { useEffect, useRef } from "react";
import { PROVIDER_PRESETS_UI } from "../providers/presets.js";
import { ContextFields } from "./ContextFields.js";
import { getBridge } from "../lib/bridge.js";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { AccessCard } from "./AccessCard.js";
import { OwnKeySetup } from "./OwnKeySetup.js";
import { SpeechModels } from "./SpeechModels.js";
import { UsageCounter } from "./UsageCounter.js";
import { OpacitySlider } from "./OpacitySlider.js";

type Props = {
  uiLanguage: UiLanguage;
  focus?: "access" | "speech";
  onBack: () => void;
  onRunSetup: () => void;
};

/**
 * Settings for the Simple level: short, but everything real work needs
 * (access and key test, meeting type and context, speech models, where files
 * go, appearance) without switching to Advanced. Tuning stays in Advanced.
 */
export function SimpleSettings({ uiLanguage, focus, onBack, onRunSetup }: Props) {
  const bridge = getBridge();
  const { settings, patch, reload } = useAppSettings();
  const t = UI_STRINGS[uiLanguage];
  const s = t.simple;
  const accessRef = useRef<HTMLElement | null>(null);
  const speechRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = focus === "access" ? accessRef.current : focus === "speech" ? speechRef.current : null;
    target?.scrollIntoView({ block: "start" });
    target?.querySelector<HTMLElement>("button, select, input")?.focus();
  }, [focus]);

  async function selectProvider(id: string) {
    await bridge.settings.selectProvider(id);
    await reload();
  }

  const ownMode = settings.selectedProviderId !== "avalet";
  const provider = settings.providers.find((p) => p.providerId === settings.selectedProviderId);
  const preset = PROVIDER_PRESETS_UI.find((p) => p.id === settings.selectedProviderId);
  const modelInUse = preset
    ? s.modelInUse.replace("{provider}", preset.label).replace("{model}", provider?.model || preset.modelPlaceholder)
    : null;

  async function chooseExportDir() {
    const dir = await bridge.settings.chooseExportDir();
    if (dir) patch({ exportDir: dir });
  }

  return (
    <main className="settings simple-settings" data-testid="simple-settings">
      <div className="settings-top">
        <button type="button" className="link-btn" onClick={onBack} data-testid="settings-back">
          {s.back}
        </button>
        <h1>{s.settings}</h1>
      </div>

      <section ref={accessRef} aria-labelledby="simple-access-title">
        <h3 className="section-title" id="simple-access-title">
          {t.access.title}
        </h3>
        <AccessCard
          uiLanguage={uiLanguage}
          onUseAvalet={() => void selectProvider("avalet")}
          onUseOwnKey={() => {
            const withKey = settings.providers.find((p) => p.providerId !== "avalet" && p.hasApiKey);
            void selectProvider(withKey?.providerId ?? "anthropic");
          }}
        />
        {ownMode ? <OwnKeySetup uiLanguage={uiLanguage} /> : null}
        {modelInUse ? (
          <p className="hint" data-testid="model-in-use">
            {modelInUse}
          </p>
        ) : null}
        <UsageCounter uiLanguage={uiLanguage} detailed={false} />
      </section>

      <section aria-labelledby="simple-meeting-title">
        <h3 className="section-title" id="simple-meeting-title">
          {s.meetingSection}
        </h3>
        <ContextFields uiLanguage={uiLanguage} roleWording />
      </section>

      <section ref={speechRef} aria-labelledby="simple-speech-title">
        <h3 className="section-title" id="simple-speech-title">
          {t.settings.speechTitle}
        </h3>
        <div className="field">
          <label htmlFor="simple-speech-language">{t.settings.speechLanguage}</label>
          <select
            id="simple-speech-language"
            value={settings.speechLanguage}
            onChange={(e) => {
              const language = e.target.value as SpeechLanguage;
              patch({ speechLanguage: language });
              void bridge.settings.setSpeech({ language });
            }}
          >
            {SPEECH_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t.settings.speechLanguages[code]}
              </option>
            ))}
          </select>
        </div>
        <SpeechModels
          uiLanguage={uiLanguage}
          selected={settings.speechModel}
          onSelect={(model) => {
            patch({ speechModel: model });
            void bridge.settings.setSpeech({ model });
          }}
          allowDelete
        />
      </section>

      <section aria-labelledby="simple-files-title">
        <h3 className="section-title" id="simple-files-title">
          {s.filesSection}
        </h3>
        <p className="hint">{s.saveTo}</p>
        <div className="folder-row">
          <code className="folder-path" data-testid="export-dir">
            {settings.exportDir}
          </code>
          <button type="button" onClick={() => void chooseExportDir()} data-testid="choose-export-dir">
            {s.chooseFolder}
          </button>
        </div>
      </section>

      <section aria-labelledby="simple-appearance-title">
        <h3 className="section-title" id="simple-appearance-title">
          {s.appearance}
        </h3>
        <div className="field-row">
          <label htmlFor="simple-ui-language">{s.interfaceLanguage}</label>
          <select
            id="simple-ui-language"
            value={settings.uiLanguage}
            onChange={(e) => {
              const language = e.target.value === "en" ? "en" : "ru";
              patch({ uiLanguage: language });
              void bridge.settings.setUiLanguage(language);
            }}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="simple-theme">{s.theme}</label>
          <select
            id="simple-theme"
            value={settings.theme}
            onChange={(e) => {
              const theme = e.target.value === "light" ? "light" : "dark";
              patch({ theme });
              void bridge.settings.setTheme(theme);
            }}
          >
            <option value="dark">{s.themeDark}</option>
            <option value="light">{s.themeLight}</option>
          </select>
        </div>
        <OpacitySlider uiLanguage={uiLanguage} />
      </section>

      <section aria-labelledby="simple-more-title">
        <h3 className="section-title" id="simple-more-title">
          {s.advancedMode}
        </h3>
        <p className="hint">{s.advancedHint}</p>
        <div className="access-actions">
          <button type="button" onClick={() => void bridge.settings.setUiLevel("advanced")} data-testid="to-advanced">
            {s.advancedMode}
          </button>
          <button type="button" onClick={onRunSetup}>
            {s.runSetup}
          </button>
          <button type="button" className="danger" onClick={() => void bridge.app.quit()}>
            {t.settings.quit}
          </button>
        </div>
      </section>
    </main>
  );
}
