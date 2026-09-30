import assert from "node:assert/strict";
import { test } from "node:test";
import { artifactFieldCost, summaryExtraCost } from "../src/renderer/lib/artifact-cost.js";
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
  // 90,000 characters at 3 per token, plus the prompt around it: about 31,000.
  assert.equal(large.tokensEach, 31_000);
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
