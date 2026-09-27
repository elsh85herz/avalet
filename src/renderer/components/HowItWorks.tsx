import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

type Props = {
  uiLanguage: UiLanguage;
  /** First-run: "Got it, start"; reopened from Simple home: "Close". */
  mode: "first-run" | "reopened";
  onClose: () => void;
};

/**
 * A short, static read of what the overlay and its buttons do, meant to be
 * studied once before the first real call rather than discovered live
 * (tooltips mid-meeting would just be one more thing competing for
 * attention during the call itself).
 */
export function HowItWorks({ uiLanguage, mode, onClose }: Props) {
  const t = UI_STRINGS[uiLanguage];
  const g = t.guide;

  return (
    <main className="wizard" data-testid="how-it-works">
      <div className="wizard-body">
        <h1 tabIndex={-1}>{g.title}</h1>
        <p className="hint">{g.intro}</p>

        <section className="try-it">
          <h2>{g.overlayTitle}</h2>
          <p>{g.overlayBody}</p>
        </section>

        <section className="try-it">
          <h2>{g.actionsTitle}</h2>
          <ul className="guide-actions">
            <li>{g.actionSummarize}</li>
            <li>{g.actionRisks}</li>
            <li>{g.actionAskQuestion}</li>
            <li>{g.actionExplain}</li>
          </ul>
        </section>

        <section className="try-it">
          <h2>{g.autoTitle}</h2>
          <p>{g.autoBody}</p>
        </section>

        <section className="try-it">
          <h2>{g.endTitle}</h2>
          <p>{g.endBody}</p>
        </section>

        <section className="try-it">
          <h2>{g.trackerTitle}</h2>
          <p>{g.trackerBody}</p>
        </section>
      </div>
      <footer className="wizard-nav">
        <span />
        <div className="wizard-nav-right">
          <button type="button" className="primary" data-testid="guide-done" onClick={onClose}>
            {mode === "first-run" ? g.done : g.close}
          </button>
        </div>
      </footer>
    </main>
  );
}
