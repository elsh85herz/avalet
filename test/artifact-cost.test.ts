import assert from "node:assert/strict";
import { test } from "node:test";
import { artifactFieldCost, summaryExtraCost, updateCost } from "../src/renderer/lib/artifact-cost.js";
import { MEETING_MODES } from "../electron/shared/ipc-contract.js";

// Warnings before a spend appear only when a review document is loaded (CLOUD_TASK_5).

const DOC = "# Спецификация\n\n## 1. Раздел\nТекст раздела.\n".repeat(200);

test("the document field shows a cost only in review mode with a document", () => {
  for (const mode of MEETING_MODES) {
    const cost = artifactFieldCost(mode, DOC);
    if (mode === "review") assert.ok(cost && cost.tokensEach > 0 && cost.indexTokens > 0);
    else assert.equal(cost, null, mode);
  }
  assert.equal(artifactFieldCost("review", ""), null);
  assert.equal(artifactFieldCost("review", "   \n"), null);
});

test("the figure grows with the document and a large one is highlighted", () => {
  const small = artifactFieldCost("review", "x".repeat(3_000))!;
  const large = artifactFieldCost("review", "x".repeat(90_000))!;
  assert.ok(large.tokensEach > small.tokensEach * 10);
  assert.equal(small.high, false);
  assert.equal(large.high, true);
  // 90,000 characters at 3 per token, plus the prompt around it and the decisions in the answer: about 32,000.
  assert.equal(large.tokensEach, 32_000);
});

test("the summary note appears only for a review meeting with a document", () => {
  for (const mode of MEETING_MODES) {
    const cost = summaryExtraCost({ mode, artifact: { text: DOC } });
    if (mode === "review") assert.ok(cost && cost.tokens > 0);
    else assert.equal(cost, null, mode);
  }
  assert.equal(summaryExtraCost({ mode: "review" }), null);
  assert.equal(summaryExtraCost({ mode: "review", artifact: { text: "" } }), null);
});

test("the update cost appears only for a review meeting with a document and at least one checked decision", () => {
  const decision = { id: "a", text: "В разделе 3.1 поднять лимит", status: "accepted" as const, by: "", section: "3.1", before: "не более 50", after: "не более 100", include: true };
  for (const mode of MEETING_MODES) {
    const cost = updateCost({ mode, artifact: { text: DOC }, decisions: [decision] });
    if (mode === "review") assert.ok(cost && cost.total >= cost.doc && cost.count === 1);
    else assert.equal(cost, null, mode);
  }
  assert.equal(updateCost({ mode: "review", decisions: [decision] }), null);
  assert.equal(updateCost({ mode: "review", artifact: { text: DOC }, decisions: [{ ...decision, include: false }] }), null);
  assert.equal(updateCost({ mode: "review", artifact: { text: DOC }, decisions: [{ ...decision, removed: true }] }), null);
  const big = updateCost({ mode: "review", artifact: { text: "x".repeat(90_000) }, decisions: [decision, { ...decision, id: "b" }] })!;
  assert.equal(big.count, 2);
  assert.equal(big.high, true);
  assert.ok(big.doc >= 30_000 && big.total >= big.doc && big.reply > 0);
});
