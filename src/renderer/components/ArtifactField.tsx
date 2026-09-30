import { useEffect, useMemo, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { useAppSettings } from "../lib/settings.js";
import { useSession } from "../lib/session.js";
import { artifactFieldCost, formatTokens } from "../lib/artifact-cost.js";
import { ARTIFACT_CHAR_CAP } from "../../../electron/shared/artifact.js";

/**
 * Review mode: the document the call is about, from a file or pasted. Saved
 * in settings and copied onto the meeting at Start; read-only while a meeting
 * runs. Says what it will cost before anything is spent.
 */
export function ArtifactField({ uiLanguage }: { uiLanguage: UiLanguage }) {
  const bridge = getBridge();
  const session = useSession();
  const { settings, patch } = useAppSettings();
  const t = UI_STRINGS[uiLanguage].spec;
  const [name, setName] = useState(settings.artifactName);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const locked = session.state !== "idle";

  // The stored document, again after a meeting ends (it may have been set elsewhere);
  // never over text typed since the last save.
  useEffect(() => {
    if (!savedRef.current) return;
    void bridge.settings.getArtifact().then((doc) => {
      if (!savedRef.current) return;
      setText(doc.text);
      setName(doc.name);
    });
  }, [settings.artifactChars, settings.artifactName]);

  useEffect(() => {
    if (saved) return;
    const timer = setTimeout(() => void save(name, text), 500);
    return () => clearTimeout(timer);
  }, [text, name, saved]);

  async function save(nextName: string, nextText: string): Promise<boolean> {
    const result = await bridge.settings.setArtifact({ name: nextName, text: nextText });
    if (!result.ok) {
      setError(result.reason === "too-large" ? t.tooLarge.replace("{chars}", result.chars.toLocaleString(locale)) : t.locked);
      return false;
    }
    setError(null);
    setSaved(true);
    patch({ artifactName: nextText ? nextName : "", artifactChars: nextText.length });
    return true;
  }

  const locale = uiLanguage === "ru" ? "ru-RU" : "en-US";

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    if (fileRef.current) fileRef.current.value = "";
    if (content.length > ARTIFACT_CHAR_CAP) {
      setError(t.tooLarge.replace("{chars}", content.length.toLocaleString(locale)));
      return;
    }
    setEdited(true);
    if (await save(file.name, content)) {
      setName(file.name);
      setText(content);
    }
  }

  async function remove() {
    setEdited(true);
    if (await save("", "")) {
      setName("");
      setText("");
    }
  }

  const cost = useMemo(() => artifactFieldCost(settings.meetingMode, text), [settings.meetingMode, text]);
  const fmt = (n: number) => formatTokens(n, uiLanguage);

  return (
    <div className="field artifact-field" data-testid="artifact-field">
      <label htmlFor="meeting-artifact">
        {t.fieldLabel} <span className="optional">{t.fieldOptional}</span>
      </label>
      <p className="hint">{t.fieldHint}</p>
      <div className="agenda-edit-actions">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={locked} data-testid="artifact-load">
          {t.loadFile}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.markdown,text/plain,text/markdown"
          hidden
          data-testid="artifact-file"
          onChange={(e) => void loadFile(e.target.files?.[0])}
        />
        {text ? (
          <>
            <span className="hint" data-testid="artifact-size">
              {t.sizeLine.replace("{name}", name || t.pastedName).replace("{chars}", text.length.toLocaleString(locale))}
            </span>
            <button type="button" className="link-btn" onClick={() => void remove()} disabled={locked} data-testid="artifact-remove">
              {t.remove}
            </button>
          </>
        ) : null}
      </div>
      <textarea
        id="meeting-artifact"
        value={text}
        rows={text ? 6 : 3}
        readOnly={locked}
        placeholder={t.pastePlaceholder}
        data-testid="artifact-text"
        onChange={(e) => {
          const next = e.target.value;
          if (next.length > ARTIFACT_CHAR_CAP) {
            setError(t.tooLarge.replace("{chars}", next.length.toLocaleString(locale)));
            return;
          }
          if (!text && !name) setName(t.pastedName);
          setText(next);
          setSaved(false);
          setEdited(true);
        }}
      />
      {locked ? <p className="hint">{t.locked}</p> : null}
      {error ? (
        <p className="hint problem-text" role="alert" data-testid="artifact-error">
          {error}
        </p>
      ) : null}
      <p className="hint save-state" aria-live="polite">
        {edited && !error ? (saved ? t.saved : "…") : ""}
      </p>
      {cost ? (
        <div className={`cost-note${cost.high ? " high" : ""}`} data-testid="artifact-cost" role="note">
          <p>{t.costNote.replace("{tokens}", fmt(cost.tokensEach)).replace("{index}", fmt(cost.indexTokens))}</p>
          <p>{t.costSection.replace("{tokens}", fmt(cost.sectionTokens))}</p>
          {cost.high ? <p className="cost-high">{t.costHigh}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
