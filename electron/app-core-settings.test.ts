import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AppCore } from "./app-core.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { UsageLedger } from "./metering/ledger.js";
import { MemoryKV } from "./platform/kv.js";
import { setExportDir } from "./settings-store.js";
import { setupStores } from "./testing/stores.js";

// Settings that Simple needs without Advanced: where exports are offered.

function core(documents: string): AppCore {
  const { dir } = setupStores({ onboardingDone: true });
  return new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: ["-e", ""] })),
    models: new SpeechModelManager({ cacheDir: () => path.join(dir, "hf"), spawnDownload: () => { throw new Error("no download"); }, onChange: () => {} }),
    ledger: new UsageLedger(new MemoryKV()),
    emit: () => {},
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async () => null,
    documentsDir: () => documents,
  });
}

test("export folder: Documents by default, the chosen folder once set, Documents again if it disappears", async () => {
  const documents = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "docs-"));
  const c = core(documents);
  assert.equal((await c.settingsSnapshot()).exportDir, documents);
  const chosen = fs.mkdtempSync(path.join(documents, "protocols-"));
  setExportDir(chosen);
  assert.equal((await c.settingsSnapshot()).exportDir, chosen);
  fs.rmSync(chosen, { recursive: true });
  assert.equal(c.exportDir(), documents);
});
