import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { SpeechModelManager } from "./model-manager.js";
import type { SpeechModelName, SpeechModelRow } from "./shared/ipc-contract.js";
import { fixturePath, tempDir } from "./testing/stores.js";

function manager(mode: string, stepMs = 15) {
  const cache = tempDir();
  const events: SpeechModelRow[][] = [];
  let spawned = 0;
  const m = new SpeechModelManager({
    cacheDir: () => cache,
    spawnDownload: (model: SpeechModelName) => {
      spawned += 1;
      return spawn(process.execPath, [fixturePath("fake-model-download.mjs"), model], {
        env: { ...process.env, HF_HUB_CACHE: cache, FAKE_DOWNLOAD_MODE: mode, FAKE_DOWNLOAD_STEP_MS: String(stepMs) },
        stdio: ["ignore", "ignore", "pipe"],
      });
    },
    onChange: (rows) => events.push(rows),
    retryDelaysMs: [30, 30],
    pollMs: 10,
  });
  const row = (name: SpeechModelName) => m.rows().find((r) => r.name === name)!;
  const spawnCount = () => spawned;
  return { m, events, row, cache, spawnCount };
}

async function until(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

test("fresh cache: every model is 'not downloaded'", () => {
  const { m } = manager("ok");
  assert.deepEqual(
    m.rows().map((r) => [r.name, r.state, r.percent]),
    [
      ["small", "absent", 0],
      ["medium", "absent", 0],
      ["turbo", "absent", 0],
    ],
  );
});

test("download reports rising progress and ends ready", async () => {
  const { m, events, row } = manager("ok");
  m.download("small");
  assert.equal(row("small").state, "downloading");
  await until(() => row("small").state === "ready");
  const percents = events.map((rows) => rows.find((r) => r.name === "small")!).filter((r) => r.state === "downloading").map((r) => r.percent);
  assert.ok(percents.some((p) => p > 0 && p < 100), `saw progress ${percents.join(",")}`);
  for (let i = 1; i < percents.length; i++) assert.ok(percents[i] >= percents[i - 1], "progress never goes back");
  assert.equal(row("small").percent, 100);
  assert.equal(m.isReady("small"), true);
  m.dispose();
});

test("a dropped connection is retried and resumes from the partial file", async () => {
  const { m, row, spawnCount } = manager("fail-once");
  m.download("medium");
  await until(() => row("medium").state === "ready");
  assert.equal(spawnCount(), 2);
  m.dispose();
});

test("after the retries run out the row shows the error; Retry starts again", async () => {
  const { m, row, spawnCount } = manager("fail");
  m.download("turbo");
  await until(() => row("turbo").state === "error");
  assert.equal(spawnCount(), 3);
  assert.match(row("turbo").error ?? "", /connection reset/);
  assert.ok(row("turbo").bytes > 0, "the partial file is kept for resuming");
  m.download("turbo");
  assert.equal(row("turbo").state, "downloading");
  m.cancel("turbo");
  m.dispose();
});

test("cancel stops the download, keeps the partial file, and Continue resumes", async () => {
  const { m, row } = manager("hang");
  m.download("small");
  await until(() => row("small").percent >= 30);
  m.cancel("small");
  const after = row("small");
  assert.equal(after.state, "absent");
  assert.ok(after.bytes > 0);
  m.dispose();
});

test("cancel then Continue resumes from the partial file, never from zero", async () => {
  const { m, row, events, spawnCount } = manager("ok", 60);
  m.download("small");
  await until(() => row("small").percent >= 30);
  m.cancel("small");
  const cancelled = row("small");
  assert.equal(cancelled.state, "absent");
  assert.ok(cancelled.bytes >= cancelled.sizeBytes * 0.3, "the partial file stays");
  assert.ok(cancelled.percent >= 30, "the row shows how far it got");

  const from = events.length;
  m.download("small");
  await until(() => row("small").state === "ready", 15_000);
  const during = events
    .slice(from)
    .map((rows) => rows.find((r) => r.name === "small")!)
    .filter((r) => r.state === "downloading");
  assert.ok(during.length > 0);
  assert.ok(
    during.every((r) => r.bytes >= cancelled.bytes),
    `progress after Continue went below the partial size: ${during.map((r) => r.percent).join(",")}`,
  );
  assert.equal(spawnCount(), 2);
  m.dispose();
});

test("delete removes a downloaded model", async () => {
  const { m, row } = manager("ok");
  m.download("small");
  await until(() => row("small").state === "ready");
  m.remove("small");
  assert.equal(row("small").state, "absent");
  assert.equal(row("small").bytes, 0);
  m.dispose();
});

test("download of a model that is already on disk does nothing", async () => {
  const { m, row, spawnCount } = manager("ok");
  m.download("small");
  await until(() => row("small").state === "ready");
  m.download("small");
  assert.equal(spawnCount(), 1);
  m.dispose();
});
