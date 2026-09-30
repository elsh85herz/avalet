import { useEffect, useMemo, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { Meeting } from "../lib/types.js";
import type { Decision, DecisionStatus } from "../../../electron/shared/ipc-contract.js";
import { DECISION_STATUSES } from "../../../electron/shared/ipc-contract.js";
import { ARTIFACT_CHAR_CAP, SECTION_UNKNOWN, parseSections, sectionLabel } from "../../../electron/shared/artifact.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { ArtifactUpdate } from "./ArtifactUpdate.js";

type Props = {
  meeting: Meeting;
  uiLanguage: UiLanguage;
  /** Simple level: before/after folded under "Details". */
  simple?: boolean;
  onChange: (meeting: Meeting) => void;
  jumpTo: (at: number) => void;
  clock: (at: number) => string;
  /** Download buttons for the updated document and the decisions. */
  exports?: React.ReactNode;
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Review mode: the decisions of the call as a checklist the analyst corrects
 * before the document is updated. Every edit is saved on the meeting and
 * marked as done by hand, so a new summary leaves it alone.
 */
export function DecisionsPanel({ meeting, uiLanguage, simple, onChange, jumpTo, clock, exports }: Props) {
  const bridge = getBridge();
  const t = UI_STRINGS[uiLanguage].spec;
  const tm = UI_STRINGS[uiLanguage].meeting;
  const [rows, setRows] = useState<Decision[]>(meeting.decisions ?? []);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => setRows(meeting.decisions ?? []), [meeting.id, meeting.decisions]);

  const artifactText = meeting.artifact?.text ?? "";
  const sections = useMemo(
    () => (artifactText ? parseSections(artifactText).filter((s) => s.number).map(sectionLabel) : []),
    [artifactText],
  );

  async function persist(next: Decision[]) {
    setRows(next);
    const updated = await bridge.meetings.setDecisions(meeting.id, next);
    if (updated) onChange(updated);
  }

  function edit(id: string, patch: Partial<Decision>, save = true) {
    const next = rowsRef.current.map((d) => (d.id === id ? { ...d, ...patch, manual: true } : d));
    if (save) void persist(next);
    else setRows(next);
  }

  function add() {
    const row: Decision = { id: newId(), text: "", status: "accepted", by: "", section: SECTION_UNKNOWN, before: "", after: "", include: true, manual: true };
    void persist([...rowsRef.current, row]);
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    if (fileRef.current) fileRef.current.value = "";
    if (text.length > ARTIFACT_CHAR_CAP) {
      setError(t.tooLarge.replace("{chars}", text.length.toLocaleString(uiLanguage === "ru" ? "ru-RU" : "en-US")));
      return;
    }
    setError(null);
    const updated = await bridge.meetings.setArtifact(meeting.id, { name: file.name, text });
    if (updated) onChange(updated);
  }

  const visible = rows.filter((d) => !d.removed);

  const sectionOptions = (current: string) => {
    const list = [...sections];
    if (current && current !== SECTION_UNKNOWN && !list.includes(current)) list.unshift(current);
    return list;
  };

  function beforeAfter(d: Decision) {
    return (
      <div className="decision-fields">
        <label>
          {t.beforeLabel}
          <textarea
            rows={2}
            value={d.before}
            onChange={(e) => edit(d.id, { before: e.target.value }, false)}
            onBlur={() => void persist(rowsRef.current)}
            data-testid="decision-before"
          />
        </label>
        <label>
          {t.afterLabel}
          <textarea
            rows={2}
            value={d.after}
            onChange={(e) => edit(d.id, { after: e.target.value }, false)}
            onBlur={() => void persist(rowsRef.current)}
            data-testid="decision-after"
          />
        </label>
      </div>
    );
  }

  return (
    <section className="decisions-panel" data-testid="decisions-panel" aria-label={t.decisionsTitle}>
      <h3>{t.decisionsTitle}</h3>
      {!meeting.artifact ? (
        <div className="empty-state-row" data-testid="decisions-no-document">
          <p className="hint">{t.noDocument}</p>
          <button type="button" onClick={() => fileRef.current?.click()} data-testid="decisions-attach">
            {t.attachDocument}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.markdown,text/plain,text/markdown"
            hidden
            data-testid="decisions-attach-file"
            onChange={(e) => void attach(e.target.files?.[0])}
          />
        </div>
      ) : (
        <p className="hint">
          {t.fileDocument}: {meeting.artifact.name || t.pastedName}. {visible.length > 0 ? t.decisionsHint : meeting.summary ? t.noDecisionsAfter : t.noDecisions}
        </p>
      )}
      {error ? (
        <p className="hint problem-text" role="alert">
          {error}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="decision-list">
          {visible.map((d) => (
            <li key={d.id} className={`decision-row ${d.include ? "included" : ""}`} data-testid="decision" data-status={d.status}>
              <input
                type="checkbox"
                className="decision-include"
                checked={d.include}
                aria-label={t.include}
                title={t.include}
                onChange={(e) => edit(d.id, { include: e.target.checked })}
                data-testid="decision-include"
              />
              <div className="decision-main">
                <div className="decision-line">
                  <select
                    className={`decision-status ${d.status}`}
                    aria-label={t.statusLabel}
                    value={d.status}
                    onChange={(e) => edit(d.id, { status: e.target.value as DecisionStatus })}
                    data-testid="decision-status"
                  >
                    {DECISION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t.status[status]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="decision-section"
                    aria-label={t.sectionLabel}
                    value={d.section || SECTION_UNKNOWN}
                    onChange={(e) => edit(d.id, { section: e.target.value })}
                    data-testid="decision-section"
                  >
                    <option value={SECTION_UNKNOWN}>{t.sectionUnknown}</option>
                    {sectionOptions(d.section).map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {d.manual ? <span className="hint">{t.edited}</span> : null}
                  <button type="button" className="link-btn decision-delete" onClick={() => edit(d.id, { removed: true, include: false })} data-testid="decision-delete">
                    {t.deleteRow}
                  </button>
                </div>
                <input
                  className="decision-text"
                  aria-label={t.textLabel}
                  placeholder={t.textPlaceholder}
                  value={d.text}
                  onChange={(e) => edit(d.id, { text: e.target.value }, false)}
                  onBlur={() => void persist(rowsRef.current)}
                  data-testid="decision-text"
                />
                <div className="decision-meta">
                  {d.by ? (
                    <span>
                      {t.byLabel}: {d.by}
                    </span>
                  ) : null}
                  {d.quote ? (
                    <span className="agenda-quote" data-testid="decision-quote">
                      «{d.quote}»{d.speaker ? <span className="agenda-quote-who"> {d.speaker === "me" ? tm.me : tm.other}</span> : null}
                    </span>
                  ) : null}
                  {typeof d.at === "number" ? (
                    <button type="button" className="link-btn segment-jump" title={t.jumpTitle} aria-label={t.jumpTitle} onClick={() => jumpTo(d.at!)}>
                      {clock(d.at)}
                    </button>
                  ) : null}
                </div>
                {d.ungrounded ? (
                  <p className="hint problem-text" data-testid="decision-ungrounded">
                    {t.ungrounded}
                  </p>
                ) : null}
                {simple ? (
                  <details className="decision-details">
                    <summary>{t.details}</summary>
                    {beforeAfter(d)}
                  </details>
                ) : (
                  beforeAfter(d)
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {meeting.artifact ? (
        <div className="agenda-edit-actions">
          <button type="button" onClick={add} data-testid="decision-add">
            {t.addRow}
          </button>
        </div>
      ) : null}
      {meeting.artifact ? <ArtifactUpdate meeting={{ ...meeting, decisions: rows }} uiLanguage={uiLanguage} onChange={onChange} exports={exports} /> : null}
    </section>
  );
}
