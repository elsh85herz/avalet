import assert from "node:assert/strict";
import test from "node:test";
import { shouldStartEarly, startEarlyDownload, type EarlyDownloadApi } from "../src/renderer/lib/early-download.js";
import type { SpeechModelRow, SpeechModelState } from "../electron/shared/ipc-contract.js";

// The speech model starts downloading early in the first-run flow (wizard,
// how-it-works guide): once, and never when it is already there.

function row(state: SpeechModelState, bytes = 0): SpeechModelRow {
  return { name: "small", state, bytes, sizeBytes: 484_000_000, percent: Math.round((bytes / 484_000_000) * 100) };
}

function fakeApi(current: SpeechModelRow) {
  const downloads: string[] = [];
  let listed = 0;
  const api: EarlyDownloadApi = {
    models: async () => {
      listed += 1;
      return [current];
    },
    download: async (model) => {
      downloads.push(model);
      current = { ...current, state: "downloading" };
    },
  };
  return { api, downloads, listed: () => listed };
}

test("only a missing or partly downloaded model is fetched early", () => {
  assert.equal(shouldStartEarly(row("absent")), true);
  assert.equal(shouldStartEarly(row("absent", 100_000_000)), true, "partial: resumes");
  assert.equal(shouldStartEarly(row("ready", 484_000_000)), false);
  assert.equal(shouldStartEarly(row("downloading", 10)), false);
  assert.equal(shouldStartEarly(row("error", 10)), false);
  assert.equal(shouldStartEarly(undefined), false);
});

test("fires once however often the guide renders or reopens", async () => {
  const state = { tried: false };
  const { api, downloads } = fakeApi(row("absent"));
  assert.equal(await startEarlyDownload(api, state), true);
  assert.equal(await startEarlyDownload(api, state), false);
  assert.equal(await startEarlyDownload(api, state), false);
  assert.deepEqual(downloads, ["small"]);
});

test("a relaunch with the model on disk starts nothing", async () => {
  const { api, downloads, listed } = fakeApi(row("ready", 484_000_000));
  assert.equal(await startEarlyDownload(api, { tried: false }), false);
  assert.deepEqual(downloads, []);
  assert.equal(listed(), 1, "it only looks at the model status");
});

test("a download already running or failed is left alone", async () => {
  for (const state of ["downloading", "error"] as const) {
    const { api, downloads } = fakeApi(row(state, 10));
    assert.equal(await startEarlyDownload(api, { tried: false }), false);
    assert.deepEqual(downloads, []);
  }
});
