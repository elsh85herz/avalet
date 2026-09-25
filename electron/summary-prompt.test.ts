import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSummaryPrompt } from "./summary-prompt.js";
import { MODE_SUMMARY } from "./modes.js";

const spec = MODE_SUMMARY.review;

test("briefing is fenced and marked reference-only, never a source of decisions", () => {
  const prompt = buildSummaryPrompt(spec.headings, spec.guidance, "Вопрос 4: наблюдаемость", [], false);
  assert.match(prompt, /REFERENCE ONLY/);
  assert.match(prompt, /<briefing>\nВопрос 4: наблюдаемость\n<\/briefing>/);
  assert.match(prompt, /nobody said in the call/);
  assert.match(prompt, /не обсуждали/);
});

test("actions must not take owner or deadline from the briefing, gaps are explicit", () => {
  const prompt = buildSummaryPrompt(spec.headings, spec.guidance, "срок 1 марта", [], false);
  assert.match(prompt, /срок не назван/);
  assert.match(prompt, /Never fill owner or due from the briefing/);
});

test("no briefing block when the briefing is empty", () => {
  const prompt = buildSummaryPrompt(spec.headings, spec.guidance, "  ", [], false);
  assert.doesNotMatch(prompt, /<briefing>/);
});

test("review mode has its own headings", () => {
  assert.deepEqual(spec.headings.slice(1, 3), ["Замечания к документу", "Решения по открытым вопросам"]);
});
