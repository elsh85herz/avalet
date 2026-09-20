import { PROVIDER_PRESETS, type GenerateRequest } from "./types.js";
import { streamAnthropic } from "./anthropic.js";
import { streamOpenAICompatible } from "./openai-compatible.js";

export { PROVIDER_PRESETS };
export type { ProviderPreset, GenerateRequest } from "./types.js";

export async function generate(request: GenerateRequest): Promise<string> {
  const preset = PROVIDER_PRESETS.find((p) => p.id === request.providerId);
  const kind = preset?.kind ?? "openai-compatible";
  if (kind === "anthropic") return streamAnthropic(request);
  return streamOpenAICompatible(preset?.requestExtras ? { ...request, extraBody: preset.requestExtras } : request);
}
