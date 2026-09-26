import type { GenerateRequest, TokenUsage } from "./types.js";

// Local token estimate, used ONLY when a provider response carries no usage
// (some local OpenAI-compatible servers). Always marked `estimated: true`.
// About 3 characters per token is a middle ground for mixed Russian/English
// text; an image is counted like a ~1000-token block (what the vision APIs
// charge for a downscaled screenshot).
const CHARS_PER_TOKEN = 3;
const IMAGE_TOKENS = 1_000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateUsage(request: GenerateRequest, output: string): TokenUsage {
  const input =
    estimateTokens(request.systemPrompt) + estimateTokens(request.transcript) + (request.screenshotBase64 ? IMAGE_TOKENS : 0);
  return { inputTokens: input, outputTokens: estimateTokens(output), estimated: true };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Anthropic `usage` object: cached input counts as input too (it is billed, at a different rate). */
export function anthropicInputTokens(usage: Record<string, unknown> | undefined): number {
  if (!usage) return 0;
  return num(usage.input_tokens) + num(usage.cache_creation_input_tokens) + num(usage.cache_read_input_tokens);
}

export function anthropicOutputTokens(usage: Record<string, unknown> | undefined): number {
  return usage ? num(usage.output_tokens) : 0;
}

/** OpenAI-style `usage` object ({prompt_tokens, completion_tokens}), or null when absent or empty. */
export function openAiUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  if (typeof u.prompt_tokens !== "number" && typeof u.completion_tokens !== "number") return null;
  return { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens), estimated: false };
}
