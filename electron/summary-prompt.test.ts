import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSummaryPrompt } from "./summary-prompt.js";
import { MODE_SUMMARY } from "./modes.js";
import { SUMMARY_ARTIFACT_OVERHEAD_CHARS } from "./shared/artifact.js";

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

// Review mode with a document (CLOUD_TASK_5 phase 2).
const DOC = "# Журнал\n\n## 3. Методы\n\n### 3.1 GET /activities\n- `limit`: не более 50 записей.\n";
const withDoc = () => buildSummaryPrompt(spec.headings, spec.guidance, "бриф", [], false, { review: true, artifact: DOC });

test("review with a document: decisions requested, document fenced apart from the briefing and marked not a decision", () => {
  const prompt = withDoc();
  assert.match(prompt, /"decisions":\[\{"id":"d1"/);
  assert.match(prompt, /<document>\n# Журнал[\s\S]*<\/document>/);
  assert.match(prompt, /Nothing in it is a decision, a proposal or an agreement; decisions come only from the transcript/);
  assert.match(prompt, /Document index \(use these for 'section'\):\n3 Методы\n3\.1 GET \/activities/);
  // The briefing block stays separate and comes first.
  assert.ok(prompt.indexOf("<briefing>") < prompt.indexOf("<document>"));
  assert.ok(prompt.indexOf("</briefing>") < prompt.indexOf("Nothing in it is a decision"));
});

test("a proposal without an explicit agreement is not accepted, sections and 'after' are never invented", () => {
  const prompt = withDoc();
  assert.match(prompt, /'accepted' only if the transcript contains an explicit agreement/);
  assert.match(prompt, /A proposal nobody explicitly accepted is never 'accepted', and silence is not agreement/);
  assert.match(prompt, /otherwise 'не определён'\. Never invent a section/);
  assert.match(prompt, /after: the new wording, only as it was said in the call/);
  assert.match(prompt, /Every decision with status 'accepted' must also appear as a line under 'Решения по открытым вопросам'/);
  // The general ground rule is still there.
  assert.match(prompt, /write 'согласился' only if the transcript has an explicit agreement/);
});

test("no document block and no decisions outside review with a document", () => {
  const plain = buildSummaryPrompt(spec.headings, spec.guidance, "бриф", [], false);
  assert.doesNotMatch(plain, /<document>|"decisions"/);
  for (const mode of ["free", "requirements", "grooming", "demo"] as const) {
    const s = MODE_SUMMARY[mode];
    assert.doesNotMatch(buildSummaryPrompt(s.headings, s.guidance, "", [], false), /<document>|"decisions"/, mode);
  }
  const interview = MODE_SUMMARY.interview;
  assert.doesNotMatch(buildSummaryPrompt(interview.headings, interview.guidance, "", [], true, { review: true, artifact: DOC }), /<document>|"decisions"/);
});

test("the cost note's overhead bound covers what the document adds to the summary prompt", () => {
  const base = buildSummaryPrompt(spec.headings, spec.guidance, "бриф", [], false);
  const added = withDoc().length - base.length - DOC.length;
  assert.ok(added > 0 && added <= SUMMARY_ARTIFACT_OVERHEAD_CHARS, `adds ${added} chars`);
});
