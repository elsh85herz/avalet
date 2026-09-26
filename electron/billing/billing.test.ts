import assert from "node:assert/strict";
import { after, test } from "node:test";
import { MemoryKV, fakeSecretBox } from "../platform/kv.js";
import { deriveAccess, type AccessInput } from "./access.js";
import { HttpBillingProvider } from "./http-provider.js";
import { MockBillingProvider } from "./mock-provider.js";
import { BillingService } from "./service.js";
import { encodeToken, generateSigningKeys, verifyToken, type EntitlementPayload } from "./token.js";
import { OFFLINE_GRACE_MS, PRO_BUDGET, TRIAL_BUDGET } from "./config.js";
import { generate } from "../providers/index.js";
import { mockPost, startMockServer, type MockServer } from "../testing/stores.js";
import type { AccessState } from "../shared/ipc-contract.js";

const HOUR = 60 * 60 * 1000;

function payload(over: Partial<EntitlementPayload> = {}): EntitlementPayload {
  return {
    v: 1,
    iid: "install-1",
    plan: "trial",
    budget: TRIAL_BUDGET,
    used: 0,
    periodStart: 0,
    periodEnd: null,
    renews: false,
    iat: 1_000,
    exp: 1_000 + OFFLINE_GRACE_MS,
    ...over,
  };
}

// --- token ---

test("a signed token verifies; a tampered one does not", () => {
  const keys = generateSigningKeys();
  const token = encodeToken(payload(), keys.privateKey);
  const ok = verifyToken(token, [keys.publicKeyPem]);
  assert.equal(ok.ok, true);

  const [v, body, sig] = token.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  forged.plan = "pro";
  forged.budget = 999_999_999;
  const tampered = `${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
  assert.deepEqual(verifyToken(tampered, [keys.publicKeyPem]), { ok: false, reason: "signature" });

  const other = generateSigningKeys();
  assert.deepEqual(verifyToken(encodeToken(payload(), other.privateKey), [keys.publicKeyPem]), { ok: false, reason: "signature" });
  assert.deepEqual(verifyToken("garbage", [keys.publicKeyPem]), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyToken(`v1.${body}`, [keys.publicKeyPem]), { ok: false, reason: "malformed" });
});

// --- pure state ---

function input(over: Partial<AccessInput> = {}): AccessInput {
  return {
    now: 2_000,
    selectedProviderId: "avalet",
    ownKeyReady: false,
    token: payload(),
    tokenRejected: false,
    lastSyncAt: 1_000,
    syncFailing: false,
    exhaustedSignal: false,
    localUsedSinceIssue: 0,
    ...over,
  };
}

test("derived access: own key, trial, exhausted, expired, offline, invalid", () => {
  assert.deepEqual(
    [deriveAccess(input({ selectedProviderId: "openai", ownKeyReady: true })).tier, deriveAccess(input({ selectedProviderId: "openai", ownKeyReady: true })).status],
    ["own", "ok"],
  );
  assert.equal(deriveAccess(input({ selectedProviderId: "openai" })).status, "no-key");
  assert.equal(deriveAccess(input({ token: null })).status, "not-activated");
  assert.equal(deriveAccess(input({ token: null, tokenRejected: true })).status, "invalid");

  const trial = deriveAccess(input());
  assert.equal(trial.tier, "trial");
  assert.equal(trial.status, "ok");
  assert.equal(trial.canUseAvalet, true);
  assert.equal(trial.remaining, TRIAL_BUDGET);

  const spent = deriveAccess(input({ token: payload({ used: 400_000 }), localUsedSinceIssue: 100_000 }));
  assert.equal(spent.status, "exhausted");
  assert.equal(spent.canUseAvalet, false);
  assert.equal(deriveAccess(input({ exhaustedSignal: true })).status, "exhausted");

  assert.equal(deriveAccess(input({ token: payload({ plan: "none", budget: 0 }) })).status, "expired");
  const endedPro = payload({ plan: "pro", budget: PRO_BUDGET, periodEnd: 1_500, renews: false });
  assert.equal(deriveAccess(input({ token: endedPro })).status, "expired");

  const grace = deriveAccess(input({ syncFailing: true, now: 1_000 + OFFLINE_GRACE_MS - 1 }));
  assert.equal(grace.status, "offline-grace");
  assert.equal(grace.canUseAvalet, true);
  const tooLong = deriveAccess(input({ syncFailing: true, now: 1_000 + OFFLINE_GRACE_MS }));
  assert.equal(tooLong.status, "offline-expired");
  assert.equal(tooLong.canUseAvalet, false);
});

// --- service with the in-process mock ---

function mockService(clock: { now: number }, options: { publicKeys?: string[] } = {}) {
  const kv = new MemoryKV();
  let provider!: MockBillingProvider;
  let selected = "avalet";
  const opened: string[] = [];
  const states: AccessState[] = [];
  const service = new BillingService({
    kv,
    secrets: fakeSecretBox,
    publicKeys: options.publicKeys ?? [],
    makeProvider: (identity) => (provider = new MockBillingProvider(() => identity().installId, () => clock.now)),
    selectedProviderId: () => selected,
    ownKeyReady: () => false,
    onChange: (state) => states.push(state),
    openExternal: (url) => opened.push(url),
    now: () => clock.now,
    checkoutPollMs: 5,
  });
  return { service, provider: () => provider, kv, opened, states, select: (id: string) => (selected = id) };
}

test("mock provider: fresh install, trial, exhausted, payment, pro, period end, locked", async () => {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const { service, provider, opened } = mockService(clock);
  assert.equal(service.access().status, "not-activated");
  assert.equal(service.proxyToken(), null);

  let state = await service.activateTrial();
  assert.equal(state.tier, "trial");
  assert.equal(state.status, "ok");
  assert.ok(service.proxyToken());
  assert.deepEqual(service.tierOf("avalet"), { tier: "avalet", trial: true });
  assert.deepEqual(service.tierOf("openai"), { tier: "own", trial: false });

  // Local usage moves the counter between refreshes.
  service.noteAvaletUsage(100_000);
  assert.equal(service.access().remaining, TRIAL_BUDGET - 100_000);

  provider().useTokens(TRIAL_BUDGET);
  state = await service.refresh();
  assert.equal(state.status, "exhausted");
  assert.equal(service.proxyToken(), null, "no calls once the budget is gone");

  state = await service.checkout("pro");
  assert.equal(opened.length, 1);
  assert.equal(state.checkoutPending, true);
  provider().completeCheckout("succeed");
  await new Promise((r) => setTimeout(r, 30));
  state = service.access();
  assert.equal(state.tier, "pro");
  assert.equal(state.status, "ok");
  assert.equal(state.budget, PRO_BUDGET);
  assert.equal(state.checkoutPending, false);

  // The user cancels; at the end of the period the plan ends.
  provider().cancelSubscription();
  clock.now += 31 * 24 * HOUR;
  state = await service.refresh();
  assert.equal(state.status, "expired");
  assert.equal(state.canUseAvalet, false);
  service.dispose();
});

test("mock provider: a failed payment changes nothing", async () => {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const { service, provider } = mockService(clock);
  await service.activateTrial();
  await service.checkout("pro");
  provider().completeCheckout("fail");
  const state = await service.refresh();
  assert.equal(state.tier, "trial");
  service.dispose();
});

test("offline: works for 72 hours on the last token, then back to own key; a refresh recovers", async () => {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const { service, provider } = mockService(clock);
  await service.activateTrial();
  provider().offline = true;
  clock.now += 10 * HOUR;
  let state = await service.refresh();
  assert.equal(state.status, "offline-grace");
  assert.equal(state.canUseAvalet, true);
  clock.now += 63 * HOUR;
  state = await service.refresh();
  assert.equal(state.status, "offline-expired");
  assert.equal(service.proxyToken(), null);
  provider().offline = false;
  state = await service.refresh();
  assert.equal(state.status, "ok");
  service.dispose();
});

test("a token signed by an unknown key is rejected", async () => {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const kv = new MemoryKV();
  const stranger = generateSigningKeys();
  const service = new BillingService({
    kv,
    secrets: fakeSecretBox,
    publicKeys: [],
    makeProvider: (identity) => ({
      getEntitlement: async () => encodeToken(payload({ iid: identity().installId, plan: "pro", budget: PRO_BUDGET }), stranger.privateKey),
      refresh: async () => encodeToken(payload({ iid: identity().installId }), stranger.privateKey),
      startCheckout: async () => "https://x",
      cancelInfo: async () => ({ active: false, renews: false, periodEnd: null, manageUrl: null }),
      plans: async () => ({ plans: [], trialBudget: TRIAL_BUDGET }),
    }),
    selectedProviderId: () => "avalet",
    ownKeyReady: () => false,
    onChange: () => {},
    openExternal: () => {},
    now: () => clock.now,
  });
  const state = await service.activateTrial();
  assert.equal(state.status, "invalid");
  assert.equal(service.proxyToken(), null);
  service.dispose();
});

test("the install secret is stored only encrypted", async () => {
  const clock = { now: Date.UTC(2026, 8, 1) };
  const { service, kv } = mockService(clock);
  await service.activateTrial();
  const stored = kv.get("billing") as Record<string, unknown>;
  assert.equal(typeof stored.installSecretEnc, "string");
  assert.equal("installSecret" in stored, false);
  service.dispose();
});

// --- HTTP provider against server-mock (the documented contract) ---

let server: MockServer | null = null;
after(async () => {
  await server?.close();
});

async function llmCall(url: string, token: string): Promise<unknown> {
  try {
    return await generate({
      providerId: "avalet",
      apiKey: token,
      baseUrl: `${url}/v1/llm`,
      model: "avalet-fast",
      systemPrompt: "live copilot",
      transcript: "Нам нужен дневной лимит.",
      signal: AbortSignal.timeout(5_000),
      onDelta: () => {},
    });
  } catch (error) {
    return error;
  }
}

test("server contract: trial, proxy metering, 402 paywall, mock payment, pro, period end, offline grace, tampered token", async () => {
  server = await startMockServer();
  const mock = server;
  const kv = new MemoryKV();
  let skew = 0;
  const now = () => mock.now() + skew;
  const service = new BillingService({
    kv,
    secrets: fakeSecretBox,
    publicKeys: [mock.publicKeyPem],
    makeProvider: (identity) => new HttpBillingProvider(mock.url, identity),
    selectedProviderId: () => "avalet",
    ownKeyReady: () => false,
    onChange: () => {},
    openExternal: () => {},
    now,
    checkoutPollMs: 20,
  });

  // Fresh install -> trial.
  let state = await service.activateTrial();
  assert.equal(state.tier, "trial");
  assert.equal(state.budget, TRIAL_BUDGET);
  assert.equal(state.price.amount, 990);
  const installId = [...mock.installs.keys()][0];

  // A proxied call is metered by the server.
  const token = service.proxyToken()!;
  const result = (await llmCall(mock.url, token)) as { text: string; usage: { inputTokens: number } };
  assert.match(result.text, /лимит/);
  assert.ok(result.usage.inputTokens > 0);
  assert.ok(mock.installs.get(installId)!.used > 0);

  // Budget used up on the server: the proxy answers 402, the refresh shows it.
  await mockPost(mock, "/mock/usage", { installId, weighted: TRIAL_BUDGET });
  const refused = await llmCall(mock.url, token);
  assert.equal((refused as { status?: number }).status, 402);
  service.markExhausted();
  state = await service.refresh();
  assert.equal(state.status, "exhausted");

  // Paywall -> checkout -> mock payment -> unlocked.
  const opened: string[] = [];
  (service as unknown as { deps: { openExternal: (u: string) => void } }).deps.openExternal = (u) => opened.push(u);
  await service.checkout("pro");
  assert.match(opened[0], /\/mock\/checkout\//);
  const session = opened[0].split("/").pop();
  await mockPost(mock, `/mock/checkout/${session}/succeed`, {});
  for (let i = 0; i < 50 && service.access().tier !== "pro"; i++) await new Promise((r) => setTimeout(r, 20));
  state = service.access();
  assert.equal(state.tier, "pro");
  assert.equal(state.status, "ok");
  const proResult = (await llmCall(mock.url, service.proxyToken()!)) as { text: string };
  assert.ok(proResult.text);
  const info = await service.cancelInfo();
  assert.equal(info.active, true);
  assert.equal(info.renews, true);

  // Renewal: the period rolls over and the budget resets.
  await mockPost(mock, "/mock/clock", { advanceMs: 31 * 24 * HOUR });
  state = await service.refresh();
  assert.equal(state.tier, "pro");
  assert.equal(state.used, 0);

  // Cancelled: at the next period end it locks.
  await mockPost(mock, "/mock/cancel", { installId });
  await mockPost(mock, "/mock/clock", { advanceMs: 31 * 24 * HOUR });
  state = await service.refresh();
  assert.equal(state.status, "expired");
  const locked = await llmCall(mock.url, (kv.get("billing") as { token: string }).token);
  assert.equal((locked as { status?: number }).status, 403);

  // Offline: grace for 72 hours on the last token, then own-key mode.
  await mockPost(mock, "/mock/offline", { offline: true });
  await service.checkout("pro").catch(() => {});
  state = await service.refresh();
  assert.ok(["expired", "offline-grace"].includes(state.status));
  await mockPost(mock, "/mock/offline", { offline: false });
  const checkoutUrl = opened.at(-1)!;
  await service.checkout("pro");
  const session2 = opened.at(-1)!.split("/").pop();
  assert.notEqual(opened.at(-1), checkoutUrl);
  await mockPost(mock, `/mock/checkout/${session2}/succeed`, {});
  state = await service.refresh();
  assert.equal(state.tier, "pro");
  await mockPost(mock, "/mock/offline", { offline: true });
  skew = 10 * HOUR;
  state = await service.refresh();
  assert.equal(state.status, "offline-grace");
  assert.equal(state.canUseAvalet, true);
  skew = 73 * HOUR;
  state = await service.refresh();
  assert.equal(state.status, "offline-expired");
  assert.equal(service.proxyToken(), null);
  await mockPost(mock, "/mock/offline", { offline: false });
  skew = 0;
  state = await service.refresh();
  assert.equal(state.status, "ok");

  // A tampered token is refused by the server too.
  const good = service.proxyToken()!;
  const [v, body, sig] = good.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  forged.budget = 10 ** 12;
  const tampered = `${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
  assert.equal(verifyToken(tampered, [mock.publicKeyPem]).ok, false);
  const refusedTampered = await llmCall(mock.url, tampered);
  assert.equal((refusedTampered as { status?: number }).status, 401);
  service.dispose();
});

test("http provider: unknown install is registered, wrong secret is refused", async () => {
  server ??= await startMockServer();
  const mock = server;
  const identity = { installId: "11111111-2222-3333-4444-555555555555", installSecret: "s".repeat(43) };
  const provider = new HttpBillingProvider(mock.url, () => identity);
  const token = await provider.getEntitlement();
  assert.equal(verifyToken(token, [mock.publicKeyPem]).ok, true);
  const intruder = new HttpBillingProvider(mock.url, () => ({ ...identity, installSecret: "x".repeat(43) }));
  await assert.rejects(intruder.refresh(), (error: Error & { code?: string }) => error.code === "invalid_credentials");
  const unreachable = new HttpBillingProvider("http://127.0.0.1:9", () => identity);
  await assert.rejects(unreachable.refresh(), (error: Error & { code?: string }) => error.code === "network");
});
