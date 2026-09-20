import type { GenerateRequest } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Streams a completion from the Anthropic Messages API. Runs in the Electron
 * main process (Node's global fetch) — never from the renderer, since
 * Anthropic's API does not allow plain browser-origin CORS requests.
 */
export async function streamAnthropic(request: GenerateRequest): Promise<string> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: request.transcript }];
  if (request.screenshotBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: request.screenshotBase64 },
    });
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: request.systemPrompt,
      stream: true,
      messages: [{ role: "user", content }],
    }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Anthropic ${response.status}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trimEnd();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      let event: {
        type?: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const delta = event.delta.text ?? "";
        if (delta) {
          assembled += delta;
          request.onDelta(delta);
        }
      } else if (event.type === "error") {
        throw new Error(`Anthropic stream error: ${event.error?.message ?? "unknown"}`);
      }
    }
  }

  return assembled;
}
