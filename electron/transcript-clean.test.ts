import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { cleanMeeting, cleanTranscript, confidenceFlags, hiddenCounts, segmentEnd, visibleSegments } from "./transcript-clean.js";
import { isCreditLine } from "./transcript-noise.js";
import { locateQuote } from "./live-tracker-logic.js";
import { transcriptToRawText, transcriptToText } from "./meetings-store.js";
import type { Meeting, TranscriptSegment } from "./shared/ipc-contract.js";

// CLOUD_TASK_6 phase 4: the saved transcript, cleaned after the call. A
// synthetic "parcel" call; every line invented.

const T0 = Date.UTC(2026, 8, 30, 11, 0, 0);
const s = (sec: number, len: number, speaker: "me" | "other", text: string, extra: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  at: T0 + sec * 1000,
  end: T0 + (sec + len) * 1000,
  speaker,
  text,
  ...extra,
});

const OTHER = [
  "Давай позиции посылки хранить не двумя списками, а мапой из типа вложения в список количеств.",
  "Про ключ из нескольких колонок это мелочь, я спрошу у владельца продукта.",
  "Например, ключ коробка, а в значении три числа по размерам.",
];

test("every other-side line also caught by the mic: the mic copies are marked, one line per utterance stays", () => {
  const transcript = [
    s(0, 6, "other", OTHER[0]!),
    // The echo copy, cut differently and a little garbled, arriving after the other copy.
    s(0.4, 5, "me", "давай позиции посылки хранить не двумя списками а мапой из типа вложения"),
    s(8, 5, "other", OTHER[1]!),
    s(8.3, 5, "me", "про ключ из нескольких колонок это мелочь я спрошу у владельца продукта"),
    s(15, 4, "other", OTHER[2]!),
    s(15.2, 4, "me", "например ключ коробка а в значении три числа по размерам"),
  ];
  const cleaned = cleanTranscript(transcript);
  assert.deepEqual(
    cleaned.map((seg) => seg.filtered ?? null),
    [null, "echo", null, "echo", null, "echo"],
  );
  assert.deepEqual(visibleSegments(cleaned).map((seg) => seg.speaker), ["other", "other", "other"]);
  assert.deepEqual(hiddenCounts(cleaned), { echo: 3, noise: 0 });
  // The same input gives the same marks: running it again changes nothing.
  assert.deepEqual(cleanTranscript(cleaned), cleaned);
});

test("both talking at once, saying different things: both lines stay", () => {
  const transcript = [
    s(0, 6, "other", OTHER[0]!),
    s(2, 3, "me", "Подожди, а ключ это название поля или значение типа?"),
  ];
  assert.deepEqual(cleanTranscript(transcript).map((seg) => seg.filtered ?? null), [null, null]);
});

test("a restatement said later is not an echo; older records without an end time get a guessed one", () => {
  const later = [s(0, 6, "other", OTHER[0]!), s(30, 5, "me", "Правильно понимаю: позиции посылки хранить мапой из типа вложения в список количеств")];
  assert.equal(cleanTranscript(later)[1]!.filtered, undefined);
  const old = { at: T0, speaker: "me" as const, text: "x".repeat(40) };
  assert.equal(segmentEnd(old), T0 + 2_800);
  assert.equal(segmentEnd({ ...old, text: "да" }), T0 + 1_000);
  assert.equal(segmentEnd({ ...old, text: "x".repeat(1_000) }), T0 + 12_000);
});

test("credit lines: whole-line, credit-style only, in Russian and English", () => {
  for (const line of [
    "Редактор субтитров А.Семенова Корректор Б.Орлова",
    "Субтитры сделал ник_автора",
    "Субтитры создавал Кто-то",
    "Корректор В.Иванова",
    "«Субтитры: сообщество переводчиков»",
    "Subtitles by the community",
    "Subtitle editor J. Doe",
    "Proofreader Jane Roe",
  ])
    assert.ok(isCreditLine(line), line);
  for (const line of [
    "Кстати, субтитры в демо надо поправить",
    "Корректор нужен для отчёта, давай добавим поле",
    "Редактор документа сейчас я, потом передам",
    "subtitles are missing in the export",
    "Субтитры сделал ник " + "очень длинная фраза ".repeat(10),
  ])
    assert.ok(!isCreditLine(line), line);
});

test("a credit line is dropped from the summary input only in a quiet stretch, and kept in the record", () => {
  const credit = "Редактор субтитров А.Семенова Корректор Б.Орлова";
  const quietStretch = [s(0, 5, "other", OTHER[0]!), s(10, 3, "me", credit), s(20, 4, "other", OTHER[1]!)];
  const cleaned = cleanTranscript(quietStretch);
  assert.equal(cleaned[1]!.filtered, "noise");
  assert.equal(cleaned.length, 3, "nothing is deleted");
  // Same words while the same channel is talking right around it: kept (conservative).
  const busy = [s(0, 3, "me", "Смотри, вот первая мысль."), s(3.5, 2, "me", credit), s(6, 3, "me", "И вторая мысль сразу за ней.")];
  assert.equal(cleanTranscript(busy)[1]!.filtered, undefined);
  // The recognizer itself said "probably not speech": dropped even there.
  const told = [busy[0]!, { ...busy[1]!, quiet: true }, busy[2]!];
  assert.equal(cleanTranscript(told)[1]!.filtered, "noise");
});

test("recognizer confidence becomes flags with faster-whisper's own thresholds; none when it gave nothing", () => {
  assert.deepEqual(confidenceFlags({ avg_logprob: -1.45, no_speech_prob: 0.1 }), { lowConfidence: true });
  assert.deepEqual(confidenceFlags({ avg_logprob: -0.3, no_speech_prob: 0.93 }), { quiet: true });
  assert.deepEqual(confidenceFlags({ avg_logprob: -0.3, no_speech_prob: 0.2 }), {});
  assert.deepEqual(confidenceFlags({}), {});
});

function meetingWith(transcript: TranscriptSegment[], extra: Partial<Meeting> = {}): Meeting {
  return { id: "m", title: "Посылка", startedAt: T0, endedAt: T0 + 60_000, mode: "review", context: "", transcript, ...extra };
}

test("after cleaning, quotes find the kept line: time and speaker follow the other side's copy", () => {
  const transcript = [
    s(0, 6, "other", OTHER[0]!),
    s(0.4, 5, "me", "давай позиции посылки хранить не двумя списками а мапой из типа вложения"),
  ];
  // A live checklist quote that landed on the echo copy, with the wrong speaker.
  const meeting = meetingWith(transcript, {
    actions: [{ id: "a", task: "Описать мапу", owner: "", due: "", quote: "хранить не двумя списками, а мапой", speaker: "me", at: transcript[1]!.at }],
  });
  const cleaned = cleanMeeting(meeting)!;
  assert.ok(cleaned);
  assert.equal(cleaned.actions![0]!.speaker, "other");
  assert.equal(cleaned.actions![0]!.at, transcript[0]!.at);
  const found = locateQuote("хранить не двумя списками, а мапой", visibleSegments(cleaned.transcript));
  assert.equal(found?.speaker, "other");
  // Nothing to clean: null, so the store does not rewrite the file.
  assert.equal(cleanMeeting(meetingWith([s(0, 3, "other", OTHER[0]!)])), null);
});

test("exports and the summary input leave hidden lines out, say how many, and tag unsure lines only when asked", () => {
  const transcript = cleanTranscript([
    s(0, 6, "other", OTHER[0]!),
    s(0.4, 5, "me", "давай позиции посылки хранить не двумя списками а мапой из типа вложения"),
    s(10, 3, "me", "Редактор субтитров А.Семенова Корректор Б.Орлова"),
    s(20, 4, "other", OTHER[1]!, { lowConfidence: true }),
  ]);
  const meeting = meetingWith(transcript);
  const text = transcriptToText(meeting, { me: "[Я]", other: "[Собеседник]", unsure: "(неразборчиво)" });
  assert.equal(text.split("\n").length, 2);
  assert.doesNotMatch(text, /Редактор субтитров|давай позиции/);
  assert.match(text, /\[00:00:20\] \[Собеседник\] \(неразборчиво\): Про ключ/);
  assert.doesNotMatch(transcriptToText(meeting, { me: "Я", other: "Собеседник" }), /неразборчиво/);
  const raw = transcriptToRawText(meeting, { me: "Я", other: "Собеседник", date: "Дата", hiddenLines: "Строк убрано как шум: {n}." });
  assert.match(raw, /\nСтрок убрано как шум: 2\.\n$/);
});

test("the sidecar reports confidence from faster-whisper's segments (duration-weighted log-prob, lowest no-speech)", (t) => {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(path.resolve("python-sidecar"))})`,
    "import server",
    "class S:",
    "    def __init__(self, start, end, lp, ns): self.start, self.end, self.avg_logprob, self.no_speech_prob = start, end, lp, ns",
    "print(json.dumps([server._confidence([S(0, 3, -0.2, 0.1), S(3, 4, -2.2, 0.9)]), server._confidence([]), server._confidence([object()])]))",
  ].join("\n");
  const run = spawnSync("python3", ["-c", code], { encoding: "utf8" });
  if (run.error) {
    t.skip("python3 is not available here");
    return;
  }
  assert.equal(run.status, 0, run.stderr);
  const [both, none, bare] = JSON.parse(run.stdout) as Array<Record<string, number>>;
  assert.deepEqual(both, { avg_logprob: -0.7, no_speech_prob: 0.1 });
  assert.deepEqual(none, {});
  assert.deepEqual(bare, {});
});

test("a two-hour call (2,400 lines) is cleaned fast", () => {
  const lines: TranscriptSegment[] = [];
  for (let i = 0; i < 1_200; i++) {
    lines.push(s(i * 6, 5, "other", `Реплика собеседника номер ${i} про посылку и её позиции, тип ${i % 7}.`));
    lines.push(s(i * 6 + 2.5, 3, "me", i % 5 === 0 ? `реплика собеседника номер ${i} про посылку и её позиции` : `Мой вопрос ${i}: а что с весом?`));
  }
  const started = performance.now();
  const cleaned = cleanTranscript(lines);
  const took = performance.now() - started;
  assert.equal(cleaned.filter((seg) => seg.filtered === "echo").length, 240);
  assert.ok(took < 2_000, `took ${Math.round(took)} ms`);
});
