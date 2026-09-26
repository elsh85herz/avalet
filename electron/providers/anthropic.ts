import { ProviderHttpError, errorCodeFromBody } from "./errors.js";
import { anthropicInputTokens, anthropicOutputTokens, estimateUsage } from "./usage.js";
import type { GenerateRequest, GenerateResult } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

type Usage = Record<string, unknown> | undefined;

/**
 * Calls the Anthropic Messages API, streamed (live blocks, summary) or as one
 * response (background calls). Runs in the Electron main process (Node's
 * global fetch), never from the renderer. Token counts come from the
 * response's `usage` (message_start + message_delta when streaming).
 */
export async function streamAnthropic(request: GenerateRequest): Promise<GenerateResult> {
  const stream = request.stream !== false;
  const content: Array<Record<string, unknown>> = [{ type: "text", text: request.transcript }];
  if (request.screenshotBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: request.screenshotBase64 },
    });
  }

  const response = await fetch(request.baseUrl ? `${request.baseUrl.replace(/\/+$/, "")}/messages` : ANTHROPIC_API_URL, {
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
      stream,
      messages: [{ role: "user", content }],
    }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText);
    throw new ProviderHttpError(`Anthropic ${response.status}: ${text}`, response.status, errorCodeFromBody(text));
  }

  if (!stream) {
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: Usage };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (text) request.onDelta(text);
    return { text, usage: usageOrEstimate(request, text, data.usage, data.usage) };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let startUsage: Usage;
  let finalUsage: Usage;

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
        message?: { usage?: Usage };
        usage?: Usage;
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
      } else if (event.type === "message_start") {
        startUsage = event.message?.usage;
      } else if (event.type === "message_delta") {
        finalUsage = event.usage;
      } else if (event.type === "error") {
        throw new Error(`Anthropic stream error: ${event.error?.message ?? "unknown"}`);
      }
    }
  }

  return { text: assembled, usage: usageOrEstimate(request, assembled, startUsage, finalUsage ?? startUsage) };
}

function usageOrEstimate(request: GenerateRequest, text: string, input: Usage, output: Usage) {
  if (!input && !output) return estimateUsage(request, text);
  return { inputTokens: anthropicInputTokens(input), outputTokens: anthropicOutputTokens(output), estimated: false };
}
