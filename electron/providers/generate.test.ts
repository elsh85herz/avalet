import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generate } from "./index.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Captures the JSON body of the request and answers with an empty stream.
function captureBody(): { body: () => Record<string, unknown> } {
  let sent = "";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent = String(init?.body ?? "");
    return new Response("data: [DONE]\n\n", { status: 200 });
  }) as typeof fetch;
  return { body: () => JSON.parse(sent) as Record<string, unknown> };
}

const base = { apiKey: "k", model: "m", systemPrompt: "s", transcript: "t", signal: new AbortController().signal, onDelta: () => {} };

test("DeepSeek requests turn reasoning off so the first word is not delayed", async () => {
  const sent = captureBody();
  await generate({ ...base, providerId: "deepseek", baseUrl: "https://api.deepseek.com" });
  assert.deepEqual(sent.body().thinking, { type: "disabled" });
  assert.equal(sent.body().stream, true);
  assert.deepEqual(sent.body().stream_options, { include_usage: true });
});

test("other OpenAI-compatible providers get no extra fields", async () => {
  const sent = captureBody();
  await generate({ ...base, providerId: "openai", baseUrl: "https://api.openai.com/v1" });
  assert.equal("thinking" in sent.body(), false);
});

test("a screenshot goes out as a JPEG data URL", async () => {
  const sent = captureBody();
  await generate({ ...base, providerId: "deepseek", baseUrl: "https://api.deepseek.com", screenshotBase64: "QUJD" });
  const messages = sent.body().messages as Array<{ content: unknown }>;
  const user = messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
  assert.equal(user[1].image_url?.url, "data:image/jpeg;base64,QUJD");
});
