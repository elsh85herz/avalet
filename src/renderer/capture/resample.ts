/**
 * Sample-rate conversion with a proper low-pass filter (windowed sinc). Plain
 * interpolation between neighbouring samples lets everything above the new
 * Nyquist frequency fold back into the speech band as distortion, which is
 * exactly what the recognizer then has to cope with when 48 kHz mic audio is
 * reduced to 16 kHz.
 */
const HALF_TAPS = 12;
const CUTOFF = 0.95;

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const cutoff = Math.min(1, toRate / fromRate) * CUTOFF;
  const halfWidth = HALF_TAPS / Math.min(1, toRate / fromRate);
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const center = i * ratio;
    const first = Math.max(0, Math.ceil(center - halfWidth));
    const last = Math.min(input.length - 1, Math.floor(center + halfWidth));
    let sum = 0;
    let weights = 0;
    for (let k = first; k <= last; k++) {
      const x = k - center;
      const t = x * cutoff;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const window = 0.5 * (1 + Math.cos((Math.PI * x) / halfWidth));
      const w = sinc * window;
      sum += input[k] * w;
      weights += w;
    }
    out[i] = weights !== 0 ? sum / weights : 0;
  }
  return out;
}
