import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  appendSegment,
  deleteMeeting,
  endCurrentMeeting,
  flushCurrentMeeting,
  getCurrentMeeting,
  initMeetingsStore,
  listMeetings,
  readMeeting,
  renameMeeting,
  setAgenda,
  setCurrentContext,
  setLiveAnalysis,
  setSummary,
  startMeeting,
  transcriptToRawText,
} from "./meetings-store.js";
import { tempDir } from "./testing/stores.js";

function fresh(): string {
  const dir = path.join(tempDir(), "meetings");
  initMeetingsStore(dir);
  return dir;
}

test("a meeting is written to disk at start and survives a restart", () => {
  const dir = fresh();
  const meeting = startMeeting({ titlePrefix: "Встреча", mode: "requirements", context: "бриф", agenda: ["Какой лимит"] });
  assert.match(meeting.title, /^Встреча \d\d\.\d\d \d\d:\d\d$/);
  assert.ok(fs.existsSync(path.join(dir, `${meeting.id}.json`)));
  appendSegment({ at: meeting.startedAt + 1000, speaker: "other", text: "Дневной" });
  flushCurrentMeeting();
  initMeetingsStore(dir); // "restart": the in-memory current meeting is gone
  const reread = readMeeting(meeting.id);
  assert.equal(reread?.transcript.length, 1);
  assert.equal(reread?.context, "бриф");
});

test("Start while a meeting runs returns the same meeting", () => {
  fresh();
  const a = startMeeting({ mode: "free", context: "" });
  const b = startMeeting({ mode: "free", context: "" });
  assert.equal(a.id, b.id);
});

test("a late mic segment is put in time order", () => {
  fresh();
  const m = startMeeting({ mode: "free", context: "" });
  appendSegment({ at: 30, speaker: "other", text: "третье" });
  appendSegment({ at: 10, speaker: "me", text: "первое" });
  appendSegment({ at: 20, speaker: "other", text: "второе" });
  assert.deepEqual(getCurrentMeeting()?.transcript.map((s) => s.text), ["первое", "второе", "третье"]);
  assert.equal(m.id, getCurrentMeeting()?.id);
});

test("after End nothing is appended and the next Start opens a new meeting", () => {
  fresh();
  const m = startMeeting({ mode: "free", context: "" });
  const ended = endCurrentMeeting();
  assert.equal(ended?.id, m.id);
  assert.ok(ended?.endedAt);
  appendSegment({ at: 1, speaker: "me", text: "потом" });
  assert.equal(readMeeting(m.id)?.transcript.length, 0);
  assert.notEqual(startMeeting({ mode: "free", context: "" }).id, m.id);
});

test("summary with analysis replaces the checklist; agenda edits keep known statuses", () => {
  fresh();
  const m = startMeeting({ mode: "free", context: "", agenda: ["A", "B"] });
  setSummary(m.id, "Обсуждения\n- ...", {
    agendaStatus: [
      { question: "A", closed: true, note: "да" },
      { question: "B", closed: false, note: "" },
    ],
    actions: [{ task: "Написать письмо", owner: "Я", due: "завтра" }],
  });
  let saved = readMeeting(m.id)!;
  assert.equal(saved.summary, "Обсуждения\n- ...");
  assert.ok(saved.summaryAt);
  assert.equal(saved.actions?.length, 1);
  setAgenda(m.id, ["B", "C", "A"]);
  saved = readMeeting(m.id)!;
  assert.deepEqual(
    saved.agendaStatus?.map((s) => [s.question, s.closed]),
    [
      ["B", false],
      ["C", false],
      ["A", true],
    ],
  );
  setLiveAnalysis(m.id, { actions: [] });
  assert.equal(readMeeting(m.id)?.actions?.length, 0);
});

test("rename, context update, list order, delete", () => {
  fresh();
  const first = startMeeting({ mode: "free", context: "" });
  endCurrentMeeting();
  const second = startMeeting({ mode: "demo", context: "старый" });
  setCurrentContext("новый");
  renameMeeting(first.id, "  Груминг  ");
  renameMeeting(second.id, "   ");
  flushCurrentMeeting();
  const list = listMeetings();
  assert.deepEqual(list.map((m) => m.id).sort(), [first.id, second.id].sort());
  assert.ok(list[0].startedAt >= list[1].startedAt, "newest first");
  assert.equal(readMeeting(first.id)?.title, "Груминг");
  assert.equal(readMeeting(second.id)?.title, second.title, "blank rename ignored");
  assert.equal(readMeeting(second.id)?.context, "новый");
  deleteMeeting(second.id);
  assert.equal(readMeeting(second.id), null);
  assert.equal(getCurrentMeeting(), null);
});

test("ids that are not UUIDs never reach the file system", () => {
  fresh();
  assert.equal(readMeeting("../../etc/passwd"), null);
  assert.equal(readMeeting("x"), null);
  assert.doesNotThrow(() => deleteMeeting("../secrets"));
});

test("a corrupt meeting file is skipped, not fatal", () => {
  const dir = fresh();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "00000000-0000-0000-0000-000000000000.json"), "{broken");
  assert.deepEqual(listMeetings(), []);
});

test("raw transcript text: title, date, one line per phrase with clock and speaker", () => {
  fresh();
  const m = startMeeting({ title: "Созвон", mode: "free", context: "" });
  appendSegment({ at: m.startedAt + 65_000, speaker: "other", text: "Привет" });
  appendSegment({ at: m.startedAt + 3_725_000, speaker: "me", text: "Пока" });
  const text = transcriptToRawText(getCurrentMeeting()!, { me: "Я", other: "Собеседник", date: "Дата" });
  const lines = text.split("\n");
  assert.equal(lines[0], "Созвон");
  assert.match(lines[1], /^Дата: /);
  assert.equal(lines[3], "[00:01:05] Собеседник: Привет");
  assert.equal(lines[4], "[01:02:05] Я: Пока");
});
