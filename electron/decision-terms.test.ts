import assert from "node:assert/strict";
import { test } from "node:test";
import { mentionsStructure, termsProblem } from "./shared/decision-terms.js";

// CLOUD_TASK_6 phase 2: the deterministic guard, no model call.

test("structure words are found in Russian and English, as word starts only", () => {
  for (const text of [
    "Значение становится мапой из ключа в массив",
    "Хранить позиции в двух списках",
    "Добавить поле weight в таблицу parcels",
    "Ключ из нескольких колонок",
    "items become a map from type to a list of quantities",
    "Add a column to the table",
  ])
    assert.ok(mentionsStructure(text), text);
  for (const text of ["Включить выгрузку в CSV", "Поднять лимит страницы до 100", "Согласовать срок хранения", "Полезная нагрузка не меняется"])
    assert.ok(!mentionsStructure(text), text);
});

test("an accepted structure decision with empty terms is 'missing'; 'не уточнено' is 'unclear'; the rest is fine", () => {
  const text = "Значение items становится мапой: ключ - массив количеств";
  assert.equal(termsProblem({ text, status: "accepted" }), "missing");
  assert.equal(termsProblem({ text, status: "accepted", terms: "  " }), "missing");
  assert.equal(termsProblem({ text, status: "accepted", terms: "не уточнено: что ключ, имя поля или его значение" }), "unclear");
  assert.equal(termsProblem({ text, status: "open", terms: "Не уточнено: ключ" }), "unclear");
  assert.equal(termsProblem({ text, status: "accepted", terms: "ключ - тип вложения; значение - массив количеств" }), null);
  // Not accepted yet, or not about a structure: nothing to pin now.
  assert.equal(termsProblem({ text, status: "proposed" }), null);
  assert.equal(termsProblem({ text: "Поднять лимит страницы до 100", status: "accepted" }), null);
});
