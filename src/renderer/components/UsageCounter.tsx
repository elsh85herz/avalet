import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { UsageSummary } from "../../../electron/shared/ipc-contract.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

export function useUsage(): UsageSummary | null {
  const bridge = getBridge();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => {
    void bridge.usage.get().then(setUsage);
    return bridge.events.onUsageChanged(setUsage);
  }, []);
  return usage;
}

/** 1234 -> "1.2k", 500000 -> "500k", 5000000 -> "5M"; plain below a thousand. */
export function compactTokens(n: number, language: UiLanguage): string {
  const short = (value: number) => (value >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1));
  const text = n >= 1e6 ? `${short(n / 1e6)}M` : n >= 1e3 ? `${short(n / 1e3)}k` : String(Math.round(n));
  return language === "ru" ? text.replace(".", ",").replace("k", " тыс.").replace("M", " млн") : text;
}

/** Settings: a line for this month, and the breakdown in Advanced. Never a warning. */
export function UsageCounter({ uiLanguage, detailed }: { uiLanguage: UiLanguage; detailed: boolean }) {
  const t = UI_STRINGS[uiLanguage].usage;
  const usage = useUsage();
  if (!usage) return null;
  const month = {
    inputTokens: usage.own.inputTokens + usage.avalet.inputTokens,
    outputTokens: usage.own.outputTokens + usage.avalet.outputTokens,
    calls: usage.own.calls + usage.avalet.calls,
    estimatedCalls: usage.own.estimatedCalls + usage.avalet.estimatedCalls,
  };
  const fmt = (n: number) => compactTokens(n, uiLanguage);
  return (
    <div className="usage-counter" data-testid="usage-counter">
      {month.calls === 0 ? (
        <p className="hint">{t.none}</p>
      ) : (
        <p className="usage-line">
          <span>{t.thisMonth}:</span> <strong>{fmt(month.inputTokens + month.outputTokens)}</strong> {t.tokens}{" "}
          <span className="hint">({t.inOut.replace("{in}", fmt(month.inputTokens)).replace("{out}", fmt(month.outputTokens))})</span>
        </p>
      )}
      {detailed && month.calls > 0 ? (
        <dl className="usage-breakdown">
          {(Object.keys(usage.byPurpose) as Array<keyof typeof usage.byPurpose>).map((purpose) =>
            usage.byPurpose[purpose].calls > 0 ? (
              <div key={purpose}>
                <dt>{t.purposes[purpose]}</dt>
                <dd>{fmt(usage.byPurpose[purpose].inputTokens + usage.byPurpose[purpose].outputTokens)}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
      {detailed && month.estimatedCalls > 0 ? <p className="hint">{t.estimatedNote.replace("{n}", String(month.estimatedCalls))}</p> : null}
    </div>
  );
}
