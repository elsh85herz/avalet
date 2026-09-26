import { useEffect, useRef, useState } from "react";
import { UI_STRINGS, type UiLanguage } from "../lib/i18n.js";

/** A live microphone level bar for the wizard's self-test; stops by itself after `seconds`. */
export function MicLevel({ uiLanguage, seconds, onDone }: { uiLanguage: UiLanguage; seconds: number; onDone?: () => void }) {
  const t = UI_STRINGS[uiLanguage].wizard;
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [failed, setFailed] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    let stopped = false;
    const started = Date.now();
    const finish = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      doneRef.current?.();
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (stopped) return;
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          const value = Math.min(1, rms * 8);
          setLevel(value);
          setPeak((p) => Math.max(p, value));
          const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
          setLeft(remaining);
          if (remaining === 0) finish();
          else frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setFailed(true);
        finish();
      }
    })();
    return finish;
  }, [seconds]);

  if (failed) return <p className="error">{t.micUnavailable}</p>;
  return (
    <div className="mic-level" data-testid="mic-level">
      <div className="mic-level-head">
        <span>{t.micLevel}</span>
        <span className="hint">{t.secondsLeft.replace("{n}", String(left))}</span>
      </div>
      <div className="progress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-label={t.micLevel}>
        <div className="progress-fill level" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {left === 0 && peak < 0.05 ? <p className="hint">{t.micLevelNone}</p> : null}
    </div>
  );
}
