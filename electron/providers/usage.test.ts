import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generate } from "./index.js";
import { ProviderHttpError, isBudgetExhausted } from "./errors.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function sse(events: unknown[]): string {
  return events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join("");
}

function answer(body: string, status = 200, sent: string[] = []): void {
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(String(init?.body ?? ""));
    return new Response(body, { status });
  }) as typeof fetch;
}

const base = { apiKey: "k", systemPrompt: "system", transcript: "hello", signal: new AbortController().signal };

test("Anthropic stream: input from message_start (cache included), output from message_delta", async () => {
  answer(
    sse([
      { type: "message_start", message: { usage: { input_tokens: 120, cache_read_input_tokens: 30, output_tokens: 1 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Привет" } },
      { type: "message_delta", usage: { output_tokens: 42 } },
      { type: "message_stop" },
    ]),
  );
  const deltas: string[] = [];
  const result = await generate({ ...base, providerId: "anthropic", model: "claude-sonnet-5", onDelta: (d) => deltas.push(d) });
  assert.equal(result.text, "Привет");
  assert.deepEqual(result.usage, { inputTokens: 150, outputTokens: 42, estimated: false });
  assert.deepEqual(deltas, ["Привет"]);
});

test("Anthropic non-streaming: usage from the JSON body, image request included", async () => {
  const sent: string[] = [];
  answer(JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1600, output_tokens: 3 } }), 200, sent);
  const result = await generate({
    ...base,
    providerId: "anthropic",
    model: "claude-haiku-4-5",
    stream: false,
    screenshotBase64: "QUJD",
    onDelta: () => {},
  });
  assert.equal(JSON.parse(sent[0]).stream, false);
  assert.deepEqual(result.usage, { inputTokens: 1600, outputTokens: 3, estimated: false });
});

test("OpenAI-compatible stream asks for usage and reads it from the last chunk", async () => {
  const sent: string[] = [];
  answer(
    sse([
      { choices: [{ delta: { content: "A" } }] },
      { choices: [{ delta: { content: "B" } }] },
      { choices: [], usage: { prompt_tokens: 900, completion_tokens: 12 } },
      "[DONE]",
    ]),
    200,
    sent,
  );
  const result = await generate({ ...base, providerId: "deepseek", model: "deepseek-flash", baseUrl: "https://api.deepseek.com", onDelta: () => {} });
  assert.deepEqual(JSON.parse(sent[0]).stream_options, { include_usage: true });
  assert.equal(result.text, "AB");
  assert.deepEqual(result.usage, { inputTokens: 900, outputTokens: 12, estimated: false });
});

test("OpenAI-compatible non-streaming with an image", async () => {
  const sent: string[] = [];
  answer(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1100, completion_tokens: 2 } }), 200, sent);
  const result = await generate({
    ...base,
    providerId: "openai",
    model: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    stream: false,
    screenshotBase64: "QUJD",
    onDelta: () => {},
  });
  const body = JSON.parse(sent[0]);
  assert.equal(body.stream, false);
  assert.equal("stream_options" in body, false);
  assert.deepEqual(result.usage, { inputTokens: 1100, outputTokens: 2, estimated: false });
});

test("no usage in the response: a local estimate, clearly marked", async () => {
  answer(sse([{ choices: [{ delta: { content: "twelve chars" } }] }, "[DONE]"]));
  const result = await generate({ ...base, providerId: "custom", model: "llama3.1", baseUrl: "http://localhost:11434/v1", onDelta: () => {} });
  assert.equal(result.usage.estimated, true);
  assert.equal(result.usage.outputTokens, 4);
  assert.ok(result.usage.inputTokens > 0);
});

test("a server that rejects stream_options is asked again without it", async () => {
  const sent: string[] = [];
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(String(init?.body ?? ""));
    calls += 1;
    if (calls === 1) return new Response('{"error":"unknown field stream_options"}', { status: 400 });
    return new Response(sse([{ choices: [{ delta: { content: "x" } }] }, "[DONE]"]), { status: 200 });
  }) as typeof fetch;
  const result = await generate({ ...base, providerId: "custom", model: "m", baseUrl: "http://localhost:1234/v1", onDelta: () => {} });
  assert.equal(calls, 2);
  assert.equal("stream_options" in JSON.parse(sent[1]), false);
  assert.equal(result.usage.estimated, true);
});

test("HTTP errors carry status and server code (budget exhausted)", async () => {
  answer(JSON.stringify({ error: { code: "budget_exhausted", message: "no tokens left" } }), 402);
  await assert.rejects(
    generate({ ...base, providerId: "openai", model: "m", baseUrl: "https://x.test/v1", onDelta: () => {} }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      assert.equal(error.status, 402);
      assert.equal(error.code, "budget_exhausted");
      assert.equal(isBudgetExhausted(error), true);
      assert.match(error.message, /^https:\/\/x\.test\/v1 402:/);
      return true;
    },
  );
});
