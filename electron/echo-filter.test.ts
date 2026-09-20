import assert from "node:assert/strict";
import { test } from "node:test";
import { EchoFilter, looksLikeEcho } from "./echo-filter.js";

const other = "Нам нужно, чтобы клиент мог менять дневной лимит по карте прямо в приложении.";

test("recognizes a garbled copy of the same speech", () => {
  assert.equal(looksLikeEcho("нам нужно что бы клиент мог менять дневной лимит по карте в приложении", [other]), true);
  assert.equal(looksLikeEcho("Нам нужно чтобы клиент мог менять дневной лимит по карте", [other]), true);
});

test("does not flag different speech, even on the same topic", () => {
  assert.equal(looksLikeEcho("Понял, тогда я уточню у команды по интеграции и вернусь с ответом.", [other]), false);
  assert.equal(looksLikeEcho("Лимит дневной или разовый, и кто подтверждает изменение?", [other]), false);
  assert.equal(looksLikeEcho("да", [other]), false);
});

const T = 1_000_000;
const span = (fromS: number, toS: number, text: string) => ({ start: T + fromS * 1000, end: T + toS * 1000, text });

function harness(holdMs = 7_000) {
  const committed: string[] = [];
  const dropped: string[] = [];
  const filter = new EchoFilter(() => T + 8_000, (t) => dropped.push(t), holdMs);
  return { filter, committed, dropped };
}
const echoText = "нам нужно чтобы клиент мог менять дневной лимит по карте";

test("drops a mic segment that echoes an other-side segment spoken at the same time", () => {
  const h = harness();
  h.filter.pushOther(span(0, 5, other));
  h.filter.pushMe(span(0.4, 5.2, echoText), () => h.committed.push("me"));
  assert.deepEqual(h.committed, []);
  assert.equal(h.dropped.length, 1);
  h.filter.reset();
});

test("drops a held mic segment when the matching other segment arrives later", () => {
  const h = harness();
  h.filter.pushMe(span(0.4, 5.2, echoText), () => h.committed.push("me"));
  h.filter.pushOther(span(0, 5, other));
  assert.deepEqual(h.committed, []);
  assert.equal(h.dropped.length, 1);
  h.filter.reset();
});

test("keeps real speech: it is committed after the hold if nothing matches", async () => {
  const h = harness(10);
  h.filter.pushOther(span(0, 5, other));
  h.filter.pushMe(span(6, 9, "Лимит дневной или разовый, и кто подтверждает изменение?"), () => h.committed.push("me"));
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(h.committed, ["me"]);
  assert.equal(h.dropped.length, 0);
});

test("a restatement well after the other side finished is not treated as an echo", () => {
  const h = harness();
  h.filter.pushOther(span(0, 5, other));
  h.filter.pushMe(
    span(12, 17, "Правильно понимаю, нам нужно чтобы клиент мог менять дневной лимит по карте в приложении"),
    () => h.committed.push("me"),
  );
  assert.equal(h.dropped.length, 0);
  h.filter.flush();
  assert.deepEqual(h.committed, ["me"]);
});

test("flush commits held segments so nothing is lost when the session stops", () => {
  const h = harness();
  h.filter.pushMe(span(0, 3, "Это моя собственная реплика, которую надо сохранить"), () => h.committed.push("me"));
  h.filter.flush();
  assert.deepEqual(h.committed, ["me"]);
});
