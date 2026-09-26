import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryKV } from "./platform/kv.js";
import {
  SETTINGS_SCHEMA_VERSION,
  getApiKey,
  getBackgroundModel,
  getOnboardingDone,
  getOverlayOpacity,
  getProviderSettings,
  getSelectedProviderId,
  getUiLevel,
  hasApiKey,
  initSettingsStore,
  migrateSettings,
  setApiKey,
  setOverlayOpacity,
  setSelectedProviderId,
  updateProviderSettings,
} from "./settings-store.js";
import { fakeSecretBox, type SecretBox } from "./platform/kv.js";
import { setupStores } from "./testing/stores.js";

test("fresh install: Simple level, wizard pending, schema current", () => {
  const { settingsKv } = setupStores({});
  assert.equal(getUiLevel(), "simple");
  assert.equal(getOnboardingDone(), false);
  assert.equal(settingsKv.get("schemaVersion"), SETTINGS_SCHEMA_VERSION);
});

test("0.1 install with a saved key: Advanced, no wizard, background model filled in, key kept", () => {
  const encrypted = fakeSecretBox.encryptString("sk-old").toString("base64");
  const { settingsKv } = setupStores({
    selectedProviderId: "deepseek",
    providers: {
      deepseek: { providerId: "deepseek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com", apiKeyEncrypted: encrypted },
    },
    theme: "light",
  });
  assert.equal(getUiLevel(), "advanced");
  assert.equal(getOnboardingDone(), true);
  assert.equal(getApiKey("deepseek"), "sk-old");
  assert.equal(getProviderSettings("deepseek").model, "deepseek-flash", "retired model id mapped");
  assert.equal(getBackgroundModel("deepseek"), "deepseek-flash");
  assert.equal(settingsKv.get("theme"), "light", "other values untouched");
});

test("0.1 install without a key starts in Simple with the wizard", () => {
  setupStores({ theme: "dark", providers: {} });
  assert.equal(getUiLevel(), "simple");
  assert.equal(getOnboardingDone(), false);
});

test("migration is idempotent", () => {
  const kv = new MemoryKV({});
  initSettingsStore(kv, fakeSecretBox);
  assert.deepEqual(migrateSettings(kv.store), {});
});

test("AVALET_ADVANCED forces Advanced without changing the stored level", () => {
  const { settingsKv } = setupStores({}, { forceAdvanced: true });
  assert.equal(getUiLevel(), "advanced");
  assert.equal(settingsKv.get("uiLevel"), "simple");
});

test("keys are stored encrypted and never in the clear", () => {
  const { settingsKv } = setupStores({});
  setApiKey("anthropic", "  sk-ant-secret  ");
  assert.equal(getApiKey("anthropic"), "sk-ant-secret");
  assert.equal(hasApiKey("anthropic"), true);
  assert.equal(JSON.stringify(settingsKv.store).includes("sk-ant-secret"), false);
  setApiKey("anthropic", "");
  assert.equal(hasApiKey("anthropic"), false);
});

test("without OS encryption a key is refused rather than written in the clear", () => {
  const noKeychain: SecretBox = { ...fakeSecretBox, isEncryptionAvailable: () => false };
  const kv = new MemoryKV({});
  initSettingsStore(kv, noKeychain);
  assert.throws(() => setApiKey("openai", "sk-x"), /secure storage/);
  assert.equal(hasApiKey("openai"), false);
});

test("unknown provider ids are rejected; a bad stored id falls back", () => {
  setupStores({ selectedProviderId: "gone" });
  assert.equal(getSelectedProviderId(), "anthropic");
  assert.throws(() => setSelectedProviderId("evil"), /unknown provider/);
  assert.throws(() => updateProviderSettings("evil", { model: "x" }), /unknown provider/);
});

test("background model: empty means the main model", () => {
  setupStores({});
  updateProviderSettings("custom", { model: "llama3.1", backgroundModel: "" });
  assert.equal(getBackgroundModel("custom"), "llama3.1");
  updateProviderSettings("custom", { backgroundModel: "qwen2.5:3b" });
  assert.equal(getBackgroundModel("custom"), "qwen2.5:3b");
});

test("opacity is clamped", () => {
  setupStores({ overlayOpacity: "junk" });
  assert.equal(getOverlayOpacity(), 1);
  setOverlayOpacity(0.01);
  assert.equal(getOverlayOpacity(), 0.2);
});
