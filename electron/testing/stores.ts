import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryKV, fakeSecretBox } from "../platform/kv.js";
import { initSettingsStore } from "../settings-store.js";
import { initHistoryStore } from "../history-store.js";
import { initMeetingsStore } from "../meetings-store.js";

// Test-only helpers (excluded from the packaged app, see electron-builder.config.mjs).

export function tempDir(prefix = "avalet-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Fresh in-memory settings and history, meetings in a temp folder. Returns that folder. */
export function setupStores(settings: Record<string, unknown> = {}, options: { forceAdvanced?: boolean } = {}): {
  dir: string;
  settingsKv: MemoryKV;
} {
  const dir = tempDir();
  const settingsKv = new MemoryKV(settings);
  initSettingsStore(settingsKv, fakeSecretBox, options);
  initHistoryStore(new MemoryKV({ blocks: [] }));
  initMeetingsStore(path.join(dir, "meetings"));
  return { dir, settingsKv };
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** <repo>/test/fixtures/<name>; compiled files live in <repo>/dist-electron/testing. */
export function fixturePath(name: string): string {
  return path.resolve(here, "../../test/fixtures", name);
}
