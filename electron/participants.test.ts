import assert from "node:assert/strict";
import { test } from "node:test";
import { formatParticipants, groundParticipants, nameWasSaid, parseParticipants } from "./shared/participants.js";
import { ANALYSIS_MARKER, buildProtocolMarkdown, splitSummary, type ProtocolLabels } from "./summary-format.js";
import type { Meeting } from "./shared/ipc-contract.js";

// CLOUD_TASK_6 phase 3: participants as the call shows them, never a name nobody said.

const transcript = [
  { text: "Давай по посылке: позиции храним двумя списками?" },
  { text: "Тут мелочь, я спрошу у Тимура, он владелец продукта." },
  { text: "Олегу тоже скажу, он тестирует." },
];
const labels = { inferred: "по ходу встречи", thirdParty: "третьи лица, не на встрече" };

test("a name counts only when it was said in the call, with any ending", () => {
  assert.ok(nameWasSaid("Тимур", transcript));
  assert.ok(nameWasSaid("Олег", transcript), "Олегу");
  assert.ok(!nameWasSaid("Руслан", transcript));
  assert.ok(!nameWasSaid("", transcript));
});

test("parsing is tolerant; grounding drops names nobody said and keeps the role", () => {
  const raw = parseParticipants([
    { who: "Руслан", role: "разработчик, отвечает за реализацию", kind: "named" },
    { who: "", role: "аналитик, задаёт вопросы по документу", kind: "inferred" },
    { who: "Тимур", role: "владелец продукта, к нему передан вопрос", kind: "third_party" },
    { who: "Марина", role: "", kind: "third_party" },
    { who: "", role: "", kind: "named" },
    { role: "тестировщик", kind: "wizard" },
    "junk",
  ]);
  assert.equal(raw.length, 5);
  assert.equal(raw[4]!.kind, "inferred");
  const grounded = groundParticipants(raw, transcript);
  assert.deepEqual(grounded, [
    // The briefing's (or the model's) name is gone, the role from the call stays.
    { who: "", role: "разработчик, отвечает за реализацию", kind: "inferred" },
    { who: "", role: "аналитик, задаёт вопросы по документу", kind: "inferred" },
    { who: "Тимур", role: "владелец продукта, к нему передан вопрос", kind: "third_party" },
    { who: "", role: "тестировщик", kind: "inferred" },
  ]);
  assert.deepEqual(parseParticipants("nope"), []);
});

test("the participants line: names, then roles from the call, then people not in the call; empty stays empty", () => {
  assert.equal(formatParticipants([], labels), "");
  assert.equal(formatParticipants(undefined, labels), "");
  assert.equal(
    formatParticipants(
      [
        { who: "Олег", role: "тестирует", kind: "named" },
        { who: "", role: "разработчик", kind: "inferred" },
        { who: "Тимур", role: "владелец продукта", kind: "third_party" },
      ],
      labels,
    ),
    "Олег (тестирует); по ходу встречи: разработчик; третьи лица, не на встрече: Тимур (владелец продукта)",
  );
});

test("the JSON tail carries participants; the protocol fills its participants line from them, or leaves it empty", () => {
  const tail = { agenda: [], actions: [], participants: [{ who: "", role: "разработчик", kind: "inferred" }] };
  const { analysis } = splitSummary(`Обсуждения\n- x\n${ANALYSIS_MARKER}\n${JSON.stringify(tail)}`, []);
  assert.deepEqual(analysis?.participants, [{ who: "", role: "разработчик", kind: "inferred" }]);
  assert.equal(splitSummary(`x\n${ANALYSIS_MARKER}\n{"agenda":[],"actions":[]}`, []).analysis?.participants, undefined);

  const protocolLabels: ProtocolLabels = {
    date: "Дата", mode: "Режим", participants: "Участники", agenda: "Повестка", discussions: "Обсуждения", actions: "Задачи",
    actionTask: "Задача", actionOwner: "Кто", actionDue: "Срок", agendaClosed: "закрыт", agendaOpen: "открыт", me: "Я", other: "Собеседник",
    participantsInferred: labels.inferred, participantsThird: labels.thirdParty,
  };
  const meeting = { id: "m", title: "Ревью", startedAt: 0, mode: "review", context: "", transcript: [] } as Meeting;
  assert.match(buildProtocolMarkdown(meeting, protocolLabels, "Ревью", []), /\nУчастники: \n/);
  const withPeople = { ...meeting, participants: analysis!.participants! };
  assert.match(buildProtocolMarkdown(withPeople, protocolLabels, "Ревью", []), /\nУчастники: по ходу встречи: разработчик\n/);
});
