import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  MODEL_SIZE_BYTES,
  cachedBytes,
  deleteModelFiles,
  hfHubCacheDir,
  isModelReady,
  modelFolders,
  progressPercent,
  readySnapshot,
} from "./speech-models.js";
import { tempDir } from "./testing/stores.js";

function writeSized(file: string, bytes: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  fs.truncateSync(file, bytes);
}

/** Current huggingface_hub layout: blobs + snapshot symlinks. */
function currentLayout(cache: string, repo: string, opts: { weights: number; incomplete?: boolean }): string {
  const root = path.join(cache, repo);
  const blobs = path.join(root, "blobs");
  if (opts.incomplete) {
    writeSized(path.join(blobs, "aaa.incomplete"), opts.weights);
    return root;
  }
  writeSized(path.join(blobs, "aaa"), opts.weights);
  writeSized(path.join(blobs, "bbb"), 2_000);
  writeSized(path.join(blobs, "ccc"), 3_000);
  const snap = path.join(root, "snapshots", "rev1");
  fs.mkdirSync(snap, { recursive: true });
  fs.symlinkSync("../../blobs/aaa", path.join(snap, "model.bin"));
  fs.symlinkSync("../../blobs/bbb", path.join(snap, "config.json"));
  fs.symlinkSync("../../blobs/ccc", path.join(snap, "tokenizer.json"));
  fs.mkdirSync(path.join(root, "refs"), { recursive: true });
  fs.writeFileSync(path.join(root, "refs", "main"), "rev1");
  return root;
}

/** Legacy / no-symlink layout: real files directly in the snapshot, partial files as *.incomplete. */
function legacyLayout(cache: string, repo: string, opts: { weights: number; incomplete?: boolean }): string {
  const snap = path.join(cache, repo, "snapshots", "rev0");
  if (opts.incomplete) {
    writeSized(path.join(snap, "model.bin.incomplete"), opts.weights);
    writeSized(path.join(snap, "config.json"), 2_000);
    return path.join(cache, repo);
  }
  writeSized(path.join(snap, "model.bin"), opts.weights);
  writeSized(path.join(snap, "config.json"), 2_000);
  writeSized(path.join(snap, "tokenizer.json"), 3_000);
  return path.join(cache, repo);
}

test("cache dir follows huggingface_hub's resolution order", () => {
  assert.equal(hfHubCacheDir({ HF_HUB_CACHE: "/a", HF_HOME: "/b" }, "/home/u"), "/a");
  assert.equal(hfHubCacheDir({ HUGGINGFACE_HUB_CACHE: "/legacy" }, "/home/u"), "/legacy");
  assert.equal(hfHubCacheDir({ HF_HOME: "/b" }, "/home/u"), path.join("/b", "hub"));
  assert.equal(hfHubCacheDir({ XDG_CACHE_HOME: "/x" }, "/home/u"), path.join("/x", "huggingface", "hub"));
  assert.equal(hfHubCacheDir({}, "/home/u"), path.join("/home/u", ".cache", "huggingface", "hub"));
});

test("current layout: partial download progress counts the .incomplete blob", () => {
  const cache = tempDir();
  currentLayout(cache, "models--Systran--faster-whisper-small", { weights: 121_000_000, incomplete: true });
  const bytes = cachedBytes(cache, "small");
  assert.equal(bytes, 121_000_000);
  assert.equal(progressPercent(bytes, MODEL_SIZE_BYTES.small), 25);
  assert.equal(isModelReady(cache, "small"), false);
});

test("current layout: finished model is ready and symlinks are not counted twice", () => {
  const cache = tempDir();
  currentLayout(cache, "models--Systran--faster-whisper-small", { weights: 484_000_000 });
  assert.equal(cachedBytes(cache, "small"), 484_000_000 + 5_000 + "rev1".length, "blobs plus refs/main, links not followed");
  assert.ok(readySnapshot(cache, "small")?.endsWith(path.join("snapshots", "rev1")));
  assert.equal(isModelReady(cache, "medium"), false);
});

test("legacy layout: partial and finished files directly in the snapshot", () => {
  const cache = tempDir();
  legacyLayout(cache, "models--Systran--faster-whisper-medium", { weights: 764_000_000, incomplete: true });
  assert.equal(cachedBytes(cache, "medium"), 764_000_000 + 2_000);
  assert.equal(progressPercent(cachedBytes(cache, "medium"), MODEL_SIZE_BYTES.medium), 50);
  assert.equal(isModelReady(cache, "medium"), false);

  const done = tempDir();
  legacyLayout(done, "models--Systran--faster-whisper-medium", { weights: 1_528_000_000 });
  assert.equal(isModelReady(done, "medium"), true);
  assert.equal(cachedBytes(done, "medium"), 1_528_000_000 + 5_000);
});

test("turbo is found whatever organisation publishes it", () => {
  const cache = tempDir();
  currentLayout(cache, "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo", { weights: 10 });
  currentLayout(cache, "models--Systran--faster-whisper-small.en", { weights: 10 });
  assert.equal(modelFolders(cache, "turbo").length, 1);
  assert.equal(isModelReady(cache, "turbo"), true);
  // "small.en" is a different model and must not count as "small".
  assert.equal(modelFolders(cache, "small").length, 0);
});

test("an empty model.bin is not a ready model", () => {
  const cache = tempDir();
  currentLayout(cache, "models--Systran--faster-whisper-small", { weights: 0 });
  assert.equal(isModelReady(cache, "small"), false);
});

test("progress never reports 100 before the download finished", () => {
  assert.equal(progressPercent(0, 100), 0);
  assert.equal(progressPercent(100, 100), 99);
  assert.equal(progressPercent(500, 100), 99);
  assert.equal(progressPercent(50, 100, true), 100);
  assert.equal(progressPercent(10, 0), 0);
});

test("missing cache dir means nothing downloaded, not an error", () => {
  const cache = path.join(tempDir(), "does-not-exist");
  assert.equal(cachedBytes(cache, "small"), 0);
  assert.equal(isModelReady(cache, "small"), false);
});

test("delete removes only that model's folders", () => {
  const cache = tempDir();
  currentLayout(cache, "models--Systran--faster-whisper-small", { weights: 10 });
  currentLayout(cache, "models--Systran--faster-whisper-medium", { weights: 10 });
  fs.mkdirSync(path.join(cache, "models--other--thing"));
  deleteModelFiles(cache, "small");
  assert.deepEqual(fs.readdirSync(cache).sort(), ["models--Systran--faster-whisper-medium", "models--other--thing"]);
});
