import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  ARTIFACT_INDEX_CHAR_CAP,
  buildArtifactIndex,
  findSection,
  parseSections,
  sectionAskedFor,
  sectionLabel,
  sectionText,
} from "./shared/artifact.js";
import { fixturePath } from "./testing/stores.js";

// The index live suggestions get instead of the document (CLOUD_TASK_5 phase 1).

const SPEC = fs.readFileSync(fixturePath("spec-activity-journal.md"), "utf8");

test("sections keep the document's own numbers and nest by heading level", () => {
  const sections = parseSections(SPEC);
  assert.deepEqual(
    sections.map(sectionLabel),
    [
      "Журнал активности: спецификация",
      "1 Назначение",
      "2 Термины",
      "3 Методы API",
      "3.1 GET /activities",
      "3.2 POST /activities/export",
      "4 Хранение",
      "5 Открытые вопросы",
    ],
  );
  const get = sections.find((s) => s.number === "3.1")!;
  assert.equal(get.firstLine, "Возвращает ленту событий пользователя.");
  // A section runs to the next heading of the same or a higher level.
  assert.match(sectionText(SPEC, sections.find((s) => s.number === "3")!), /POST \/activities\/export/);
  assert.doesNotMatch(sectionText(SPEC, get), /export/);
});

test("headings without numbers are counted; code blocks are not headings", () => {
  const doc = "# A\n\n## B\ntext\n```\n# not a heading\n```\n## C\n### D\n# E\n";
  assert.deepEqual(parseSections(doc).map(sectionLabel), ["1 A", "1.1 B", "1.2 C", "1.2.1 D", "2 E"]);
});

test("a plain-text document with numbered headings is indexed too; CRLF is fine", () => {
  const doc = "1. Общие положения\r\nТекст.\r\n2. Методы\r\n2.1 Получение ленты\r\nЛента событий.\r\n";
  assert.deepEqual(parseSections(doc).map(sectionLabel), ["1 Общие положения", "2 Методы", "2.1 Получение ленты"]);
});

test("the index has headings, first lines and the open questions verbatim", () => {
  const index = buildArtifactIndex(SPEC);
  assert.match(index, /3\.1 GET \/activities: Возвращает ленту событий пользователя\./);
  assert.match(index, /Нужна ли выгрузка в XLSX кроме CSV\?/);
  assert.doesNotMatch(index, /не более 50 записей/);
});

test("the index stays bounded for a 100,000-character document", () => {
  const big = Array.from({ length: 800 }, (_, i) => `## ${i + 1}. Раздел номер ${i + 1}\n${"Длинный текст раздела. ".repeat(5)}\n`).join("\n");
  assert.ok(big.length > 100_000);
  const index = buildArtifactIndex(big);
  assert.ok(index.length <= ARTIFACT_INDEX_CHAR_CAP, `index is ${index.length} chars`);
  assert.match(index, /index shortened/);
});

test("section references: by number, with a word, by heading; unknown gives null", () => {
  const sections = parseSections(SPEC);
  assert.equal(findSection(sections, "3.2")?.title, "POST /activities/export");
  assert.equal(findSection(sections, "раздел 4")?.title, "Хранение");
  assert.equal(findSection(sections, "Хранение")?.number, "4");
  assert.equal(findSection(sections, "не определён"), null);
  assert.equal(findSection(sections, "9.9"), null);
  assert.equal(sectionAskedFor("что написано в разделе 3.1?"), "3.1");
  assert.equal(sectionAskedFor("What does section 4 say?"), "4");
  assert.equal(sectionAskedFor("что с лимитом?"), null);
});

test("rough figures keep two significant digits", async () => {
  const { roundTokens } = await import("./shared/artifact.js");
  assert.deepEqual([0, 7, 44, 480, 1_459, 1_760, 23_456, 31_000].map(roundTokens), [0, 10, 40, 480, 1_500, 1_800, 23_000, 31_000]);
});
