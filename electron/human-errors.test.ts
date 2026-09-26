import assert from "node:assert/strict";
import { test } from "node:test";
import { humanProviderError, noKeyMessage } from "./human-errors.js";
import { ProviderHttpError } from "./providers/errors.js";

const http = (status: number) => new ProviderHttpError(`https://api.test ${status}: body`, status, null);

test("key test failures become one sentence the user can act on, in both languages", () => {
  assert.match(humanProviderError(http(401), "en"), /did not accept this key/);
  assert.match(humanProviderError(http(403), "ru"), /не принял ключ/);
  assert.match(humanProviderError(http(404), "en"), /model name/);
  assert.match(humanProviderError(http(429), "ru"), /лимит запросов/);
  assert.match(humanProviderError(http(503), "en"), /on its side/);
  assert.match(humanProviderError(new TypeError("fetch failed"), "en"), /Could not reach the provider/);
  assert.match(humanProviderError(http(400), "en"), /^The test call failed: https:\/\/api\.test 400/);
  assert.match(noKeyMessage("ru"), /ещё нет ключа/);
});
