import { ProviderHttpError, errorCodeFromBody } from "./errors.js";
import { estimateUsage, openAiUsage } from "./usage.js";
import type { GenerateRequest, GenerateResult, TokenUsage } from "./types.js";

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Calls any OpenAI Chat Completions-compatible endpoint (OpenAI itself,
 * DeepSeek, the Avalet proxy, or a local server such as Ollama/LM Studio/vLLM,
 * which all speak this same wire format). Runs in the main process.
 * Streams ask for `stream_options.include_usage`, so the last chunk carries
 * the real token counts; a server that rejects that option is asked again
 * without it, and its usage is then estimated (marked as such).
 */
export async function streamOpenAICompatible(request: GenerateRequest): Promise<GenerateResult> {
  try {
    return await callOnce(request, true);
  } catch (error) {
    if (request.stream !== false && error instanceof ProviderHttpError && error.status === 400 && /stream_options/i.test(error.message)) {
      return callOnce(request, false);
    }
    throw error;
  }
}

async function callOnce(request: GenerateRequest, askForUsage: boolean): Promise<GenerateResult> {
  const stream = request.stream !== false;
  const baseUrl = (request.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const userContent: unknown = request.screenshotBase64
    ? [
        { type: "text", text: request.transcript },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${request.screenshotBase64}` } },
      ]
    : request.transcript;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (request.apiKey) headers.authorization = `Bearer ${request.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...request.extraBody,
      model: request.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream,
      ...(stream && askForUsage ? { stream_options: { include_usage: true } } : {}),
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText);
    throw new ProviderHttpError(`${baseUrl} ${response.status}: ${text}`, response.status, errorCodeFromBody(text));
  }

  if (!stream) {
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: unknown };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    if (text) request.onDelta(text);
    return { text, usage: openAiUsage(data.usage) ?? estimateUsage(request, text) };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let usage: TokenUsage | null = null;

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
      if (data === "[DONE]") continue;
      if (!data) continue;
      let chunk: { choices?: Array<{ delta?: { content?: string } }>; usage?: unknown };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      usage = openAiUsage(chunk.usage) ?? usage;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        assembled += delta;
        request.onDelta(delta);
      }
    }
  }

  return { text: assembled, usage: usage ?? estimateUsage(request, assembled) };
}
