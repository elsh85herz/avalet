/**
 * Cuts a continuous audio stream into whole utterances at the speaker's
 * pauses, instead of fixed-length pieces that slice words in half. Speech is
 * told from silence by frame loudness against an adaptive noise floor, so a
 * fan or room hum does not count as speaking, and a short stretch before the
 * first loud frame is kept so the beginning of a word is not clipped.
 */

export type Utterance = {
  samples: Float32Array;
  /** Wall-clock ms when the utterance started and ended. */
  startedAt: number;
  endedAt: number;
  /** True when the speaker paused; false when it was cut for length or by a flush. */
  endedBySilence: boolean;
};

export type SegmenterOptions = {
  sampleRate: number;
  /** Trailing silence that ends an utterance. */
  silenceMs?: number;
  /** Once an utterance is this long, a shorter pause is enough to end it. */
  softLimitMs?: number;
  softSilenceMs?: number;
  /** Hard length cap (whisper works best on a few seconds to about ten). */
  maxMs?: number;
  /** Utterances with less speech than this are treated as noise. */
  minSpeechMs?: number;
  preRollMs?: number;
  /** How much of the trailing silence stays in the emitted audio. */
  tailMs?: number;
};

const ABSOLUTE_MIN_DB = -52;
const SPEECH_ABOVE_FLOOR_DB = 12;
const FLOOR_RISE = 0.02;
const FLOOR_FALL = 0.2;
const START_FRAMES = 2;

function levelDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return 20 * Math.log10(Math.sqrt(sum / Math.max(1, frame.length)) + 1e-9);
}

type Frame = { data: Float32Array; ms: number };

export class Segmenter {
  private readonly opts: Required<Omit<SegmenterOptions, "sampleRate">> & { sampleRate: number };
  private ring: Frame[] = [];
  private ringMs = 0;
  private frames: Frame[] = [];
  private speaking = false;
  private aboveRun = 0;
  private floor: number | null = null;
  private totalMs = 0;
  private speechMs = 0;
  private silenceRunMs = 0;

  constructor(
    options: SegmenterOptions,
    private readonly onUtterance: (utterance: Utterance) => void,
  ) {
    this.opts = {
      silenceMs: 600,
      softLimitMs: 7_000,
      softSilenceMs: 250,
      maxMs: 12_000,
      minSpeechMs: 350,
      preRollMs: 300,
      tailMs: 250,
      ...options,
    };
  }

  /** Feeds one frame; `now` is the wall-clock time at the END of the frame. */
  push(data: Float32Array, now: number): void {
    const ms = (data.length / this.opts.sampleRate) * 1000;
    const frame: Frame = { data, ms };
    const db = levelDb(data);
    if (this.floor === null) this.floor = db;
    const loud = db > Math.max(ABSOLUTE_MIN_DB, this.floor + SPEECH_ABOVE_FLOOR_DB);

    if (!this.speaking) {
      this.pushRing(frame);
      if (loud) {
        this.aboveRun++;
        if (this.aboveRun >= START_FRAMES) this.begin(now);
      } else {
        this.aboveRun = 0;
        this.floor += (db - this.floor) * (db < this.floor ? FLOOR_FALL : FLOOR_RISE);
      }
      return;
    }

    this.frames.push(frame);
    this.totalMs += ms;
    if (loud) {
      this.speechMs += ms;
      this.silenceRunMs = 0;
    } else {
      this.silenceRunMs += ms;
    }
    const needed = this.totalMs >= this.opts.softLimitMs ? this.opts.softSilenceMs : this.opts.silenceMs;
    if (this.silenceRunMs >= needed) this.finish(now, true);
    else if (this.totalMs >= this.opts.maxMs) this.finish(now, false);
  }

  /** Emits speech still pending (capture stopped or paused). */
  flush(now: number): void {
    if (this.speaking) this.finish(now, false);
  }

  private pushRing(frame: Frame): void {
    this.ring.push(frame);
    this.ringMs += frame.ms;
    while (this.ring.length > 1 && this.ringMs - this.ring[0].ms >= this.opts.preRollMs + frame.ms * START_FRAMES) {
      this.ringMs -= this.ring[0].ms;
      this.ring.shift();
    }
  }

  private begin(now: number): void {
    this.speaking = true;
    this.frames = this.ring;
    this.totalMs = this.ringMs;
    this.ring = [];
    this.ringMs = 0;
    this.speechMs = this.frames.slice(-START_FRAMES).reduce((sum, f) => sum + f.ms, 0);
    this.silenceRunMs = 0;
    this.aboveRun = 0;
    void now;
  }

  private finish(now: number, bySilence: boolean): void {
    let frames = this.frames;
    let total = this.totalMs;
    // Drop trailing silence beyond a short tail.
    while (frames.length > 1 && this.silenceRunMs > this.opts.tailMs && frames[frames.length - 1].ms <= this.silenceRunMs - this.opts.tailMs) {
      const last = frames[frames.length - 1];
      frames = frames.slice(0, -1);
      total -= last.ms;
      this.silenceRunMs -= last.ms;
    }
    const enough = this.speechMs >= this.opts.minSpeechMs;
    const droppedTail = this.totalMs - total;
    this.speaking = false;
    this.frames = [];
    this.totalMs = 0;
    this.speechMs = 0;
    this.silenceRunMs = 0;
    if (!enough) return;

    const length = frames.reduce((sum, f) => sum + f.data.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const f of frames) {
      samples.set(f.data, offset);
      offset += f.data.length;
    }
    const endedAt = now - droppedTail;
    this.onUtterance({ samples, startedAt: endedAt - total, endedAt, endedBySilence: bySilence });
  }
}
