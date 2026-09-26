import { useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { PROVIDER_PRESETS_UI } from "../providers/presets.js";

const OWN_PROVIDERS = PROVIDER_PRESETS_UI.filter((p) => p.id !== "avalet");

/**
 * Provider, key, and one "Save and test" button that makes a tiny real call
 * and says in one sentence what is wrong when it fails.
 */
export function OwnKeySetup({ uiLanguage, onVerified }: { uiLanguage: UiLanguage; onVerified?: () => void }) {
  const bridge = getBridge();
  const { settings, reload } = useAppSettings();
  const t = UI_STRINGS[uiLanguage];
  const initial = OWN_PROVIDERS.some((p) => p.id === settings.selectedProviderId) ? settings.selectedProviderId : "anthropic";
  const [providerId, setProviderId] = useState(initial);
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(settings.providers.find((p) => p.providerId === initial)?.baseUrl ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const preset = OWN_PROVIDERS.find((p) => p.id === providerId)!;
  const saved = settings.providers.find((p) => p.providerId === providerId);

  async function choose(id: string) {
    setProviderId(id);
    setKey("");
    setResult(null);
    setBaseUrl(settings.providers.find((p) => p.providerId === id)?.baseUrl ?? "");
    await bridge.settings.selectProvider(id);
    await reload();
  }

  async function saveAndTest() {
    setTesting(true);
    setResult(null);
    try {
      await bridge.settings.selectProvider(providerId);
      if (key.trim()) await bridge.settings.setApiKey(providerId, key.trim());
      if (preset.baseUrlPlaceholder && baseUrl.trim()) await bridge.settings.updateProvider(providerId, { baseUrl: baseUrl.trim() });
      setKey("");
      await reload();
      const test = await bridge.billing.testProvider(providerId);
      setResult(test.ok ? { ok: true, message: t.wizard.testOk } : { ok: false, message: test.message });
      if (test.ok) onVerified?.();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }

  const needsKey = preset.apiKeyRequired;
  const canTest = !testing && (!needsKey || Boolean(key.trim()) || Boolean(saved?.hasApiKey));

  return (
    <div className="own-key" data-testid="own-key">
      <div className="field">
        <label htmlFor="own-provider">{t.wizard.provider}</label>
        <select id="own-provider" value={providerId} onChange={(e) => void choose(e.target.value)}>
          {OWN_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {preset.baseUrlPlaceholder && !needsKey ? (
        <div className="field">
          <label htmlFor="own-base-url">{t.settings.baseUrl}</label>
          <input id="own-base-url" type="text" value={baseUrl} placeholder={preset.baseUrlPlaceholder} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
      ) : null}
      {needsKey ? (
        <div className="field">
          <label htmlFor="own-key-input">{t.settings.apiKey}</label>
          <input
            id="own-key-input"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={saved?.hasApiKey ? t.settings.apiKeySavedPlaceholder : "sk-..."}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canTest) void saveAndTest();
            }}
          />
        </div>
      ) : null}
      <div className="own-key-actions">
        <button type="button" className="primary" disabled={!canTest} onClick={() => void saveAndTest()}>
          {testing ? `${t.wizard.testing}…` : t.wizard.saveAndTest}
        </button>
        {result ? (
          <span className={result.ok ? "ok-text" : "error"} role="status" data-testid="key-test-result">
            {result.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
