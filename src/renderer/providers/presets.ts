// Renderer-side mirror of electron/providers/types.ts's PROVIDER_PRESETS —
// display metadata only (labels, placeholders). The actual provider calls
// happen in the main process; keep ids in sync with that file.
export type ProviderPresetUi = {
  id: string;
  label: string;
  baseUrlPlaceholder?: string;
  modelPlaceholder: string;
  apiKeyRequired: boolean;
};

export const PROVIDER_PRESETS_UI: ProviderPresetUi[] = [
  // Built-in: no key, no base URL; access comes from the plan (AccessCard).
  { id: "avalet", label: "Avalet", modelPlaceholder: "avalet-fast", apiKeyRequired: false },
  { id: "anthropic", label: "Claude (Anthropic)", modelPlaceholder: "claude-sonnet-5", apiKeyRequired: true },
  { id: "openai", label: "ChatGPT (OpenAI)", baseUrlPlaceholder: "https://api.openai.com/v1", modelPlaceholder: "gpt-4.1", apiKeyRequired: true },
  { id: "deepseek", label: "DeepSeek", baseUrlPlaceholder: "https://api.deepseek.com", modelPlaceholder: "deepseek-flash", apiKeyRequired: true },
  { id: "custom", label: "Local / custom (OpenAI-compatible)", baseUrlPlaceholder: "http://localhost:11434/v1", modelPlaceholder: "llama3.1", apiKeyRequired: false },
];
