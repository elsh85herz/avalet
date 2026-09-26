import assert from "node:assert/strict";
import { test } from "node:test";
import { AppCore, WINDOW_CHANNELS } from "./app-core.js";
import { EXTERNAL_CHANNELS, INVOKE_CHANNELS } from "./shared/ipc-contract.js";
import { PythonRuntime } from "./python-runtime.js";
import { SpeechModelManager } from "./model-manager.js";
import { setupStores } from "./testing/stores.js";
import { UsageLedger } from "./metering/ledger.js";
import { MemoryKV } from "./platform/kv.js";

test("every invoke channel has exactly one handler: core, window or external", () => {
  setupStores({});
  const core = new AppCore({
    sidecar: new PythonRuntime(),
    models: new SpeechModelManager({ cacheDir: () => "/nonexistent", spawnDownload: () => { throw new Error("no"); }, onChange: () => {} }),
    ledger: new UsageLedger(new MemoryKV()),
    emit: () => {},
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async () => null,
  });
  const coreChannels = Object.keys(core.handlers);
  const all = [...coreChannels, ...WINDOW_CHANNELS, ...EXTERNAL_CHANNELS];
  assert.equal(new Set(all).size, all.length, "no channel is handled twice");
  assert.deepEqual([...all].sort(), [...INVOKE_CHANNELS].sort());
});
