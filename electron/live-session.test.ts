import assert from "node:assert/strict";
import { test } from "node:test";
import { LIVE_BRIEFING_CHAR_CAP, buildSystemPrompt, capBriefing } from "./live-session.js";
import { setSessionContext } from "./settings-store.js";
import { setupStores } from "./testing/stores.js";

test("live calls carry at most 3,500 characters of the briefing", () => {
  assert.equal(LIVE_BRIEFING_CHAR_CAP, 3_500);
  const long = "Требование. ".repeat(1_000);
  const capped = capBriefing(long);
  assert.ok(capped.startsWith("Требование."));
  assert.ok(capped.length < 3_500 + 200);
  assert.match(capped, /shortened/);
  assert.equal(capBriefing("  short  "), "short");
});

test("the system prompt uses the capped briefing; the stored briefing stays whole", () => {
  setupStores({});
  const long = `START ${"x".repeat(10_000)} END`;
  setSessionContext(long);
  const prompt = buildSystemPrompt();
  assert.match(prompt, /START/);
  assert.doesNotMatch(prompt, /END/);
});
