import assert from "node:assert/strict";
import { test } from "node:test";
import { Segmenter, type Utterance } from "../src/renderer/capture/segmenter.js";

const RATE = 16_000;
const FRAME = 1_280; // 80 ms

function tone(frames: number, amplitude: number): Float32Array[] {
  return Array.from({ length: frames }, (_, f) => {
    const data = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i++) data[i] = amplitude * Math.sin((2 * Math.PI * 220 * (f * FRAME + i)) / RATE);
    return data;
  });
}
const silence = (frames: number, noise = 0) =>
  Array.from({ length: frames }, () => Float32Array.from({ length: FRAME }, () => (Math.random() - 0.5) * 2 * noise));

function run(parts: Float32Array[][], options = {}): Utterance[] {
  const out: Utterance[] = [];
  const segmenter = new Segmenter({ sampleRate: RATE, ...options }, (u) => out.push(u));
  let now = 1_000_000;
  for (const frame of parts.flat()) {
    now += 80;
    segmenter.push(frame, now);
  }
  segmenter.flush(now);
  return out;
}
const seconds = (u: Utterance) => u.samples.length / RATE;

test("one phrase between silences becomes one utterance ending on the pause", () => {
  const result = run([silence(25), tone(13, 0.1), silence(25)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].endedBySilence, true);
  assert.ok(seconds(result[0]) > 1.0 && seconds(result[0]) < 2.0, `length ${seconds(result[0])}`);
});

test("a long pause splits two phrases, a short breath does not", () => {
  const two = run([silence(10), tone(15, 0.1), silence(15), tone(15, 0.1), silence(15)]);
  assert.equal(two.length, 2);
  const one = run([silence(10), tone(15, 0.1), silence(4), tone(15, 0.1), silence(15)]);
  assert.equal(one.length, 1);
});

test("a click or blip is not an utterance", () => {
  assert.equal(run([silence(20), tone(1, 0.3), silence(20)]).length, 0);
});

test("continuous speech is cut at the length cap", () => {
  const result = run([silence(5), tone(250, 0.1), silence(15)]); // 20 s of speech
  assert.ok(result.length >= 2);
  for (const u of result) assert.ok(seconds(u) <= 12.5, `utterance of ${seconds(u)}s`);
  assert.equal(result[0].endedBySilence, false);
});

test("after a long stretch a short pause is enough to cut", () => {
  const result = run([silence(5), tone(100, 0.1), silence(4), tone(40, 0.1), silence(15)]);
  assert.ok(result.length >= 2);
  assert.equal(result[0].endedBySilence, true);
});

test("steady background noise is not speech, and does not hide real speech", () => {
  const noise = 0.01; // about -40 dBFS
  const result = run([silence(40, noise), tone(15, 0.15), silence(25, noise)]);
  assert.equal(result.length, 1);
  assert.ok(seconds(result[0]) < 2.5, `length ${seconds(result[0])}`);
});

test("flush emits speech that was still going when capture stopped", () => {
  const result = run([silence(10), tone(20, 0.1)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].endedBySilence, false);
});

test("timestamps bracket the utterance", () => {
  const [u] = run([silence(25), tone(13, 0.1), silence(25)]);
  const start = 1_000_000;
  assert.ok(u.startedAt >= start + 25 * 80 - 500 && u.startedAt <= start + 25 * 80 + 100);
  assert.ok(u.endedAt > u.startedAt);
  assert.ok(Math.abs(u.endedAt - u.startedAt - seconds(u) * 1000) < 80);
});
