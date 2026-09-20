import assert from "node:assert/strict";
import { test } from "node:test";
import { observationsToText } from "./layout.js";
import type { OcrResult } from "./types.js";

// 1000x1000 image; boxes in normalized top-left coordinates, 10px chars.
function box(text: string, leftPx: number, topPx: number, heightPx = 20) {
  return { text, x: leftPx / 1000, y: topPx / 1000, w: (text.length * 10) / 1000, h: heightPx / 1000 };
}
const sized = (observations: OcrResult["observations"]): OcrResult => ({ observations, width: 1000, height: 1000 });

test("restores reading order from shuffled pieces", () => {
  const text = observationsToText(sized([box("second line", 0, 70), box("first line", 0, 40), box("third line", 0, 100)]));
  assert.equal(text, "first line\nsecond line\nthird line");
});

test("keeps indentation relative to the leftmost text", () => {
  const text = observationsToText(
    sized([box("if x:", 100, 40), box("return 1", 140, 70), box("else:", 100, 100), box("return 2", 140, 130)]),
  );
  assert.equal(text, "if x:\n    return 1\nelse:\n    return 2");
});

test("joins pieces on one line and separates wide gaps", () => {
  const text = observationsToText(sized([box("name", 0, 40), box("status", 300, 42), box("id", 0, 70)]));
  assert.equal(text, "name      status\nid");
});

test("inserts a blank line for a paragraph-sized gap", () => {
  const text = observationsToText(sized([box("one", 0, 40), box("two", 0, 70), box("three", 0, 200)]));
  assert.equal(text, "one\ntwo\n\nthree");
});

test("ignores empty pieces and truncates long output", () => {
  assert.equal(observationsToText(sized([box("   ", 0, 10)])), "");
  const many = Array.from({ length: 50 }, (_, i) => box(`line number ${i}`, 0, 10 + i * 30));
  assert.match(observationsToText(sized(many), 100), /\[\.\.\. truncated\]$/);
});
