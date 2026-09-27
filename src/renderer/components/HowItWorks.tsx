import { useState } from "react";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import overlayExpanded from "../assets/guide/overlay-expanded.png";
import overlayChecklist from "../assets/guide/overlay-checklist.png";
import modeRequirements from "../assets/guide/mode-requirements.png";
import modeGrooming from "../assets/guide/mode-grooming.png";
import modeDemo from "../assets/guide/mode-demo.png";
import modeReview from "../assets/guide/mode-review.png";
import { useAccess } from "./AccessCard.js";
import { checklistLocked } from "../lib/locks.js";
import { MEETING_MODES, type MeetingMode } from "../lib/types.js";
import { quickActionsFor, type QuickActionKey } from "../live/quick-actions.js";

type Props = {
  uiLanguage: UiLanguage;
  /** First-run: last button says "Got it, start"; reopened from Simple home: "Close". */
  mode: "first-run" | "reopened";
  /** The meeting mode already selected in Settings, used as the guide's starting mode. */
  meetingMode: MeetingMode;
  onClose: () => void;
};

/** Pixel box on the 380x560 screenshot (see docs/dev, screenshots regenerated via AVALET_SCREENSHOT_DIR). */
type Spot = { x: number; y: number; w: number; h: number; radius: number };

type Page = { image: string; spot?: Spot; title: string; body: string; list?: { label: string; body: string }[]; modeSpecific?: boolean };

/** Real screenshot of a mode's running list, made the same way as the overlay screenshots. */
const MODE_BOARD_IMAGES: Partial<Record<MeetingMode, string>> = {
  requirements: modeRequirements,
  grooming: modeGrooming,
  demo: modeDemo,
  review: modeReview,
};

/** Bounding box of the quick-actions row, wide enough for one button (Process now) or several. */
const ACTIONS_SPOT: Spot = { x: 11, y: 482, w: 347, h: 29, radius: 14 };

/**
 * A short, paginated read of what the overlay and its buttons do, meant to
 * be studied once before the first real call rather than discovered live
 * (tooltips mid-meeting would just be one more thing competing for
 * attention during the call itself). Each page circles the one control it
 * talks about on a real screenshot of the app, the way the first-run wizard
 * itself is paginated.
 *
 * The overlay's buttons and running list are different per meeting mode
 * (electron/modes.ts, lib/mode-board.ts), so after the mode-independent
 * pages the guide asks which mode to read about and only shows what that
 * mode actually has (a mode picked here does not change the app's setting).
 */
export function HowItWorks({ uiLanguage, mode, meetingMode, onClose }: Props) {
  const t = UI_STRINGS[uiLanguage];
  const g = t.guide;
  const qa = t.quickActions;
  const l = t.locks;
  const [step, setStep] = useState(1);
  const [viewMode, setViewMode] = useState<MeetingMode>(meetingMode);
  // On an Avalet plan without the checklist, its page says which plan has it.
  const trackerLocked = checklistLocked(useAccess());

  // Boxes measured directly off the screenshots (pixel border-color scan,
  // not eyeballed) — see docs/dev for how to regenerate the screenshots if
  // the overlay layout changes and these drift.
  const actionBodies: Record<QuickActionKey, string> = {
    summarize: g.actionSummarize,
    risks: g.actionRisks,
    askQuestion: g.actionAskQuestion,
    explainThis: g.actionExplain,
  };
  const actions = quickActionsFor(viewMode);
  const actionsOrProcessPage: Page =
    viewMode === "interview"
      ? { image: overlayExpanded, spot: ACTIONS_SPOT, title: g.interviewTitle, body: g.interviewBody, modeSpecific: true }
      : {
          image: overlayExpanded,
          spot: ACTIONS_SPOT,
          title: g.actionsTitle,
          body: g.actionsIntro,
          list: actions.map((a) => ({ label: qa[a.key], body: actionBodies[a.key] })),
          modeSpecific: true,
        };
  const boardImage = MODE_BOARD_IMAGES[viewMode];
  const boardPage: Page[] = boardImage ? [{ image: boardImage, title: g.boardTitle, body: l.boardLine[viewMode as keyof typeof l.boardLine], modeSpecific: true }] : [];

  const pages: Page[] = [
    { image: overlayExpanded, title: g.overlayTitle, body: g.overlayBody },
    { image: overlayExpanded, spot: { x: 30, y: 9, w: 188, h: 31, radius: 18 }, title: g.endTitle, body: g.endBody },
    { image: overlayExpanded, spot: { x: 279, y: 44, w: 51, h: 33, radius: 16 }, title: g.autoTitle, body: g.autoBody },
    // Rendered as the mode menu below, not through the image+caption layout; image/body are unused.
    { image: overlayExpanded, title: g.chooseModeTitle, body: "" },
    actionsOrProcessPage,
    ...boardPage,
    { image: overlayChecklist, spot: { x: 2, y: 110, w: 376, h: 37, radius: 12 }, title: trackerLocked ? l.checklistTitle : g.trackerTitle, body: trackerLocked ? l.checklistBody : g.trackerBody },
  ];
  const menuStep = 4;
  const total = pages.length;
  const page = pages[step - 1]!;
  const isMenu = step === menuStep;
  const next = () => setStep((s) => Math.min(total, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <main className="wizard guide" data-testid="how-it-works" data-step={step}>
      <header className="wizard-top">
        <span className="wizard-step" aria-live="polite">
          {t.wizard.stepOf.replace("{n}", String(step)).replace("{total}", String(total))}
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
        {isMenu ? (
          <>
            <h1 tabIndex={-1}>{g.chooseModeTitle}</h1>
            <p className="hint">{g.chooseModeHint}</p>
            <div className="choice-list" role="radiogroup" aria-label={g.chooseModeTitle}>
              {MEETING_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === viewMode}
                  className={`choice ${m === viewMode ? "active" : ""}`}
                  data-testid={`guide-mode-${m}`}
                  onClick={() => setViewMode(m)}
                >
                  <strong>{t.modes[m]}</strong>
                  <span>{t.modeHelp[m]}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
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
              {page.list ? (
                <ul className="guide-list">
                  {page.list.map((item) => (
                    <li key={item.label}>
                      <strong>{item.label}:</strong> {item.body}
                    </li>
                  ))}
                </ul>
              ) : null}
              {page.modeSpecific ? (
                <button type="button" className="link-btn" data-testid="guide-change-mode" onClick={() => setStep(menuStep)}>
                  {g.changeMode}
                </button>
              ) : null}
            </figcaption>
          </figure>
        )}
      </div>
      <footer className="wizard-nav">
        {step > 1 ? (
          <button type="button" onClick={back}>
            {t.wizard.back}
          </button>
        ) : (
          <span />
        )}
        <div className="wizard-nav-right">
          {step < total ? (
            <button type="button" className="link-btn" onClick={onClose} data-testid="guide-skip">
              {t.wizard.skip}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            data-testid="guide-next"
            onClick={() => (step < total ? next() : onClose())}
          >
            {step < total ? t.wizard.next : mode === "first-run" ? g.done : g.close}
          </button>
        </div>
      </footer>
    </main>
  );
}
