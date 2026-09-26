import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge.js";
import type { MeetingMode, SessionState, TrackerState } from "../lib/types.js";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";
import { QUICK_ACTIONS } from "../live/quick-actions.js";
import { IconCamera, IconChevron, IconCopy, IconNotes, IconPause, IconPlay, IconStop } from "../icons.js";
import { compactTokens, useUsage } from "./UsageCounter.js";
import { formatPrice } from "./AccessCard.js";
import type { AccessState } from "../../../electron/shared/ipc-contract.js";

/** Simple level highlights this quick action; every quick action stays one click away in both levels. */
const PRIMARY_ACTION = "askQuestion";

const EMPTY_TRACKER: TrackerState = { meetingId: null, agendaStatus: [], actions: [], busy: false, enabled: false };

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
  const [copied, setCopied] = useState(false);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("ru");
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("free");
  const [audioDegraded, setAudioDegraded] = useState({ me: false, other: false });
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // "Peeking" lets the previous/next buttons pop the strip back open to read a saved block
  // without actually resuming the session — see handleOverlayCollapse.
  const [peeking, setPeeking] = useState(false);
  const [tracker, setTracker] = useState<TrackerState>(EMPTY_TRACKER);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerDraft, setTrackerDraft] = useState("");
  const [trackerDraftKind, setTrackerDraftKind] = useState<"question" | "action">("question");
  const [paywall, setPaywall] = useState<AccessState | null>(null);
  const [uiLevel, setUiLevel] = useState<"simple" | "advanced">("simple");
  const followLive = useRef(true);
  // Mirrors `blocks` text keyed by id so the done/error handlers below can
  // read the just-finished text synchronously (functional setState updaters
  // don't give us that) to persist it via bridge.history.append.
  const textById = useRef<Record<string, string>>({});

  const t = UI_STRINGS[uiLanguage];
  const advanced = uiLevel === "advanced";
  const usage = useUsage();
  const meetingTokens = usage?.meeting ? usage.meeting.inputTokens + usage.meeting.outputTokens : 0;

  useEffect(() => {
    void bridge.settings.getAll().then((all) => {
      setAutoDetectEnabled(all.autoDetectEnabled);
      setOpacity(all.overlayOpacity);
      document.documentElement.dataset.theme = all.theme;
      setUiLanguage(all.uiLanguage);
      setMeetingMode(all.meetingMode);
      setUiLevel(all.uiLevel);
      document.documentElement.dataset.platform = all.platform;
    });
    // The session may already be "listening" by the time this page finishes
    // loading (session-start's state broadcast can't reach a listener that
    // isn't attached yet) — fetch the real current state explicitly instead
    // of trusting the "idle" default, or the overlay can get stuck collapsed.
    void bridge.session.getState().then(setSessionState);
    void bridge.tracker.get().then(setTracker);

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
      }),
      bridge.events.onBlockDelta(({ id, delta }) => {
        textById.current[id] = (textById.current[id] ?? "") + delta;
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text: b.text + delta } : b)));
      }),
      bridge.events.onBlockDone(({ id }) => {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "done" } : b)));
        void bridge.history.append({ id, text: textById.current[id] ?? "", status: "done" });
      }),
      bridge.events.onPaywall(setPaywall),
      bridge.events.onUiLevelChanged(setUiLevel),
      bridge.events.onAccessChanged((access) => {
        if (access.canUseAvalet || access.mode === "own") setPaywall(null);
      }),
      bridge.events.onBlockError(({ id, message, code }) => {
        if (code === "paywall") {
          // Not an error the user caused: drop the empty block, the banner explains.
          delete textById.current[id];
          setBlocks((prev) => prev.filter((b) => b.id !== id));
          return;
        }
        const text = textById.current[id] || message;
        textById.current[id] = text;
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "error", text } : b)));
        void bridge.history.append({ id, text, status: "error" });
      }),
      bridge.events.onSessionState(setSessionState),
      bridge.events.onTrackerUpdate(setTracker),
      bridge.events.onAutoDetectChanged(setAutoDetectEnabled),
      bridge.events.onThemeChanged((theme) => {
        document.documentElement.dataset.theme = theme;
      }),
      bridge.events.onUiLanguageChanged(setUiLanguage),
      bridge.events.onOpacityChanged(setOpacity),
      bridge.events.onMeetingModeChanged(setMeetingMode),
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

  // Auto mode always shows the newest block; with auto off, paging back
  // sticks until the user pages forward to the end again.
  useEffect(() => {
    if (blocks.length === 0) return;
    if (autoDetectEnabled || followLive.current) {
      followLive.current = true;
      setPageIndex(blocks.length - 1);
    }
  }, [blocks.length, autoDetectEnabled]);

  const current = blocks[pageIndex];
  // Stopped and not peeking at history = collapsed to a thin strip (see
  // overlay-window.ts setOverlayCollapsed) so it stops covering whatever's
  // behind it while nothing is being generated.
  const collapsed = sessionState !== "listening" && !peeking;

  useEffect(() => {
    void bridge.overlay.setCollapsed(collapsed);
  }, [collapsed]);

  async function copyCurrent() {
    const text = current?.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be refused when the window is not focused: fall back to a hidden textarea.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

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

  // Same as "End meeting" in the main window: stop, close the record. The
  // main window hears meeting-ended and releases the microphone.
  async function endMeeting() {
    setPeeking(false);
    await bridge.session.stop();
    await bridge.session.reset();
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

  // Every control has a visible label or an accessible name plus a tooltip;
  // the same buttons are shown in Simple and Advanced (only tuning differs).
  const uiLangButton = (
    <button
      type="button"
      className="lang-btn"
      onClick={() => void toggleUiLanguage()}
      title={t.uiLangTitle}
      aria-label={t.overlay.languageName}
      data-testid="overlay-language"
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
      aria-label={t.overlay.autoName}
      aria-pressed={autoDetectEnabled}
      data-testid="overlay-auto"
    >
      {t.overlay.auto}
    </button>
  );

  const screenshotButton = (
    <button
      type="button"
      className="screenshot-btn"
      onClick={() => void askScreenOnly()}
      disabled={asking}
      title={t.screenshotTitle}
      aria-label={t.overlay.screenshotName}
      data-testid="overlay-screenshot"
    >
      <IconCamera />
    </button>
  );

  const notesButton = (
    <button
      type="button"
      className="notes-btn"
      onClick={() => void bridge.app.toggleMainWindow()}
      title={t.notesTitle}
      aria-label={t.overlay.notesName}
      data-testid="overlay-notes"
    >
      <IconNotes />
    </button>
  );

  const listening = sessionState === "listening";
  const sessionButton = (
    <button
      type="button"
      className={`session-btn ${listening ? "on" : "off"}`}
      onClick={() => void toggleStop()}
      title={listening ? t.overlay.pauseTitle : t.overlay.resumeTitle}
      data-testid="overlay-pause"
    >
      {listening ? <IconPause /> : <IconPlay />}
      <span>{listening ? t.overlay.pause : t.overlay.resume}</span>
    </button>
  );

  const endButton = (
    <button type="button" className="end-btn" onClick={() => void endMeeting()} title={t.overlay.endTitle} data-testid="overlay-end">
      <IconStop />
      <span>{t.overlay.end}</span>
    </button>
  );

  // Its own row, always in the same place directly under the top controls
  // row — in both the collapsed strip and the expanded view — so paging
  // never visually jumps around when the overlay expands/collapses or when
  // other rows (quick-actions, Process now) appear/disappear.
  const navRow = (
    <div className="overlay-navrow">
      <button type="button" className="nav-btn" onClick={goPrev} disabled={pageIndex <= 0} aria-label={t.prevBlock} title={t.prevBlock}>
        <IconChevron direction="left" />
      </button>
      <span className="page-counter">
        {blocks.length > 0 ? `${pageIndex + 1} / ${blocks.length}` : "0 / 0"}
      </span>
      <button type="button" className="nav-btn" onClick={goNext} disabled={pageIndex >= blocks.length - 1} aria-label={t.nextBlock} title={t.nextBlock}>
        <IconChevron />
      </button>
      <button
        type="button"
        className="nav-btn copy-btn"
        title={t.copyBlockTitle}
        aria-label={t.copyBlockTitle}
        onClick={() => void copyCurrent()}
        disabled={!current?.text}
      >
        {copied ? "✓" : <IconCopy />}
      </button>
      <span className="strip-spacer" />
      {meetingTokens > 0 ? (
        <span className="usage-chip" title={t.usage.overlayTitle}>
          {compactTokens(meetingTokens, uiLanguage)}
        </span>
      ) : null}
      {autoButton}
      {uiLangButton}
    </div>
  );

  const hasAudioIssue = audioDegraded.me || audioDegraded.other;

  const visibleActions = tracker.actions.filter((a) => a.state !== "dismissed");
  const proposedCount = visibleActions.filter((a) => a.state === "proposed").length;
  const closedCount = tracker.agendaStatus.filter((a) => a.closed).length;

  async function submitTrackerDraft() {
    const text = trackerDraft.trim();
    if (!text) return;
    setTrackerDraft("");
    setTracker(await (trackerDraftKind === "question" ? bridge.tracker.addAgenda(text) : bridge.tracker.addAction(text)));
  }

  const trackerPanel = (
    <div className="tracker">
      <button
        type="button"
        className="tracker-toggle"
        aria-expanded={trackerOpen}
        title={t.tracker.toggleTitle}
        onClick={() => setTrackerOpen((open) => !open)}
      >
        <span className={`chevron ${trackerOpen ? "open" : ""}`}>
          <IconChevron />
        </span>
        <span>{t.tracker.toggle}</span>
        {tracker.agendaStatus.length > 0 ? (
          <span className="tracker-count">
            {closedCount}/{tracker.agendaStatus.length}
          </span>
        ) : null}
        {visibleActions.length > 0 ? <span className="tracker-count">✓ {visibleActions.length}</span> : null}
        {proposedCount > 0 ? (
          <span className="tracker-count new">
            {proposedCount} {t.tracker.newCount}
          </span>
        ) : null}
        {tracker.busy ? <span className="tracker-busy">{t.tracker.updating}</span> : null}
      </button>
      {trackerOpen ? (
        <div className="tracker-body">
          <h4>{t.tracker.agenda}</h4>
          {tracker.agendaStatus.length === 0 ? (
            <p className="tracker-hint">{t.tracker.agendaEmpty}</p>
          ) : (
            <ul className="tracker-list">
              {tracker.agendaStatus.map((item, index) => (
                <li key={item.question} className={item.closed ? "closed" : item.active ? "active" : "open"}>
                  <button
                    type="button"
                    className="tracker-check"
                    title={t.tracker.markTitle}
                    aria-label={t.tracker.markTitle}
                    onClick={() => void bridge.tracker.toggleAgenda(index).then(setTracker)}
                  >
                    {item.closed ? "✓" : item.active ? "●" : ""}
                  </button>
                  <span className="tracker-text">
                    {item.question}
                    {item.active && !item.closed ? <span className="tracker-note">{item.note || t.tracker.discussing}</span> : null}
                    {item.closed && item.note ? <span className="tracker-note">{item.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h4>{t.tracker.actions}</h4>
          {visibleActions.length === 0 ? (
            <p className="tracker-hint">{t.tracker.actionsEmpty}</p>
          ) : (
            <ul className="tracker-list">
              {visibleActions.map((action, i) => (
                <li key={action.id ?? `${i}-${action.task}`} className={action.state === "proposed" ? "proposed" : "confirmed"}>
                  <span className="tracker-text">
                    {action.task}
                    <span className="tracker-note">
                      {action.owner || t.tracker.noOwner}
                      {action.due ? ` · ${action.due}` : ""}
                    </span>
                  </span>
                  {action.id ? (
                    <span className="tracker-action-buttons">
                      {action.state === "proposed" ? (
                        <button
                          type="button"
                          title={t.tracker.confirm}
                          aria-label={t.tracker.confirm}
                          onClick={() => void bridge.tracker.setAction(action.id!, "confirmed").then(setTracker)}
                        >
                          ✓
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title={t.tracker.dismiss}
                        aria-label={t.tracker.dismiss}
                        onClick={() => void bridge.tracker.setAction(action.id!, "dismissed").then(setTracker)}
                      >
                        ✕
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="tracker-add">
            <select
              value={trackerDraftKind}
              onChange={(e) => setTrackerDraftKind(e.target.value === "action" ? "action" : "question")}
            >
              <option value="question">{t.tracker.agenda}</option>
              <option value="action">{t.tracker.actions}</option>
            </select>
            <input
              type="text"
              value={trackerDraft}
              placeholder={trackerDraftKind === "question" ? t.tracker.addQuestionPlaceholder : t.tracker.addActionPlaceholder}
              onChange={(e) => setTrackerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitTrackerDraft();
              }}
            />
            <button type="button" onClick={() => void submitTrackerDraft()} disabled={!trackerDraft.trim()}>
              {t.tracker.add}
            </button>
          </div>
          {tracker.enabled ? (
            <button
              type="button"
              className="tracker-refresh"
              title={t.tracker.refreshTitle}
              disabled={tracker.busy}
              onClick={() => void bridge.tracker.refresh().then(setTracker)}
            >
              {t.tracker.refresh}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (collapsed) {
    return (
      <div className="overlay overlay-collapsed">
        <div className="overlay-strip">
          <span className={`dot ${sessionState}${hasAudioIssue ? " warn" : ""}`} />
          {sessionButton}
          {endButton}
          <span className="strip-spacer" />
          {screenshotButton}
          {notesButton}
        </div>
        {navRow}
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="overlay-header">
        <span className={`dot ${sessionState}${hasAudioIssue ? " warn" : ""}`} />
        {sessionButton}
        {endButton}
        <span className="strip-spacer" />
        {screenshotButton}
        {notesButton}
      </div>

      {navRow}

      <div className="overlay-controls">
        {meetingMode !== "free" ? <span className="mode-chip">{t.modes[meetingMode]}</span> : null}
        <label className="opacity-control" title={t.opacityTitle}>
          <span>{t.opacityLabel}</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => handleOpacityChange(Number(e.target.value))}
            data-testid="overlay-opacity"
          />
        </label>
      </div>

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

      {paywall ? (
        <div className="paywall-banner" role="alert" data-testid="paywall">
          <strong>{t.access.paywallTitle}</strong>
          <span>{t.access.paywallTranscript}</span>
          <div className="access-actions">
            <button type="button" className="primary" onClick={() => void bridge.billing.checkout("pro")}>
              {paywall.tier === "pro" ? t.access.buyMore : t.access.getPro.replace("{price}", formatPrice(paywall.price, uiLanguage))}
            </button>
            <button type="button" onClick={() => void bridge.app.showAccess()}>
              {t.access.useOwnKey}
            </button>
            <button type="button" className="link-btn" onClick={() => setPaywall(null)}>
              {t.access.dismiss}
            </button>
          </div>
        </div>
      ) : null}

      {transcriptionError ? (
        <div className="audio-warning">
          <span>
            {t.transcriptionErrorPrefix} {transcriptionError}
          </span>
        </div>
      ) : null}

      {tracker.enabled || tracker.agendaStatus.length > 0 || visibleActions.length > 0 ? trackerPanel : null}

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
          <button
            key={qa.key}
            type="button"
            className={qa.key === PRIMARY_ACTION && !advanced ? "primary" : ""}
            onClick={() => void ask(qa.prompt)}
            disabled={asking}
          >
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
