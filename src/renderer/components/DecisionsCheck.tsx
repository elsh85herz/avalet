import { useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import type { Decision } from "../../../electron/shared/ipc-contract.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { formatTokens } from "../lib/artifact-cost.js";
import { buildCheckItems, checkCostTokens, checkableDecisions } from "../../../electron/shared/decision-check.js";

type Props = {
  meeting: Meeting;
  /** The rows as edited in the panel (saved before the check goes out). */
  rows: Decision[];
  uiLanguage: UiLanguage;
  beforeSend: () => Promise<void>;
  onChange: (meeting: Meeting) => void;
};

type Step = "idle" | "confirm" | "working";

/**
 * "Check against the quotes" (CLOUD_TASK_6 phase 2): never automatic. The
 * cost is shown on the button and again in a confirmation; the call can only
 * lower a decision or mark its terms as not clarified.
 */
export function DecisionsCheck({ meeting, rows, uiLanguage, beforeSend, onChange }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage].spec;
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null);
  const checkable = checkableDecisions(rows);
  if (checkable.length === 0) return null;
  const tokens = checkCostTokens(buildCheckItems(checkable, meeting.transcript.filter((seg) => !seg.filtered), meeting.startedAt));
  const fmt = formatTokens(tokens, uiLanguage);

  async function send() {
    setStep("working");
    setMessage(null);
    await beforeSend();
    const result = await bridge.meetings.checkDecisions(meeting.id);
    setStep("idle");
    if (!result.ok) {
      setMessage({ text: result.code === "bad-reply" ? t.badReply : t.checkError.replace("{message}", result.message), problem: true });
      return;
    }
    onChange(result.meeting);
    setMessage({ text: t.checkDone.replace("{n}", String(result.checked)), problem: false });
  }

  return (
    <div className="decisions-check" data-testid="decisions-check">
      <div className="agenda-edit-actions">
        <button type="button" disabled={step !== "idle"} onClick={() => setStep("confirm")} data-testid="decisions-check-button">
          {step === "working" ? t.checkWorking : t.checkButton}
        </button>
        <span className="hint">{t.updateCostInline.replace("{tokens}", fmt)}</span>
      </div>
      {step === "confirm" ? (
        <div className="cost-note confirm" role="dialog" aria-label={t.checkButton} data-testid="decisions-check-confirm">
          <p>{t.checkConfirmText.replace("{count}", String(checkable.length)).replace("{tokens}", fmt)}</p>
          <div className="agenda-edit-actions">
            <button type="button" className="primary" onClick={() => void send()} data-testid="decisions-check-send">
              {t.confirm}
            </button>
            <button type="button" onClick={() => setStep("idle")} data-testid="decisions-check-cancel">
              {t.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className={`hint${message.problem ? " problem-text" : ""}`} role={message.problem ? "alert" : "status"} data-testid="decisions-check-result">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
