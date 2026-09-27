import { useState } from "react";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import overlayExpanded from "../assets/guide/overlay-expanded.png";
import overlayChecklist from "../assets/guide/overlay-checklist.png";

type Props = {
  uiLanguage: UiLanguage;
  /** First-run: last button says "Got it, start"; reopened from Simple home: "Close". */
  mode: "first-run" | "reopened";
  onClose: () => void;
};

/** Pixel box on the 380x560 screenshot (see docs/dev, screenshots regenerated via AVALET_SCREENSHOT_DIR). */
type Spot = { x: number; y: number; w: number; h: number; radius: number };

type Page = { image: string; spot?: Spot; title: string; body: string };

/**
 * A short, paginated read of what the overlay and its buttons do, meant to
 * be studied once before the first real call rather than discovered live
 * (tooltips mid-meeting would just be one more thing competing for
 * attention during the call itself). Each page circles the one control it
 * talks about on a real screenshot of the app, the way the first-run wizard
 * itself is paginated.
 */
export function HowItWorks({ uiLanguage, mode, onClose }: Props) {
  const t = UI_STRINGS[uiLanguage];
  const g = t.guide;
  const w = t.wizard;
  const qa = t.quickActions;
  const [step, setStep] = useState(1);

  const pages: Page[] = [
    { image: overlayExpanded, title: g.overlayTitle, body: g.overlayBody },
    { image: overlayExpanded, spot: { x: 22, y: 6, w: 200, h: 32, radius: 18 }, title: g.endTitle, body: g.endBody },
    { image: overlayExpanded, spot: { x: 278, y: 50, w: 58, h: 28, radius: 16 }, title: g.autoTitle, body: g.autoBody },
    { image: overlayExpanded, spot: { x: 0, y: 483, w: 64, h: 28, radius: 14 }, title: qa.summarize, body: g.actionSummarize },
    { image: overlayExpanded, spot: { x: 59, y: 483, w: 56, h: 28, radius: 14 }, title: qa.risks, body: g.actionRisks },
    { image: overlayExpanded, spot: { x: 110, y: 481, w: 163, h: 30, radius: 16 }, title: qa.askQuestion, body: g.actionAskQuestion },
    { image: overlayExpanded, spot: { x: 271, y: 483, w: 102, h: 28, radius: 14 }, title: qa.explainThis, body: g.actionExplain },
    { image: overlayChecklist, spot: { x: 2, y: 114, w: 376, h: 26, radius: 10 }, title: g.trackerTitle, body: g.trackerBody },
  ];
  const total = pages.length;
  const page = pages[step - 1]!;
  const next = () => setStep((s) => Math.min(total, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <main className="wizard guide" data-testid="how-it-works" data-step={step}>
      <header className="wizard-top">
        <span className="wizard-step" aria-live="polite">
          {w.stepOf.replace("{n}", String(step)).replace("{total}", String(total))}
        </span>
        <div className="wizard-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`dot-step ${i + 1 <= step ? "on" : ""}`} />
          ))}
        </div>
        <span />
      </header>
      <div className="wizard-body">
        {step === 1 ? (
          <>
            <h1 tabIndex={-1}>{g.title}</h1>
            <p className="hint">{g.intro}</p>
          </>
        ) : null}
        <figure className="guide-shot">
          <span className="guide-shot-frame">
            <img src={page.image} alt="" />
            {page.spot ? (
              <span
                className="guide-spot"
                style={{
                  left: `${(page.spot.x / 380) * 100}%`,
                  top: `${(page.spot.y / 560) * 100}%`,
                  width: `${(page.spot.w / 380) * 100}%`,
                  height: `${(page.spot.h / 560) * 100}%`,
                  borderRadius: page.spot.radius,
                }}
              />
            ) : null}
          </span>
          <figcaption>
            <h2>{page.title}</h2>
            <p>{page.body}</p>
          </figcaption>
        </figure>
      </div>
      <footer className="wizard-nav">
        {step > 1 ? (
          <button type="button" onClick={back}>
            {w.back}
          </button>
        ) : (
          <span />
        )}
        <div className="wizard-nav-right">
          {step < total ? (
            <button type="button" className="link-btn" onClick={onClose} data-testid="guide-skip">
              {w.skip}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            data-testid="guide-next"
            onClick={() => (step < total ? next() : onClose())}
          >
            {step < total ? w.next : mode === "first-run" ? g.done : g.close}
          </button>
        </div>
      </footer>
    </main>
  );
}
