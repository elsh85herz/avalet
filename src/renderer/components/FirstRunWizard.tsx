import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { SPEECH_LANGUAGES, type SpeechLanguage } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { PermissionRows } from "./PermissionRows.js";
import { AccessCard, formatPrice, useAccess } from "./AccessCard.js";
import { OwnKeySetup } from "./OwnKeySetup.js";
import { RECOMMENDED_MODEL, SpeechModels, useSpeechModels } from "./SpeechModels.js";
import { ContextFields } from "./ContextFields.js";
import { MicLevel } from "./MicLevel.js";
import { compactTokens } from "./UsageCounter.js";
import { SELFTEST_EXAMPLE_SUGGESTION, SELFTEST_LINES } from "../../../electron/shared/selftest.js";

const STEPS = 4;
const SELFTEST_SECONDS = 20;

type Access = "avalet" | "own" | null;

/**
 * First run: permissions, access, speech model, minimal context with a short
 * self-test. Every screen can be skipped; nothing is downloaded or sent
 * without a button press.
 */
export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const bridge = getBridge();
  const { settings, reload, patch } = useAppSettings();
  const uiLanguage: UiLanguage = settings.uiLanguage;
  const t = UI_STRINGS[uiLanguage];
  const w = t.wizard;
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<Access>(settings.selectedProviderId === "avalet" ? "avalet" : null);
  const access = useAccess();
  const models = useSpeechModels();
  const [trying, setTrying] = useState(false);
  const [micDone, setMicDone] = useState(false);
  const [sample, setSample] = useState<{ state: "loading" } | { state: "ok"; text: string } | { state: "failed"; message: string } | null>(null);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>(".wizard h1");
    heading?.focus();
  }, [step]);

  // No billing server in this build: "own key" is the only working choice, so it is preselected.
  const builtIn = access?.builtInAvailable ?? false;
  useEffect(() => {
    if (access && !access.builtInAvailable && choice === null) setChoice("own");
  }, [access?.builtInAvailable]);

  async function toggleLanguage() {
    const next = uiLanguage === "ru" ? "en" : "ru";
    patch({ uiLanguage: next });
    await bridge.settings.setUiLanguage(next);
  }

  async function chooseAvalet() {
    if (!builtIn) return;
    setChoice("avalet");
    await bridge.settings.selectProvider("avalet");
    if (!access?.activated) await bridge.billing.activateTrial();
    await reload();
  }

  async function chooseOwn() {
    setChoice("own");
    if (settings.selectedProviderId === "avalet") await bridge.settings.selectProvider("anthropic");
    await reload();
  }

  async function setSpeechLanguage(language: SpeechLanguage) {
    patch({ speechLanguage: language });
    await bridge.settings.setSpeech({ language });
  }

  async function tryIt() {
    setTrying(true);
    setMicDone(false);
    setSample({ state: "loading" });
    const result = await bridge.billing.selfTest();
    setSample(result.ok ? { state: "ok", text: result.text } : { state: "failed", message: result.message });
  }

  async function finish() {
    await bridge.settings.setOnboardingDone(true);
    await reload();
    onDone();
  }

  const recommended = models?.find((m) => m.name === RECOMMENDED_MODEL);
  const size = recommended ? `${(recommended.sizeBytes / 1e9).toFixed(1).replace(".", uiLanguage === "ru" ? "," : ".")} ${t.models.size}` : "";
  const next = () => setStep((s) => Math.min(STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  let body: JSX.Element;
  let nextLabel = w.next;
  if (step === 1) {
    body = (
      <>
        <h1 tabIndex={-1}>{w.permTitle}</h1>
        <p className="hint">{w.permIntro}</p>
        <PermissionRows uiLanguage={uiLanguage} platform={settings.platform} />
      </>
    );
  } else if (step === 2) {
    const price = access ? `${formatPrice(access.price, uiLanguage)} ${t.access.perMonth}` : "";
    body = (
      <>
        <h1 tabIndex={-1}>{w.accessTitle}</h1>
        <div className="choice-list" role="radiogroup" aria-label={w.accessTitle}>
          <button
            type="button"
            role="radio"
            aria-checked={choice === "avalet"}
            className={`choice ${choice === "avalet" ? "active" : ""}`}
            data-testid="choice-avalet"
            disabled={!builtIn}
            aria-disabled={!builtIn}
            onClick={() => void chooseAvalet()}
          >
            <strong>
              {w.avaletChoice}
              {builtIn ? null : <span className="badge">{t.access.comingSoon}</span>}
            </strong>
            <span>
              {builtIn
                ? w.avaletChoiceDesc.replace("{n}", compactTokens(access?.trialBudget ?? 500_000, uiLanguage)).replace("{price}", price)
                : w.avaletComingSoonDesc}
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === "own"}
            className={`choice ${choice === "own" ? "active" : ""}`}
            data-testid="choice-own"
            onClick={() => void chooseOwn()}
          >
            <strong>{w.ownChoice}</strong>
            <span>{w.ownChoiceDesc}</span>
          </button>
        </div>
        {choice === "avalet" ? (
          <AccessCard uiLanguage={uiLanguage} onUseAvalet={() => void chooseAvalet()} onUseOwnKey={() => void chooseOwn()} />
        ) : null}
        {choice === "own" ? <OwnKeySetup uiLanguage={uiLanguage} /> : null}
      </>
    );
  } else if (step === 3) {
    if (recommended?.state === "downloading") nextLabel = w.continueInBackground;
    body = (
      <>
        <h1 tabIndex={-1}>{w.modelTitle}</h1>
        <p className="hint">{w.modelDesc.replace("{size}", size)}</p>
        <p className="hint">{w.otherModelsLater}</p>
        <SpeechModels
          uiLanguage={uiLanguage}
          selected={settings.speechModel}
          only={[RECOMMENDED_MODEL]}
          onSelect={(model) => {
            patch({ speechModel: model });
            void bridge.settings.setSpeech({ model });
          }}
        />
      </>
    );
  } else {
    nextLabel = w.finish;
    body = (
      <>
        <h1 tabIndex={-1}>{w.contextTitle}</h1>
        <div className="field">
          <label htmlFor="wizard-speech-language">{t.settings.speechLanguage}</label>
          <select
            id="wizard-speech-language"
            value={settings.speechLanguage}
            onChange={(e) => void setSpeechLanguage(e.target.value as SpeechLanguage)}
          >
            {SPEECH_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t.settings.speechLanguages[code]}
              </option>
            ))}
          </select>
        </div>
        <ContextFields uiLanguage={uiLanguage} roleWording />
        <section className="try-it" aria-labelledby="try-it-title">
          <div className="try-it-head">
            <h2 id="try-it-title">{w.tryTitle}</h2>
            <button type="button" onClick={() => void tryIt()} disabled={trying && !micDone} data-testid="try-it">
              {w.tryIt}
            </button>
          </div>
          {trying ? <MicLevel uiLanguage={uiLanguage} seconds={SELFTEST_SECONDS} onDone={() => setMicDone(true)} /> : null}
          {sample ? (
            <div className="sample" data-testid="sample">
              <h3>{w.sampleConversation}</h3>
              <ul className="sample-conversation">
                {SELFTEST_LINES.map((line) => (
                  <li key={line.text}>
                    <strong>{line.speaker === "me" ? t.meeting.me : t.meeting.other}:</strong> {line.text}
                  </li>
                ))}
              </ul>
              <h3>{w.sampleTitle}</h3>
              {sample.state === "loading" ? <p className="hint">{w.sampleLoading}…</p> : null}
              {sample.state === "ok" ? <p className="block-text">{sample.text}</p> : null}
              {sample.state === "failed" ? (
                <>
                  <p className="hint">{sample.message}</p>
                  <p className="hint">{w.sampleFallback}</p>
                  <p className="block-text">{SELFTEST_EXAMPLE_SUGGESTION}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </>
    );
  }

  return (
    <main className="wizard" data-testid="wizard" data-step={step}>
      <header className="wizard-top">
        <span className="wizard-step" aria-live="polite">
          {w.stepOf.replace("{n}", String(step)).replace("{total}", String(STEPS))}
        </span>
        <div className="wizard-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={`dot-step ${i + 1 <= step ? "on" : ""}`} />
          ))}
        </div>
        <button type="button" className="lang-btn" onClick={() => void toggleLanguage()} title={t.uiLangTitle} aria-label={t.uiLangTitle}>
          {uiLanguage === "ru" ? "RU" : "EN"}
        </button>
      </header>
      <div className="wizard-body">{body}</div>
      <footer className="wizard-nav">
        {step > 1 ? (
          <button type="button" onClick={back}>
            {w.back}
          </button>
        ) : (
          <span />
        )}
        <div className="wizard-nav-right">
          {step < STEPS ? (
            <button type="button" className="link-btn" onClick={next} data-testid="wizard-skip">
              {w.skip}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            data-testid="wizard-next"
            onClick={() => (step < STEPS ? next() : void finish())}
          >
            {nextLabel}
          </button>
        </div>
      </footer>
    </main>
  );
}
