import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { MemoryKV, fakeSecretBox } from "../platform/kv.js";
import { MockBillingProvider } from "./mock-provider.js";
import { BillingService } from "./service.js";
import type { BillingProvider } from "./provider.js";
import { billingConfigFromEnv, isConfiguredServer, PRODUCTION_PUBLIC_KEY } from "./config.js";
import { AppCore } from "../app-core.js";
import { PythonRuntime } from "../python-runtime.js";
import { SpeechModelManager } from "../model-manager.js";
import { UsageLedger } from "../metering/ledger.js";
import { getSelectedProviderId, setApiKey } from "../settings-store.js";
import { setupStores } from "../testing/stores.js";

// rc.2: with no billing server in the build, or with an own key selected,
// the app never contacts the billing server and never nags about it.

const REAL_LOOKING_KEY = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAq0mA7uV9Zb3dXl8oYt1tQyE8wS5Q2pP6kKjR0yJzX4c=\n-----END PUBLIC KEY-----\n";

test("availability: placeholder URL or key means no built-in provider; an explicit server or the mock means yes", () => {
  assert.equal(billingConfigFromEnv({}).builtInProviderAvailable, false, "this repository ships placeholders");
  assert.equal(billingConfigFromEnv({ AVALET_BILLING_URL: "http://127.0.0.1:8787" }).builtInProviderAvailable, true);
  assert.equal(billingConfigFromEnv({ AVALET_BILLING: "mock" }).builtInProviderAvailable, true);
  assert.equal(isConfiguredServer("https://billing.avalet.invalid", REAL_LOOKING_KEY), false);
  assert.equal(isConfiguredServer("https://billing.example.com", PRODUCTION_PUBLIC_KEY), false);
  assert.equal(isConfiguredServer("not a url", REAL_LOOKING_KEY), false);
  assert.equal(isConfiguredServer("https://billing.example.com", REAL_LOOKING_KEY), true);
});

/** The in-process mock with every server call counted. */
function counted(clock: { now: number }) {
  const calls: string[] = [];
  let inner!: MockBillingProvider;
  const make = (installId: () => string): BillingProvider => {
    inner = new MockBillingProvider(installId, () => clock.now);
    const wrap = <K extends "getEntitlement" | "startCheckout" | "refresh" | "cancelInfo" | "plans">(name: K) =>
      ((...args: never[]) => {
        calls.push(name);
        return (inner[name] as (...a: never[]) => unknown).apply(inner, args);
      }) as BillingProvider[K];
    return {
      getEntitlement: wrap("getEntitlement"),
      startCheckout: wrap("startCheckout"),
      refresh: wrap("refresh"),
      cancelInfo: wrap("cancelInfo"),
      plans: wrap("plans"),
      get mockPublicKeyPem() {
        return inner.mockPublicKeyPem;
      },
    };
  };
  return { calls, make, inner: () => inner };
}

function service(options: { available: boolean; selected: { id: string } }) {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const c = counted(clock);
  const svc = new BillingService({
    kv: new MemoryKV(),
    secrets: fakeSecretBox,
    publicKeys: [],
    makeProvider: (identity) => c.make(() => identity().installId),
    selectedProviderId: () => options.selected.id,
    ownKeyReady: () => true,
    onChange: () => {},
    openExternal: () => {},
    now: () => clock.now,
    available: options.available,
    refreshEveryMs: 5,
    checkoutPollMs: 5,
  });
  return { svc, calls: c.calls, inner: c.inner };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("no billing server in the build: nothing is ever sent, the state says so", async () => {
  const selected = { id: "avalet" };
  const { svc, calls } = service({ available: false, selected });
  svc.start();
  await svc.activateTrial();
  await svc.refresh();
  await svc.checkout("pro");
  await svc.openManage();
  svc.markExhausted();
  await wait(40);
  assert.equal(calls.join(","), "");
  const state = svc.access();
  assert.equal(state.builtInAvailable, false);
  assert.equal(state.canUseAvalet, false);
  assert.equal(state.status, "not-activated");
  svc.dispose();
});

test("own key selected: no call at startup, on the timer or on refresh, even with a trial on this install", async () => {
  const selected = { id: "avalet" };
  const { svc, calls } = service({ available: true, selected });
  await svc.activateTrial();
  assert.ok(calls.length > 0, "the explicit trial start does talk to the server");
  svc.dispose();

  selected.id = "openai";
  calls.length = 0;
  svc.start();
  await svc.refresh();
  svc.providerChanged();
  await wait(40);
  assert.equal(calls.join(","), "", "own-key mode never contacts the billing server");

  // Back to Avalet: the entitlement is brought up to date at once.
  selected.id = "avalet";
  svc.providerChanged();
  await wait(20);
  assert.ok(calls.includes("refresh"));
  svc.dispose();
});

test("an unreachable server is logged once per session, not on every refresh", async () => {
  const selected = { id: "avalet" };
  const { svc, inner } = service({ available: true, selected });
  await svc.activateTrial();
  inner().offline = true;
  const lines: string[] = [];
  const original = console.log;
  const quiet = process.env.AVALET_QUIET_LOG;
  delete process.env.AVALET_QUIET_LOG;
  console.log = (line: string) => void lines.push(String(line));
  try {
    for (let i = 0; i < 6; i++) await svc.refresh();
  } finally {
    console.log = original;
    if (quiet !== undefined) process.env.AVALET_QUIET_LOG = quiet;
  }
  assert.equal(lines.filter((l) => l.includes("[billing]") && l.includes("unreachable")).length, 1);
  svc.dispose();
});

test("app core: an install that had Avalet selected goes back to an own key; Avalet cannot be selected", async () => {
  const { dir } = setupStores({ onboardingDone: true, selectedProviderId: "avalet" });
  setApiKey("deepseek", "sk-test");
  const { svc } = service({ available: false, selected: { id: "avalet" } });
  const core = new AppCore({
    sidecar: new PythonRuntime(() => ({ command: process.execPath, args: ["-e", ""] })),
    models: new SpeechModelManager({
      cacheDir: () => path.join(dir, "hf"),
      spawnDownload: () => {
        throw new Error("no download");
      },
      onChange: () => {},
    }),
    ledger: new UsageLedger(new MemoryKV()),
    billing: svc,
    avaletProxyUrl: "https://billing.avalet.invalid/v1/llm",
    emit: () => {},
    captureScreen: async () => null,
    recognizeText: async () => null,
    isOcrAvailable: async () => false,
    chooseSavePath: async () => null,
  });
  assert.equal(getSelectedProviderId(), "deepseek", "the provider with a saved key");
  assert.equal((await core.settingsSnapshot()).builtInProviderAvailable, false);
  assert.throws(() => core.handlers["avalet:settings-select-provider"]!("avalet"), /not available/);
  assert.equal(getSelectedProviderId(), "deepseek");
  svc.dispose();
});
