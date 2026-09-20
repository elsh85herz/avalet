import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { SessionState } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { QUICK_ACTIONS } from "../live/quick-actions.js";
import { IconCamera, IconPause, IconPlay } from "../icons.js";

type Block = {
  id: string;
  text: string;
  status: "streaming" | "done" | "error";
};

export function OverlayApp() {
  const bridge = getBridge();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [askDraft, setAskDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("ru");
  const [audioDegraded, setAudioDegraded] = useState({ me: false, other: false });
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // "Peeking" lets ◀/▶ pop the strip back open to read a saved block
  // without actually resuming the session — see handleOverlayCollapse.
  const [peeking, setPeeking] = useState(false);
  const followLive = useRef(true);
  // Mirrors `blocks` text keyed by id so the done/error handlers below can
  // read the just-finished text synchronously (functional setState updaters
  // don't give us that) to persist it via bridge.history.append.
  const textById = useRef<Record<string, string>>({});

  const t = UI_STRINGS[uiLanguage];

  useEffect(() => {
    void bridge.settings.getAll().then((all) => {
      setAutoDetectEnabled(all.autoDetectEnabled);
      setOpacity(all.overlayOpacity);
      document.documentElement.dataset.theme = all.theme;
      setUiLanguage(all.uiLanguage);
    });
    // The session may already be "listening" by the time this page finishes
    // loading (session-start's state broadcast can't reach a listener that
    // isn't attached yet) — fetch the real current state explicitly instead
    // of trusting the "idle" default, or the overlay can get stuck collapsed.
    void bridge.session.getState().then(setSessionState);

    void bridge.history.get().then((history) => {
      if (history.length === 0) return;
      setBlocks(history.map((h) => ({ id: h.id, text: h.text, status: h.status })));
      setPageIndex(history.length - 1);
      for (const h of history) textById.current[h.id] = h.text;
    });

    const unsubscribers = [
      bridge.events.onBlockStart(({ id }) => {
        textById.current[id] = "";
        setBlocks((prev) => [...prev, { id, text: "", status: "streaming" }]);
        if (followLive.current) setPageIndex((prev) => prev + 1);
      }),
      bridge.events.onBlockDelta(({ id, delta }) => {
        textById.current[id] = (textById.current[id] ?? "") + delta;
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text: b.text + delta } : b)));
      }),
      bridge.events.onBlockDone(({ id }) => {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "done" } : b)));
        void bridge.history.append({ id, text: textById.current[id] ?? "", status: "done" });
      }),
      bridge.events.onBlockError(({ id, message }) => {
        const text = textById.current[id] || message;
        textById.current[id] = text;
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "error", text } : b)));
        void bridge.history.append({ id, text, status: "error" });
      }),
      bridge.events.onSessionState(setSessionState),
      bridge.events.onAutoDetectChanged(setAutoDetectEnabled),
      bridge.events.onThemeChanged((theme) => {
        document.documentElement.dataset.theme = theme;
      }),
      bridge.events.onUiLanguageChanged(setUiLanguage),
      bridge.events.onAudioDegraded(setAudioDegraded),
      bridge.events.onTranscriptionError(setTranscriptionError),
      bridge.events.onTranscriptionRecovered(() => setTranscriptionError(null)),
      bridge.events.onHistoryCleared(() => {
        textById.current = {};
        setBlocks([]);
        setPageIndex(0);
      }),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const current = blocks[pageIndex];
  // Stopped and not peeking at history = collapsed to a thin strip (see
  // overlay-window.ts setOverlayCollapsed) so it stops covering whatever's
  // behind it while nothing is being generated.
  const collapsed = sessionState !== "listening" && !peeking;

  useEffect(() => {
    void bridge.overlay.setCollapsed(collapsed);
  }, [collapsed]);

  function goPrev() {
    followLive.current = false;
    setPeeking(true);
    setPageIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    const next = pageIndex + 1;
    followLive.current = next >= blocks.length - 1;
    setPeeking(true);
    setPageIndex((i) => Math.min(blocks.length - 1, i + 1));
  }

  async function toggleStop() {
    setPeeking(false);
    if (sessionState === "listening") await bridge.session.stop();
    else await bridge.session.start();
  }

  async function processNow() {
    if (asking) return;
    followLive.current = true;
    setAsking(true);
    try {
      await bridge.session.processNow();
    } finally {
      setAsking(false);
    }
  }

  // Works regardless of pause/auto-detect state — the analyst asked directly.
  async function ask(question: string) {
    if (!question.trim() || asking) return;
    followLive.current = true;
    setAsking(true);
    try {
      await bridge.session.ask(question);
    } finally {
      setAsking(false);
    }
  }

  async function handleAskSubmit() {
    const question = askDraft.trim();
    if (!question) return;
    setAskDraft("");
    await ask(question);
  }

  async function askScreenOnly() {
    if (asking) return;
    followLive.current = true;
    setAsking(true);
    try {
      await bridge.session.askScreen();
    } finally {
      setAsking(false);
    }
  }

  async function toggleAutoDetect() {
    const next = !autoDetectEnabled;
    setAutoDetectEnabled(next);
    await bridge.settings.setAutoDetect(next);
  }

  function handleOpacityChange(value: number) {
    setOpacity(value);
    void bridge.overlay.setOpacity(value);
  }

  async function reconnectAudio() {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      const channel = audioDegraded.me && audioDegraded.other ? "both" : audioDegraded.other ? "other" : "me";
      await bridge.capture.requestReconnect(channel);
    } finally {
      setReconnecting(false);
    }
  }

  async function toggleUiLanguage() {
    const next = uiLanguage === "ru" ? "en" : "ru";
    setUiLanguage(next);
    await bridge.settings.setUiLanguage(next);
  }

  const uiLangButton = (
    <button
      type="button"
      className="lang-btn"
      onClick={() => void toggleUiLanguage()}
      title={t.uiLangTitle}
    >
      {uiLanguage === "ru" ? "RU" : "EN"}
    </button>
  );

  const autoButton = (
    <button
      type="button"
      className={`auto-btn ${autoDetectEnabled ? "on" : "off"}`}
      onClick={() => void toggleAutoDetect()}
      title={autoDetectEnabled ? t.autoOnTitle : t.autoOffTitle}
    >
      Auto
    </button>
  );

  const screenshotButton = (
    <button
      type="button"
      className="screenshot-btn"
      onClick={() => void askScreenOnly()}
      disabled={asking}
      title={t.screenshotTitle}
    >
      <IconCamera />
    </button>
  );

  const sessionButton = (
    <button
      type="button"
      className={`session-btn ${sessionState === "listening" ? "on" : "off"}`}
      onClick={() => void toggleStop()}
      title={sessionState === "listening" ? t.sessionStopTitle : t.sessionResumeTitle}
    >
      {sessionState === "listening" ? <IconPause /> : <IconPlay />}
    </button>
  );

  // Its own row, always in the same place directly under the top controls
  // row — in both the collapsed strip and the expanded view — so paging
  // never visually jumps around when the overlay expands/collapses or when
  // other rows (quick-actions, Process now) appear/disappear.
  const navRow = (
    <div className="overlay-navrow">
      <button type="button" className="nav-btn" onClick={goPrev} disabled={pageIndex <= 0}>
        ◀
      </button>
      <span className="page-counter">
        {blocks.length > 0 ? `${pageIndex + 1} / ${blocks.length}` : "0 / 0"}
      </span>
      <button type="button" className="nav-btn" onClick={goNext} disabled={pageIndex >= blocks.length - 1}>
        ▶
      </button>
    </div>
  );

  const hasAudioIssue = audioDegraded.me || audioDegraded.other;

  if (collapsed) {
    return (
      <div className="overlay overlay-collapsed">
        <div className="overlay-strip">
          <span className={`dot ${sessionState}${hasAudioIssue ? " warn" : ""}`} />
          {autoButton}
          {uiLangButton}
          {screenshotButton}
          {sessionButton}
        </div>
        {navRow}
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="overlay-header">
        <span className={`dot ${sessionState}${hasAudioIssue ? " warn" : ""}`} />
        <span className="overlay-title">Avalet</span>
        {autoButton}
        {uiLangButton}
        {screenshotButton}
        {sessionButton}
      </div>

      {navRow}

      {hasAudioIssue ? (
        <div className="audio-warning">
          <span>
            {audioDegraded.me && audioDegraded.other
              ? t.audioDegradedBoth
              : audioDegraded.other
                ? t.audioDegradedOther
                : t.audioDegradedMe}
          </span>
          <button type="button" onClick={() => void reconnectAudio()} disabled={reconnecting} title={t.reconnectTitle}>
            {t.reconnectButton}
          </button>
        </div>
      ) : null}

      {transcriptionError ? (
        <div className="audio-warning">
          <span>
            {t.transcriptionErrorPrefix} {transcriptionError}
          </span>
        </div>
      ) : null}

      <div className="overlay-controls">
        <label className="opacity-control" title={t.opacityTitle}>
          <span>{t.opacityLabel}</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => handleOpacityChange(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="overlay-body-content">
        {current ? (
          <p className={`block-text ${current.status}`}>{current.text || "…"}</p>
        ) : (
          <p className="block-empty">{t.listeningEmpty}</p>
        )}
      </div>

      <div className="quick-actions">
        {!autoDetectEnabled ? (
          <button
            type="button"
            className="process-btn"
            onClick={() => void processNow()}
            disabled={asking}
            title={t.processNowTitle}
          >
            {t.processNowLabel}
          </button>
        ) : null}
        {QUICK_ACTIONS.map((qa) => (
          <button key={qa.key} type="button" onClick={() => void ask(qa.prompt)} disabled={asking}>
            {t.quickActions[qa.key]}
          </button>
        ))}
      </div>

      <div className="ask-row">
        <input
          type="text"
          value={askDraft}
          placeholder={t.askPlaceholder}
          onChange={(e) => setAskDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAskSubmit();
          }}
        />
        <button type="button" onClick={() => void handleAskSubmit()} disabled={asking || !askDraft.trim()}>
          {t.askButton}
        </button>
      </div>
    </div>
  );
}
