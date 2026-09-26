// TEST-ONLY mock of the Avalet billing server and LLM proxy.
// Not part of the app: never packaged (electron-builder only ships
// dist-electron/ and dist/), no dependencies, keeps everything in memory.
// It implements the contract in docs/dev/billing-api.md so the client's
// HttpBillingProvider, the access state machine and E2E can run end to end.
//
//   node server-mock/server.mjs [--port 8787]
// prints one JSON line: {"url": "...", "publicKey": "-----BEGIN PUBLIC KEY-----..."}
// Start the app with AVALET_BILLING_URL=<url> AVALET_BILLING_DEV_PUBKEY=<publicKey>.
//
// Simulation endpoints (mock only, not in the real contract):
//   GET  /mock/checkout/<session>            page with Pay / Fail / Cancel buttons
//   POST /mock/checkout/<session>/<succeed|fail|cancel>
//   POST /mock/clock        {"advanceMs": n}  moves the server clock
//   POST /mock/usage        {"installId", "weighted"} spends budget
//   POST /mock/cancel       {"installId"}     stops renewal (like the user cancelling)
//   POST /mock/offline      {"offline": true} every contract endpoint answers 503
//   GET  /mock/state                          all installs, for assertions
//
// Also serves a plain OpenAI-compatible fake model at /openai/v1/chat/completions
// (no auth) so tests can use the "own key" path against the same process.

import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import http from "node:http";

export const TRIAL_BUDGET = 500_000;
export const PRO_BUDGET = 5_000_000;
export const PRO_PRICE = { amount: 990, currency: "RUB", period: "month" };
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
const WEIGHTS = [
  [/^avalet-premium/, 4],
  [/^avalet-/, 1],
];

function weightOf(model) {
  for (const [pattern, weight] of WEIGHTS) if (pattern.test(model)) return weight;
  return 4;
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const tokensOf = (text) => Math.ceil(String(text ?? "").length / 3);

/** Canned model answers, chosen by what the system prompt asks for. */
export function fakeCompletion(system, user) {
  if (/single word OK/i.test(system)) return "OK";
  if (/live checklist/i.test(system)) {
    return JSON.stringify({
      agenda: [{ index: 1, state: "closed", note: "дневной лимит" }],
      actions: [{ task: "Прислать описание процесса колл-центра", owner: "Собеседник", due: "до пятницы" }],
    });
  }
  if (/writing the outcome of a meeting/i.test(system)) {
    const marker = (system.match(/write exactly (\S+) and then/) ?? [])[1] ?? "@@AVALET_JSON@@";
    return [
      "Обсуждения",
      "Тема: Какой лимит меняет клиент",
      "- Дневной лимит, меняется в приложении (Собеседник).",
      "Решения",
      "- Выше 300 тысяч подтверждение звонком из колл-центра.",
      "Открытые вопросы",
      "- Кто владелец интеграции с колл-центром?",
      "Риски",
      "- нет",
      marker,
      JSON.stringify({
        agenda: [{ index: 1, closed: true, note: "дневной" }],
        actions: [{ task: "Прислать описание процесса колл-центра", owner: "Собеседник", due: "до пятницы" }],
      }),
    ].join("\n");
  }
  const hasScreen = Array.isArray(user);
  // The wizard's "Try it" sample (electron/shared/selftest.ts).
  if (userText(user).includes("выгружать отчёт")) {
    return "Уточните: регион берётся из профиля менеджера или выбирается при выгрузке? И в каком формате нужен отчёт: Excel или PDF?";
  }
  return hasScreen
    ? "На экране форма лимитов: не хватает поля для порога подтверждения."
    : "Уточните: лимит дневной или разовый, и кто подтверждает изменение выше порога?";
}

function userText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (part?.type === "text" ? part.text : "")).join("\n");
  return "";
}

export function createMockBillingServer(options = {}) {
  const keys = options.privateKey
    ? { privateKey: options.privateKey, publicKeyPem: options.publicKeyPem }
    : (() => {
        const pair = generateKeyPairSync("ed25519");
        return { privateKey: pair.privateKey, publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
      })();
  let clockOffset = 0;
  let offline = false;
  const now = () => Date.now() + clockOffset;
  const installs = new Map();
  const checkouts = new Map();
  const llmCalls = [];
  let baseUrl = "";

  function rollPeriod(install) {
    if (install.plan === "pro" && install.periodEnd !== null && now() >= install.periodEnd) {
      if (install.renews) {
        install.periodStart = install.periodEnd;
        install.periodEnd = install.periodStart + PERIOD_MS;
        install.used = 0;
      } else {
        install.plan = "none";
        install.budget = 0;
        install.used = 0;
        install.periodEnd = null;
      }
    }
  }

  function issueToken(install) {
    rollPeriod(install);
    const iat = now();
    const payload = {
      v: 1,
      iid: install.installId,
      plan: install.plan,
      budget: install.budget,
      used: install.used,
      periodStart: install.periodStart,
      periodEnd: install.periodEnd,
      renews: install.renews,
      iat,
      exp: iat + TOKEN_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signed = `v1.${body}`;
    const signature = sign(null, Buffer.from(signed, "utf8"), keys.privateKey).toString("base64url");
    return `${signed}.${signature}`;
  }

  function parseToken(token) {
    const parts = String(token ?? "").split(".");
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      // The mock trusts only tokens it issued: the signature must match a fresh signature.
      const expected = sign(null, Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"), keys.privateKey).toString("base64url");
      return expected === parts[2] ? payload : null;
    } catch {
      return null;
    }
  }

  function send(res, status, body, headers = {}) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { "content-type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json", ...headers });
    res.end(text);
  }

  const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

  async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function authInstall(req) {
    const id = req.headers["x-avalet-install"];
    const secret = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const install = installs.get(id);
    if (!install) return { error: [404, "unknown_install", "this install is not registered"] };
    if (install.secretHash !== sha256(secret)) return { error: [401, "invalid_credentials", "install secret does not match"] };
    return { install };
  }

  async function completion(req, res, body, { metered }) {
    const system = body.messages?.find((m) => m.role === "system")?.content ?? "";
    const userContent = body.messages?.find((m) => m.role === "user")?.content;
    const text = fakeCompletion(String(system), userContent);
    const usage = { prompt_tokens: tokensOf(system) + tokensOf(userText(userContent)) + (Array.isArray(userContent) ? 1000 : 0), completion_tokens: tokensOf(text) };
    llmCalls.push({ model: body.model, system: String(system).slice(0, 80), usage, metered: Boolean(metered) });
    if (metered) {
      metered.used += (usage.prompt_tokens + usage.completion_tokens) * weightOf(String(body.model));
    }
    if (body.stream === false) {
      send(res, 200, { choices: [{ message: { role: "assistant", content: text } }], usage });
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const pieces = text.match(/.{1,24}/gsu) ?? [text];
    for (const piece of pieces) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      if (options.llmDelayMs) await new Promise((r) => setTimeout(r, options.llmDelayMs));
    }
    if (body.stream_options?.include_usage) res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    // --- plain fake model for the own-key path ---
    if (req.method === "POST" && path === "/openai/v1/chat/completions") {
      const body = await readJson(req);
      if (!body) return fail(res, 400, "bad_json", "invalid JSON");
      return completion(req, res, body, { metered: null });
    }

    // --- simulation hooks ---
    if (path.startsWith("/mock/")) {
      if (req.method === "GET" && path === "/mock/state") {
        return send(res, 200, { now: now(), offline, installs: [...installs.values()].map(({ secretHash, ...rest }) => rest), llmCalls });
      }
      const checkoutPage = path.match(/^\/mock\/checkout\/([0-9a-f-]+)$/);
      if (req.method === "GET" && checkoutPage) {
        const id = checkoutPage[1];
        return send(
          res,
          200,
          `<!doctype html><meta charset="utf-8"><title>Mock checkout</title><h1>Mock checkout ${id}</h1>` +
            ["succeed", "fail", "cancel"]
              .map((a) => `<form method="post" action="/mock/checkout/${id}/${a}"><button>${a}</button></form>`)
              .join(""),
        );
      }
      const checkoutAction = path.match(/^\/mock\/checkout\/([0-9a-f-]+)\/(succeed|fail|cancel)$/);
      if (req.method === "POST" && checkoutAction) {
        const checkout = checkouts.get(checkoutAction[1]);
        if (!checkout || checkout.status !== "pending") return fail(res, 404, "unknown_checkout", "no such pending checkout");
        checkout.status = checkoutAction[2] === "succeed" ? "paid" : checkoutAction[2] === "fail" ? "failed" : "cancelled";
        // What the gateway webhook does on a real server.
        if (checkout.status === "paid") {
          const install = installs.get(checkout.installId);
          install.plan = "pro";
          install.budget = PRO_BUDGET;
          install.used = 0;
          install.periodStart = now();
          install.periodEnd = install.periodStart + PERIOD_MS;
          install.renews = true;
        }
        return send(res, 200, { status: checkout.status });
      }
      const body = (await readJson(req)) ?? {};
      if (req.method === "POST" && path === "/mock/clock") {
        clockOffset += Number(body.advanceMs ?? 0);
        return send(res, 200, { now: now() });
      }
      if (req.method === "POST" && path === "/mock/usage") {
        const install = installs.get(body.installId) ?? [...installs.values()][0];
        if (!install) return fail(res, 404, "unknown_install", "no installs");
        install.used += Number(body.weighted ?? 0);
        return send(res, 200, { used: install.used });
      }
      if (req.method === "POST" && path === "/mock/cancel") {
        const install = installs.get(body.installId) ?? [...installs.values()][0];
        if (!install) return fail(res, 404, "unknown_install", "no installs");
        install.renews = false;
        return send(res, 200, { renews: false });
      }
      if (req.method === "POST" && path === "/mock/offline") {
        offline = Boolean(body.offline);
        return send(res, 200, { offline });
      }
      return fail(res, 404, "not_found", "unknown mock endpoint");
    }

    if (offline) return fail(res, 503, "unavailable", "mock server is offline");

    // --- contract endpoints ---
    if (req.method === "GET" && path === "/v1/plans") {
      return send(res, 200, { plans: [{ id: "pro", ...PRO_PRICE, budget: PRO_BUDGET }], trialBudget: TRIAL_BUDGET });
    }

    if (req.method === "POST" && path === "/v1/installs") {
      const body = await readJson(req);
      if (!body || typeof body.installId !== "string" || typeof body.installSecret !== "string" || body.installSecret.length < 16) {
        return fail(res, 400, "bad_request", "installId and installSecret are required");
      }
      const existing = installs.get(body.installId);
      if (existing && existing.secretHash !== sha256(body.installSecret)) return fail(res, 409, "install_exists", "install id taken");
      const install = existing ?? {
        installId: body.installId,
        secretHash: sha256(body.installSecret),
        plan: "trial",
        budget: TRIAL_BUDGET,
        used: 0,
        periodStart: now(),
        periodEnd: null,
        renews: false,
        createdAt: now(),
      };
      installs.set(install.installId, install);
      return send(res, existing ? 200 : 201, { token: issueToken(install) });
    }

    if (req.method === "GET" && path === "/v1/entitlement") {
      const auth = authInstall(req);
      if (auth.error) return fail(res, ...auth.error);
      return send(res, 200, { token: issueToken(auth.install) });
    }

    if (req.method === "POST" && path === "/v1/checkout") {
      const auth = authInstall(req);
      if (auth.error) return fail(res, ...auth.error);
      const body = await readJson(req);
      if (body?.plan !== "pro") return fail(res, 400, "unknown_plan", "only 'pro' exists");
      const id = randomUUID();
      checkouts.set(id, { id, installId: auth.install.installId, plan: "pro", status: "pending" });
      return send(res, 200, { url: `${baseUrl}/mock/checkout/${id}`, sessionId: id });
    }

    if (req.method === "GET" && path === "/v1/subscription") {
      const auth = authInstall(req);
      if (auth.error) return fail(res, ...auth.error);
      const install = auth.install;
      rollPeriod(install);
      const active = install.plan === "pro";
      return send(res, 200, {
        active,
        renews: active && install.renews,
        periodEnd: active ? install.periodEnd : null,
        manageUrl: active ? `${baseUrl}/mock/manage` : null,
      });
    }

    if (req.method === "POST" && path === "/v1/llm/chat/completions") {
      const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const payload = parseToken(token);
      if (!payload) return fail(res, 401, "invalid_token", "token does not verify");
      if (now() >= payload.exp) return fail(res, 401, "invalid_token", "token expired, refresh it");
      const install = installs.get(payload.iid);
      if (!install) return fail(res, 401, "invalid_token", "unknown install");
      rollPeriod(install);
      if (install.plan === "none") return fail(res, 403, "plan_expired", "no active plan");
      if (install.used >= install.budget) return fail(res, 402, "budget_exhausted", "the budget for this period is used up");
      const body = await readJson(req);
      if (!body) return fail(res, 400, "bad_json", "invalid JSON");
      return completion(req, res, body, { metered: install });
    }

    return fail(res, 404, "not_found", `no route for ${req.method} ${path}`);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) fail(res, 500, "internal", String(error?.message ?? error));
      else res.end();
    });
  });

  return {
    publicKeyPem: keys.publicKeyPem,
    installs,
    llmCalls,
    now,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address();
          baseUrl = `http://${host}:${address.port}`;
          resolve(baseUrl);
        });
      });
    },
    get url() {
      return baseUrl;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 8787;
  const mock = createMockBillingServer({ llmDelayMs: Number(process.env.MOCK_LLM_DELAY_MS ?? 30) });
  const url = await mock.listen(port);
  process.stdout.write(`${JSON.stringify({ url, publicKey: mock.publicKeyPem })}\n`);
}
