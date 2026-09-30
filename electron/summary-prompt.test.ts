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

// CLOUD_TASK_6 phase 1: an unanswered question is a risk, never "discussed".
const reviewPrompt = (options: { review?: boolean; artifact?: string } = {}) =>
  buildSummaryPrompt(spec.headings, spec.guidance, "бриф", [], false, { mode: "review", ...options });

test("review: an unanswered, evasive or deferred question goes to 'Новые вопросы и риски' with who asked, the count and a quote", () => {
  const prompt = reviewPrompt();
  assert.match(prompt, /got no answer, got an evasive answer/);
  assert.match(prompt, /deferred to someone else \('я спрошу у \.\.\.'/);
  assert.match(prompt, /never soften it into 'обсудили'/);
  assert.match(prompt, /'Вопрос без ответа: <the question in plain words> - задал <who asked> - <передан <кому>, as said \| без ответа>'/);
  assert.match(prompt, /'\(задан N раз\)' when it was asked more than once/);
  assert.match(prompt, /including a question asked only once/);
  assert.match(prompt, /one line with the count, not several lines/);
  // The rule stands with and without a document.
  assert.match(reviewPrompt({ review: true, artifact: DOC }), /Вопрос без ответа/);
});

test("review: '- нет' under the risks heading only when nothing is left open", () => {
  const prompt = reviewPrompt();
  assert.match(prompt, /Write '- нет' under 'Новые вопросы и риски' only when no question was left without an answer/);
  assert.match(prompt, /while any question is open, '- нет' is wrong/);
  assert.match(spec.guidance, /every question asked and left without an answer/);
  assert.match(spec.guidance, /нужна проверка \/ без ответа/);
});

test("review with a document: an unanswered question is also an open decision with its repeat count", () => {
  const prompt = reviewPrompt({ review: true, artifact: DOC });
  assert.match(prompt, /'open' for a question left without an answer, answered evasively or deferred to someone else/);
  assert.match(prompt, /Every question listed as 'Вопрос без ответа' in the text is also an entry here with status 'open'/);
  assert.match(prompt, /asked: how many times it was asked in the call, when more than once/);
});

test("other modes with 'Открытые вопросы' get the same rule in one sentence; interview gets none; headings unchanged", () => {
  for (const mode of ["free", "requirements", "grooming", "demo"] as const) {
    const s = MODE_SUMMARY[mode];
    assert.ok(s.headings.includes("Открытые вопросы"), mode);
    const prompt = buildSummaryPrompt(s.headings, s.guidance, "", [], false, { mode });
    assert.match(prompt, /Under 'Открытые вопросы' also list every question asked in the call that got no answer/, mode);
    assert.doesNotMatch(prompt, /Вопрос без ответа/, mode);
  }
  const interview = MODE_SUMMARY.interview;
  const prompt = buildSummaryPrompt(interview.headings, interview.guidance, "", [], true, { mode: "interview" });
  assert.doesNotMatch(prompt, /without an answer|без ответа/);
  assert.deepEqual(MODE_SUMMARY.free.headings, ["Обсуждения", "Решения", "Открытые вопросы", "Риски"]);
  assert.deepEqual(spec.headings, ["Обсуждения", "Замечания к документу", "Решения по открытым вопросам", "Поручения и сроки", "Новые вопросы и риски"]);
});

test("review: structure decisions pin their terms in the speakers' words or say 'не уточнено'; the model never picks a reading", () => {
  const prompt = reviewPrompt({ review: true, artifact: DOC });
  assert.match(prompt, /what the key is \(a field name, a field value, an id\), what the value is, one entry per what/);
  assert.match(prompt, /if the speakers gave an example in the call, repeat that example/);
  assert.match(prompt, /'не уточнено: <which term>, <reading one> или <reading two>'/);
  assert.match(prompt, /also listed as a 'Вопрос без ответа'/);
  assert.match(prompt, /Never choose an interpretation yourself/);
  assert.match(prompt, /"terms":"\.\.\."/);
  assert.match(prompt, /terms: for a decision that defines or changes a data or interface structure/);
  // The text rule holds without a document too; the JSON field only with one.
  const plain = reviewPrompt();
  assert.match(plain, /Never choose an interpretation yourself/);
  assert.doesNotMatch(plain, /"terms"/);
});

test("review: a contradiction with the briefing is listed with both sides; names only from the call; participants in the tail", () => {
  const prompt = reviewPrompt();
  assert.match(prompt, /'Расхождение с контекстом: в контексте <X>, на встрече <Y> - «цитата» \(мм:сс\)'/);
  assert.match(prompt, /Do not silently follow either side/);
  assert.match(prompt, /Never write a person's name that was not said in the call, and never take a name or a role from the briefing/);
  assert.match(prompt, /"participants":\[\{"who":"","role":"\.\.\.","kind":"inferred"\}\]/);
  assert.match(prompt, /kind 'third_party' for a person or role mentioned as someone to contact or ask/);
  assert.match(prompt, /An empty list is the correct answer when the call shows nothing/);
  // With a document: one JSON object with decisions and participants.
  assert.match(reviewPrompt({ review: true, artifact: DOC }), /"decisions":\[\{[^\n]*\}\],"participants":\[/);
  // Other modes: no participants, no contradiction block.
  const free = MODE_SUMMARY.free;
  assert.doesNotMatch(buildSummaryPrompt(free.headings, free.guidance, "бриф", [], false, { mode: "free" }), /participants|Расхождение/);
});

test("the review cost note's bound covers what the review rules add to the summary prompt", async () => {
  const { SUMMARY_REVIEW_RULES_CHARS } = await import("./shared/artifact.js");
  const plain = buildSummaryPrompt(spec.headings, spec.guidance, "бриф", [], false);
  const added = reviewPrompt().length - plain.length;
  assert.ok(added > 0 && added <= SUMMARY_REVIEW_RULES_CHARS, `adds ${added} chars`);
  // With a document, the rules and the document block together stay within both bounds.
  const both = reviewPrompt({ review: true, artifact: DOC }).length - plain.length - DOC.length;
  assert.ok(both <= SUMMARY_REVIEW_RULES_CHARS + SUMMARY_ARTIFACT_OVERHEAD_CHARS, `adds ${both} chars`);
});
