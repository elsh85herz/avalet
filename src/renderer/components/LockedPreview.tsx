import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { includedModesText, isUnlocked, type LockedFeature } from "../lib/locks.js";
import { formatPrice, useAccess } from "./AccessCard.js";
import overlayExpanded from "../assets/guide/overlay-expanded.png";
import overlayChecklist from "../assets/guide/overlay-checklist.png";
import modeRequirements from "../assets/guide/mode-requirements.png";
import modeGrooming from "../assets/guide/mode-grooming.png";
import modeDemo from "../assets/guide/mode-demo.png";
import modeReview from "../assets/guide/mode-review.png";

// Real screenshots of the overlay in use (made by the screenshot mode under
// Xvfb, like the first-run guide's images).
const MODE_IMAGES: Record<string, string> = {
  requirements: modeRequirements,
  grooming: modeGrooming,
  demo: modeDemo,
  review: modeReview,
};

type Props = {
  uiLanguage: UiLanguage;
  feature: LockedFeature;
  onClose: () => void;
  /** After the plan changed: select the mode or turn the checklist on. */
  onUse: () => void;
  /** Small window (the overlay): a shorter image. */
  compact?: boolean;
};

/**
 * "This exists, this is what it does, this plan has it": shown instead of a
 * locked mode or the locked live checklist. Only reachable through
 * lib/locks.ts, so it can never appear with an own key or without a billing
 * server. Upgrade uses the same checkout as the access card; the preview
 * stays open and turns into "Done" once the plan includes the feature.
 */
export function LockedPreview({ uiLanguage, feature, onClose, onUse, compact }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage];
  const l = t.locks;
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const name = feature.kind === "mode" ? t.modes[feature.mode] : t.settings.liveTracker;
  const unlocked = access ? isUnlocked(access, feature) : false;
  const title = unlocked
    ? feature.kind === "mode"
      ? l.unlocked.replace("{mode}", name)
      : l.checklistUnlocked
    : feature.kind === "mode"
      ? l.modeTitle.replace("{mode}", name)
      : l.checklistTitle;
  const body =
    feature.kind === "mode"
      ? [t.modeHelp[feature.mode], feature.mode in l.boardLine ? l.boardLine[feature.mode as keyof typeof l.boardLine] : ""].filter(Boolean).join(" ")
      : l.checklistBody;
  const image = feature.kind === "mode" ? (MODE_IMAGES[feature.mode] ?? overlayExpanded) : overlayChecklist;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="locked-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className={`locked-card ${compact ? "compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="locked-title"
        data-testid="locked-preview"
        data-feature={feature.kind === "mode" ? feature.mode : "checklist"}
        data-unlocked={unlocked ? "true" : "false"}
      >
        <h2 id="locked-title" tabIndex={-1} ref={headingRef}>
          {title}
        </h2>
        <figure className="locked-shot">
          <img src={image} alt={l.imageAlt.replace("{name}", name)} />
        </figure>
        <p>{body}</p>
        {unlocked || !access ? null : (
          <>
            <p className="hint">{l.planLine}</p>
            {feature.kind === "mode" ? <p className="hint">{l.includedLine.replace("{modes}", includedModesText(access, t))}</p> : null}
          </>
        )}
        <div className="access-actions">
          {unlocked ? (
            <button type="button" className="primary" onClick={onUse} data-testid="locked-use">
              {feature.kind === "mode" ? l.useIt : l.turnOn}
            </button>
          ) : access?.checkoutPending ? (
            <>
              <p className="hint">{t.access.checkoutPending}</p>
              <button type="button" className="primary" disabled={busy} onClick={() => void run(() => bridge.billing.refresh())}>
                {t.access.paid}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy || !access}
              onClick={() => void run(() => bridge.billing.checkout("pro"))}
              data-testid="locked-upgrade"
            >
              {access ? t.access.getPro.replace("{price}", `${formatPrice(access.price, uiLanguage)} ${t.access.perMonth}`) : ""}
            </button>
          )}
          <button type="button" onClick={onClose} data-testid="locked-close">
            {unlocked ? t.guide.close : l.notNow}
          </button>
        </div>
        {unlocked ? null : (
          <p className="hint">
            {l.ownKeyHint}{" "}
            <button type="button" className="link-btn" onClick={() => void bridge.app.showAccess().then(onClose)}>
              {t.access.useOwnKey}
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
