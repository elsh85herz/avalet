// How much one token of a model counts against an Avalet budget. The one place
// to change it. Flash-class models count x1, premium models x4. The server
// applies the same table when it meters proxy traffic (docs/dev/billing-api.md);
// the client uses it only to show a consistent local counter.
//
// Own-key usage is recorded with the same weights for display, but no budget
// applies to it.

export const WEIGHT_FLASH = 1;
export const WEIGHT_PREMIUM = 4;

/** Checked in order; the first pattern that matches the model id wins. */
export const MODEL_WEIGHTS: Array<{ pattern: RegExp; weight: number; note: string }> = [
  { pattern: /^avalet-premium/, weight: WEIGHT_PREMIUM, note: "Avalet premium tier" },
  { pattern: /^avalet-/, weight: WEIGHT_FLASH, note: "Avalet default tier" },
  { pattern: /haiku|mini|nano|flash|lite|small|8b|3b|1b/i, weight: WEIGHT_FLASH, note: "small / fast models" },
  { pattern: /opus|sonnet|gpt-4\.1|gpt-4o|gpt-5|o[134]|pro|large|70b|405b/i, weight: WEIGHT_PREMIUM, note: "large models" },
];

/** Unknown cloud models count as premium (never under-count); local servers are free to run anyway. */
export const DEFAULT_WEIGHT = WEIGHT_PREMIUM;

export function modelWeight(model: string): number {
  for (const entry of MODEL_WEIGHTS) if (entry.pattern.test(model)) return entry.weight;
  return DEFAULT_WEIGHT;
}

export function weightedTokens(inputTokens: number, outputTokens: number, model: string): number {
  return (inputTokens + outputTokens) * modelWeight(model);
}
