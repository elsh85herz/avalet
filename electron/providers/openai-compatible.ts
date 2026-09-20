import type { GenerateRequest } from "./types.js";

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Streams a completion from any OpenAI Chat Completions-compatible endpoint
 * (OpenAI itself, DeepSeek, or a local server such as Ollama/LM Studio/vLLM
 * — they all speak this same wire format). Runs in the main process.
 */
export async function streamOpenAICompatible(request: GenerateRequest): Promise<string> {
  const baseUrl = (request.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const userContent: unknown = request.screenshotBase64
    ? [
        { type: "text", text: request.transcript },
        { type: "image_url", image_url: { url: `data:image/png;base64,${request.screenshotBase64}` } },
      ]
    : request.transcript;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (request.apiKey) headers.authorization = `Bearer ${request.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${baseUrl} ${response.status}: ${text}`);
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
      if (data === "[DONE]") continue;
      if (!data) continue;
      let chunk: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        assembled += delta;
        request.onDelta(delta);
      }
    }
  }

  return assembled;
}
