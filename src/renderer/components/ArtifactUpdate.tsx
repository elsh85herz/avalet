import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import type { CheckedPatch } from "../../../electron/shared/ipc-contract.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { chosenDecisions, formatTokens, updateCost } from "../lib/artifact-cost.js";

type Props = {
  meeting: Meeting;
  uiLanguage: UiLanguage;
  onChange: (meeting: Meeting) => void;
  /** Download buttons (phase 5), shown with the result. */
  exports?: React.ReactNode;
};

type Step = "idle" | "confirm" | "working";

/**
 * "Update the document": cost first, then a confirmation, then one model
 * call that returns patches. The patches are shown one by one against the
 * document; nothing is written until Apply, and the original is kept.
 */
export function ArtifactUpdate({ meeting, uiLanguage, onChange, exports }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage].spec;
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const proposal = meeting.artifactProposal ?? null;
  const [picked, setPicked] = useState<Set<string>>(() => initialPick(meeting));

  useEffect(() => setPicked(initialPick(meeting)), [meeting.id, proposal?.at, meeting.artifactResult?.at]);

  const cost = updateCost(meeting);
  const fmt = (n: number) => formatTokens(n, uiLanguage);
  const chosen = chosenDecisions(meeting.decisions);
  const decisionText = (id: string) => meeting.decisions?.find((d) => d.id === id)?.text ?? "";

  async function send() {
    setStep("working");
    setError(null);
    const result = await bridge.meetings.proposePatches(meeting.id);
    setStep("idle");
    if (!result.ok) {
      setError(result.code === "bad-reply" ? t.badReply : t.updateError.replace("{message}", result.message));
      return;
    }
    const updated = await bridge.meetings.get(meeting.id);
    if (updated) onChange(updated);
  }

  async function apply(ids: string[]) {
    const updated = await bridge.meetings.applyPatches(meeting.id, ids);
    if (updated) onChange(updated);
  }

  async function copyResult() {
    if (!meeting.artifactResult) return;
    await navigator.clipboard.writeText(meeting.artifactResult.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const good = proposal?.patches.filter((p) => p.ok) ?? [];
  const bad = proposal?.patches.filter((p) => !p.ok) ?? [];
  // Sent, but the answer has neither a usable change nor a reason for it.
  const covered = new Set([...(proposal?.patches.map((p) => p.decisionId) ?? []), ...(proposal?.skipped.map((s) => s.decisionId) ?? [])]);
  const silent = proposal ? proposal.decisionIds.filter((id) => !covered.has(id)) : [];
  const unplaced = [
    ...bad.map((p) => ({ key: p.id, decision: decisionText(p.decisionId), reason: t.problems[p.problem ?? "anchor-missing"] })),
    ...(proposal?.skipped ?? []).map((s, i) => ({ key: `s${i}`, decision: decisionText(s.decisionId), reason: t.skippedBy.replace("{reason}", s.reason || "-") })),
    ...silent.map((id) => ({ key: `n-${id}`, decision: decisionText(id), reason: t.noChangeFor })),
  ];

  return (
    <div className="artifact-update" data-testid="artifact-update">
      <div className="agenda-edit-actions">
        <button
          type="button"
          className="primary"
          disabled={!meeting.artifact || chosen.length === 0 || step !== "idle"}
          onClick={() => setStep("confirm")}
          data-testid="artifact-update-button"
        >
          {step === "working" ? t.working : t.updateButton}
        </button>
        {cost ? (
          <span className="hint" data-testid="artifact-update-cost">
            {t.updateCostInline.replace("{tokens}", fmt(cost.total))}
          </span>
        ) : (
          <span className="hint">{!meeting.artifact ? t.updateNeedsDocument : t.updateNeedsChecked}</span>
        )}
      </div>

      {step === "confirm" && cost ? (
        <div className={`cost-note confirm${cost.high ? " high" : ""}`} role="dialog" aria-label={t.confirmTitle} data-testid="artifact-confirm">
          <strong>{t.confirmTitle}</strong>
          <p>
            {t.confirmText
              .replace("{doc}", fmt(cost.doc))
              .replace("{count}", String(cost.count))
              .replace("{decisions}", fmt(cost.decisions))
              .replace("{reply}", fmt(cost.reply))
              .replace("{total}", fmt(cost.total))}
          </p>
          {cost.high ? <p className="cost-high">{t.costHigh}</p> : null}
          <div className="agenda-edit-actions">
            <button type="button" className="primary" onClick={() => void send()} data-testid="artifact-confirm-send">
              {t.confirm}
            </button>
            <button type="button" onClick={() => setStep("idle")} data-testid="artifact-confirm-cancel">
              {t.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="hint problem-text" role="alert" data-testid="artifact-update-error">
          {error}
        </p>
      ) : null}

      {proposal ? (
        <div className="patch-preview" data-testid="patch-preview">
          <h4>{t.previewTitle}</h4>
          {good.length > 0 ? <p className="hint">{t.previewHint}</p> : <p className="hint">{t.noPatches}</p>}
          <ul className="patch-list">
            {good.map((p) => (
              <PatchRow
                key={p.id}
                patch={p}
                decision={decisionText(p.decisionId)}
                checked={picked.has(p.id)}
                onToggle={(on) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(p.id);
                    else next.delete(p.id);
                    return next;
                  })
                }
                uiLanguage={uiLanguage}
              />
            ))}
          </ul>
          {good.length > 0 ? (
            <div className="agenda-edit-actions">
              <button type="button" className="primary" onClick={() => void apply([...picked])} disabled={picked.size === 0} data-testid="patch-apply">
                {t.apply}
              </button>
            </div>
          ) : null}
          {unplaced.length > 0 ? (
            <div className="patch-unplaced" data-testid="patch-not-applied">
              <h4>{t.notAppliedTitle}</h4>
              <ul>
                {unplaced.map((u) => (
                  <li key={u.key}>
                    <span className="decision-text-static">{u.decision}</span> <span className="hint">({u.reason})</span>
                  </li>
                ))}
              </ul>
              <p className="hint">{t.fixByHand}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {meeting.artifactResult ? (
        <div className="artifact-result" data-testid="artifact-result">
          <h4>{t.resultTitle}</h4>
          <p className="hint">{t.resultLine.replace("{count}", String(meeting.artifactResult.patchIds.length))}</p>
          <div className="agenda-edit-actions">
            {exports}
            <button type="button" onClick={() => void copyResult()} data-testid="artifact-copy">
              {copied ? t.copied : t.copyDoc}
            </button>
            <button type="button" className="link-btn" onClick={() => void apply([])} data-testid="artifact-revert">
              {t.revert}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initialPick(meeting: Meeting): Set<string> {
  if (meeting.artifactResult) return new Set(meeting.artifactResult.patchIds);
  return new Set((meeting.artifactProposal?.patches ?? []).filter((p) => p.ok).map((p) => p.id));
}

function PatchRow({
  patch,
  decision,
  checked,
  onToggle,
  uiLanguage,
}: {
  patch: CheckedPatch;
  decision: string;
  checked: boolean;
  onToggle: (on: boolean) => void;
  uiLanguage: UiLanguage;
}) {
  const t = UI_STRINGS[uiLanguage].spec;
  return (
    <li className="patch-row" data-testid="patch" data-op={patch.op}>
      <label className="patch-head">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} data-testid="patch-include" />
        <span className="badge">{t.ops[patch.op]}</span>
        <span className="decision-text-static">{decision}</span>
      </label>
      <div className="patch-diff">
        <div>
          <span className="hint">{t.oldLabel}</span>
          <pre className="patch-old" data-testid="patch-old">{patch.oldFragment.trim() || t.emptyFragment}</pre>
        </div>
        <div>
          <span className="hint">{t.newLabel}</span>
          <pre className="patch-new" data-testid="patch-new">{patch.newFragment.trim() || t.emptyFragment}</pre>
        </div>
      </div>
    </li>
  );
}
