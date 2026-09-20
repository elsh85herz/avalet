/**
 * Provider-agnostic contract for "generate a live suggestion block from the
 * rolling meeting transcript (+ optional screenshot)". Every adapter streams
 * plain text deltas back through `onDelta`; the caller (live-orchestrator.ts)
 * doesn't care which vendor produced them.
 */

export type ProviderKind = "anthropic" | "openai-compatible";

export type ProviderPreset = {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Only used by "openai-compatible" — the URL up to (not including) "/chat/completions". */
  defaultBaseUrl?: string;
  defaultModel: string;
  /** Whether this preset's default model accepts image content (screenshots). */
  supportsVision: boolean;
};

// Presets cover the three cloud providers asked for; "custom" lets anyone
// point at a local OpenAI-compatible server (Ollama, LM Studio, vLLM, ...)
// without new code — just a base URL.
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    kind: "anthropic",
    defaultModel: "claude-sonnet-5",
    supportsVision: true,
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    supportsVision: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
    // "deepseek-chat" was retired by DeepSeek on 2026-07-24; "deepseek-flash" is the current default.
    defaultModel: "deepseek-flash",
    supportsVision: false,
  },
  {
    id: "custom",
    label: "Local / custom (OpenAI-compatible)",
    kind: "openai-compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    supportsVision: false,
  },
];

export type GenerateRequest = {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  transcript: string;
  /** Raw PNG bytes, base64-encoded, no data: prefix. */
  screenshotBase64?: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
};

export type ProviderAdapter = (request: GenerateRequest) => Promise<string>;
