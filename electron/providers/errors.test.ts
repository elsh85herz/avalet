import assert from "node:assert/strict";
import { test } from "node:test";
import { isImageRejection } from "./errors.js";

test("detects a provider refusing image input", () => {
  const anthropic =
    "Anthropic 400: {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"messages.0.content.1: Input tag 'image' found using 'type' does not match any of the expected tags\"}}";
  const deepseek =
    "https://api.deepseek.com 400: {\"error\":{\"message\":\"unknown variant `image_url`, expected `text`\"}}";
  const local = "http://localhost:11434/v1 400: {\"error\":\"this model does not support image input\"}";
  assert.equal(isImageRejection(new Error(anthropic)), true);
  assert.equal(isImageRejection(new Error(deepseek)), true);
  assert.equal(isImageRejection(new Error(local)), true);
});

test("does not treat unrelated failures as an image problem", () => {
  assert.equal(isImageRejection(new Error("https://api.deepseek.com 401: Authentication Fails")), false);
  assert.equal(isImageRejection(new Error("https://api.openai.com/v1 429: rate limit reached")), false);
  assert.equal(isImageRejection(new Error("Anthropic 400: credit balance is too low")), false);
  assert.equal(isImageRejection(new Error("fetch failed")), false);
});
