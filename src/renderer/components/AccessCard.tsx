import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { AccessState } from "../../../electron/shared/ipc-contract.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { compactTokens } from "./UsageCounter.js";

export function useAccess(): AccessState | null {
  const bridge = getBridge();
  const [access, setAccess] = useState<AccessState | null>(null);
  useEffect(() => {
    void bridge.billing.access().then(setAccess);
    return bridge.events.onAccessChanged(setAccess);
  }, []);
  return access;
}

export function formatPrice(price: AccessState["price"], language: UiLanguage): string {
  try {
    return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
      style: "currency",
      currency: price.currency,
      maximumFractionDigits: 0,
    }).format(price.amount);
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

function formatDate(ms: number | null, language: UiLanguage): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long" });
}

type Props = {
  uiLanguage: UiLanguage;
  /** Switch to own-key mode (the parent shows the provider and key fields). */
  onUseOwnKey: () => void;
  /** Switch the provider to Avalet. */
  onUseAvalet: () => void;
};

/**
 * Where the user stands: own key, trial, Pro, or a problem, each with one
 * sentence and at most two buttons. Budget and plan come from the signed
 * entitlement; the server enforces them, this only shows them.
 */
export function AccessCard({ uiLanguage, onUseOwnKey, onUseAvalet }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage].access;
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  if (!access) return null;

  const fmt = (n: number) => compactTokens(n, uiLanguage);
  const price = `${formatPrice(access.price, uiLanguage)} ${t.perMonth}`;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const checkout = () => run(() => bridge.billing.checkout("pro"));
  const refresh = () => run(() => bridge.billing.refresh());

  let text = "";
  let primary: { label: string; onClick: () => void } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  if (access.mode === "own") {
    text = access.status === "no-key" ? t.ownNoKey : t.ownOk;
    if (!access.activated) secondary = { label: t.startTrial, onClick: () => void run(async () => { await bridge.billing.activateTrial(); onUseAvalet(); }) };
    else secondary = { label: t.useAvalet, onClick: onUseAvalet };
  } else if (access.checkoutPending) {
    text = t.checkoutPending;
    primary = { label: t.paid, onClick: () => void refresh() };
  } else {
    switch (access.status) {
      case "not-activated":
        text = t.notActivated.replace("{n}", fmt(access.trialBudget));
        primary = { label: t.startTrial, onClick: () => void run(() => bridge.billing.activateTrial()) };
        secondary = { label: t.useOwnKey, onClick: onUseOwnKey };
        break;
      case "ok":
      case "offline-grace": {
        const left = (access.tier === "pro" ? t.proLeft : t.trialLeft).replace("{left}", fmt(access.remaining)).replace("{total}", fmt(access.budget));
        const period = access.tier === "pro" && access.periodEnd ? ` ${(access.renews ? t.renewsOn : t.endsOn).replace("{date}", formatDate(access.periodEnd, uiLanguage))}` : "";
        text = access.status === "offline-grace" ? `${left} ${t.offlineGrace.replace("{date}", formatDate(access.graceEndsAt, uiLanguage))}` : `${left}${period}`;
        if (access.tier === "pro") primary = { label: t.manage, onClick: () => void run(() => bridge.billing.openManage()) };
        else primary = { label: t.getPro.replace("{price}", price), onClick: () => void checkout() };
        break;
      }
      case "exhausted":
        text = t.exhausted;
        primary = { label: access.tier === "pro" ? t.buyMore : t.getPro.replace("{price}", price), onClick: () => void checkout() };
        secondary = { label: t.useOwnKey, onClick: onUseOwnKey };
        break;
      case "expired":
        text = t.expired;
        primary = { label: t.renewPro, onClick: () => void checkout() };
        secondary = { label: t.useOwnKey, onClick: onUseOwnKey };
        break;
      case "offline-expired":
        text = t.offlineExpired;
        primary = { label: t.checkAgain, onClick: () => void refresh() };
        secondary = { label: t.useOwnKey, onClick: onUseOwnKey };
        break;
      case "invalid":
        text = t.invalid;
        primary = { label: t.checkAgain, onClick: () => void refresh() };
        secondary = { label: t.useOwnKey, onClick: onUseOwnKey };
        break;
      default:
        text = t.ownOk;
    }
  }

  const problem = ["exhausted", "expired", "offline-expired", "invalid"].includes(access.status) && access.mode === "avalet";
  const meter = access.mode === "avalet" && access.activated && access.budget > 0 ? Math.min(100, (access.used / access.budget) * 100) : null;

  return (
    <div className={`access-card ${problem ? "problem" : ""}`} data-testid="access-card" data-status={access.status} data-tier={access.tier}>
      <p className="access-text" role="status">
        {text}
      </p>
      {meter !== null && !problem ? (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${meter}%` }} />
        </div>
      ) : null}
      {primary || secondary ? (
        <div className="access-actions">
          {primary ? (
            <button type="button" className="primary" disabled={busy} onClick={primary.onClick}>
              {primary.label}
            </button>
          ) : null}
          {secondary ? (
            <button type="button" disabled={busy} onClick={secondary.onClick}>
              {secondary.label}
            </button>
          ) : null}
        </div>
      ) : null}
      {access.mode === "avalet" ? <p className="hint">{t.serverNote}</p> : null}
    </div>
  );
}
