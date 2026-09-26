import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getBridge } from "./bridge.js";
import type { SessionState, SpeechModelName } from "./types.js";
import { startAudioCapture, type AudioCaptureHandle } from "../capture/audio-capture.js";

/**
 * What stopped the last Start, so the screen can say it in one sentence with
 * one button: the speech model is missing, the microphone is blocked, or
 * something else (message kept for Advanced).
 */
export type StartProblem =
  | { kind: "model-missing"; model: SpeechModelName }
  | { kind: "mic-blocked"; message: string }
  | { kind: "other"; message: string };

type SessionApi = {
  state: SessionState;
  problem: StartProblem | null;
  clearProblem: () => void;
  audioDegraded: { me: boolean; other: boolean };
  transcriptionError: string | null;
  /** Capture is running (mic streams held by this window). */
  capturing: boolean;
  start: () => Promise<boolean>;
  pause: () => Promise<void>;
  /** Stops capture and closes the meeting record. */
  end: () => Promise<void>;
  reconnect: (channel: "me" | "other" | "both") => Promise<void>;
};

const SessionContext = createContext<SessionApi | null>(null);

/**
 * Owns the audio capture for the main window, whichever level is shown.
 * Start and Resume share one path: permissions are only asked once, a paused
 * session just unpauses.
 */
export function SessionProvider({ children, fakeCapture }: { children: ReactNode; fakeCapture: boolean }) {
  const bridge = getBridge();
  const [state, setState] = useState<SessionState>("idle");
  const [problem, setProblem] = useState<StartProblem | null>(null);
  const [audioDegraded, setAudioDegraded] = useState({ me: false, other: false });
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Mirrored in a ref for the reconnect listener, which subscribes once.
  const handleRef = useRef<AudioCaptureHandle | null>(null);
  // A second click while the first Start is still asking for permissions must not open a second capture.
  const startingRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    void bridge.session.getState().then(setState);
    const unsubscribers = [
      bridge.events.onSessionState(setState),
      bridge.events.onReconnectAudioRequested((channel) => void handleRef.current?.reconnect(channel)),
      bridge.events.onTranscriptionError(setTranscriptionError),
      bridge.events.onTranscriptionRecovered(() => setTranscriptionError(null)),
    ];
    return () => unsubscribers.forEach((u) => u());
  }, []);

  function start(): Promise<boolean> {
    if (!startingRef.current) {
      startingRef.current = startOnce().finally(() => {
        startingRef.current = null;
      });
    }
    return startingRef.current;
  }

  async function startOnce(): Promise<boolean> {
    setProblem(null);
    try {
      if (!handleRef.current && !fakeCapture) {
        handleRef.current = await startAudioCapture({
          onDegradedChange: (next) => {
            setAudioDegraded(next);
            void bridge.capture.reportAudioDegraded(next);
          },
        });
        setCapturing(true);
      }
      const result = await bridge.session.start();
      if (!result.ok) {
        setProblem({ kind: "model-missing", model: result.model });
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const micBlocked = /Permission|NotAllowed|denied/i.test(message);
      setProblem(micBlocked ? { kind: "mic-blocked", message } : { kind: "other", message });
      return false;
    }
  }

  async function pause(): Promise<void> {
    await bridge.session.stop();
  }

  async function end(): Promise<void> {
    handleRef.current?.stop();
    handleRef.current = null;
    setCapturing(false);
    setAudioDegraded({ me: false, other: false });
    setTranscriptionError(null);
    await bridge.session.stop();
    await bridge.session.reset();
  }

  async function reconnect(channel: "me" | "other" | "both"): Promise<void> {
    await handleRef.current?.reconnect(channel);
  }

  const api: SessionApi = {
    state,
    problem,
    clearProblem: () => setProblem(null),
    audioDegraded,
    transcriptionError,
    capturing,
    start,
    pause,
    end,
    reconnect,
  };
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const api = useContext(SessionContext);
  if (!api) throw new Error("useSession outside SessionProvider");
  return api;
}
