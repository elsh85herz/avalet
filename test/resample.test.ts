import assert from "node:assert/strict";
import { test } from "node:test";
import { resample } from "../src/renderer/capture/resample.js";

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}
function rms(samples: Float32Array, skip = 400): number {
  let sum = 0;
  for (let i = skip; i < samples.length - skip; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length - 2 * skip));
}
const expected = Math.SQRT1_2;

test("keeps a speech-band tone at full level", () => {
  const out = resample(sine(1_000, 48_000, 1), 48_000, 16_000);
  assert.equal(out.length, 16_000);
  assert.ok(Math.abs(rms(out) - expected) < 0.03, `rms ${rms(out)}`);
});

test("removes a tone above the new Nyquist instead of folding it into the speech band", () => {
  // 10 kHz at 48 kHz would alias to 6 kHz at 16 kHz without a low-pass filter.
  const out = resample(sine(10_000, 48_000, 1), 48_000, 16_000);
  assert.ok(rms(out) < 0.05, `aliased energy ${rms(out)}`);
});

test("handles a non-integer ratio (44.1 kHz)", () => {
  const out = resample(sine(1_000, 44_100, 1), 44_100, 16_000);
  assert.equal(out.length, Math.floor(44_100 / (44_100 / 16_000)));
  assert.ok(Math.abs(rms(out) - expected) < 0.03);
});

test("same rate returns the input untouched", () => {
  const input = sine(500, 16_000, 0.1);
  assert.equal(resample(input, 16_000, 16_000), input);
});
