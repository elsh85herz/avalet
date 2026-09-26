# Avalet billing server: API contract (v1)

Status: contract for the server that is not built yet. The client side is
implemented (`electron/billing/`), and `server-mock/server.mjs` implements
this contract for tests and E2E. Dates and prices below are placeholders.

## Principles

- **The server enforces, the client shows.** The desktop client is open source
  (AGPL-3.0); anyone can change it. So every limit is enforced on the server,
  in the LLM proxy. The client only displays the state and avoids sending
  calls that would be refused.
- **No card data in the client.** Checkout is a page opened in the system
  browser. The client learns the result only by refreshing its entitlement.
- **Gateway neutral.** The server integrates a Russian payment gateway
  (YooKassa or CloudPayments). The client does not know or care which; it only
  opens the `url` the server returns.
- **No transcripts on the server.** The LLM proxy forwards the request to the
  model provider and returns the answer. It stores counters only: install id,
  plan, weighted tokens per period, timestamps. It must not log request or
  response bodies (they contain meeting transcripts).

## Tiers

| Tier | Where it comes from | Budget | Price |
|---|---|---|---|
| Own key | user's provider key, no server involved | unlimited | free |
| Trial | first activation of the built-in provider | 500,000 weighted tokens, one-off, no time limit | free, no card |
| Pro | paid through checkout | 5,000,000 weighted tokens per 30-day period | from `/v1/plans` (placeholder 990 RUB/month) |

Weighted tokens = (input + output tokens) x model weight. Weights: flash-class
models x1, premium models x4 (same table as
`electron/metering/model-weights.ts`). The built-in models are `avalet-fast`
(x1) and `avalet-premium` (x4); the server maps them to real provider models.

## Identity

On first use the client creates an **install id** (UUID) and an **install
secret** (32 random bytes, base64url) and stores the secret encrypted by the OS
keychain. Every authenticated request carries:

```
Authorization: Bearer <install secret>
X-Avalet-Install: <install id>
```

The server stores only a hash of the secret.

Abuse note: creating a new install gives a new trial. The server should limit
trials per IP and per time window, and may later require a verified email or
phone for the trial. The client does not need to change for that.

## Entitlement token

```
v1.<base64url(JSON payload)>.<base64url(Ed25519 signature)>
```

The signature covers the ASCII string `v1.<payload part>`. The client verifies
it with the public key embedded in `electron/billing/config.ts`
(`PRODUCTION_PUBLIC_KEY`, currently a placeholder whose private key does not
exist: **replace it with the server's key before launch**).

Payload:

| Field | Type | Meaning |
|---|---|---|
| `v` | 1 | format version |
| `iid` | string | install id the token was issued to; the client rejects tokens for another install |
| `plan` | `"trial"` \| `"pro"` \| `"none"` | `none` = no active plan |
| `budget` | number | weighted tokens for the period (trial: one-off) |
| `used` | number | weighted tokens used when the token was issued |
| `periodStart` | ms | start of the period |
| `periodEnd` | ms \| null | end of the paid period; `null` for the trial |
| `renews` | boolean | Pro renews at `periodEnd` unless cancelled |
| `iat` | ms | issued at |
| `exp` | ms | `iat` + 72 h. The proxy refuses expired tokens; the client stops using it (offline grace ends) |

The client adds its own weighted usage since `iat` to `used` for display, and
takes the server's number again on every refresh.

## Endpoints

All bodies are JSON. Errors: `{"error": {"code": "<code>", "message": "<text>"}}`.

### `GET /v1/plans` (no auth)

```json
{ "plans": [{ "id": "pro", "amount": 990, "currency": "RUB", "period": "month", "budget": 5000000 }],
  "trialBudget": 500000 }
```

### `POST /v1/installs` (no auth)

Registers an install and starts its trial.

Request: `{ "installId": "<uuid>", "installSecret": "<secret>" }`
Response `201` (new) or `200` (same id and secret again): `{ "token": "<entitlement>" }`
Errors: `400 bad_request`, `409 install_exists` (id taken with another secret), `429 too_many_trials`.

### `GET /v1/entitlement`

Current token for this install (issued fresh on every call).
Response: `{ "token": "<entitlement>" }`
Errors: `404 unknown_install` (the client then calls `POST /v1/installs`), `401 invalid_credentials`.

### `POST /v1/checkout`

Request: `{ "plan": "pro" }` (for a Pro user whose budget is used up, the
server may sell a top-up on the same page).
Response: `{ "url": "https://...", "sessionId": "..." }`. The client opens
`url` in the browser and polls `GET /v1/entitlement` every 5 s for up to 15
minutes, and on "I have paid".

### `GET /v1/subscription`

Response: `{ "active": true, "renews": true, "periodEnd": 1735689600000, "manageUrl": "https://..." }`.
`manageUrl` is where the user cancels or changes the plan (the server's own
page or the gateway's).

### `POST /v1/llm/chat/completions`

The LLM proxy, OpenAI Chat Completions compatible (streaming with
`stream_options.include_usage` and non-streaming). Auth:
`Authorization: Bearer <entitlement token>` (not the install secret).

The proxy:
1. verifies the token signature and `exp`, looks up the install;
2. refuses when the plan is `none` (`403 plan_expired`) or the period budget
   is used up (`402 budget_exhausted`);
3. forwards to the real model, streams the answer back, including `usage`;
4. adds `(prompt_tokens + completion_tokens) x weight(model)` to the install's
   counter for the period.

Errors: `401 invalid_token` (bad signature, expired: client refreshes),
`402 budget_exhausted`, `403 plan_expired`, `429 rate_limited`, `503 unavailable`.

## Payment flow (server side)

1. Client: `POST /v1/checkout` -> server creates a payment with the gateway
   (amount from the plan, `metadata.installId`), returns the gateway's
   confirmation URL.
2. User pays on the gateway page in the browser.
3. Gateway -> server webhook (`payment.succeeded` / `payment.canceled`, or the
   CloudPayments `Pay` / `Fail` notifications). The server verifies the
   webhook signature / source IP, is idempotent on the payment id, and on
   success sets `plan = pro`, `budget = 5,000,000`, `used = 0`,
   `periodStart = now`, `periodEnd = now + 30 days`, `renews = true`.
4. Client's next `GET /v1/entitlement` returns the Pro token.
5. Renewal: a recurring payment near `periodEnd`; on success the period rolls
   over (`used = 0`). On cancel, `renews = false` and the plan ends at
   `periodEnd` (`plan = none`).

## Client behaviour (for reference)

| State | Shown | Built-in provider |
|---|---|---|
| not activated | "start with 500,000 free tokens" | off |
| trial / pro, ok | tokens left, renewal date | on |
| budget used up (402 or local count) | paywall: buy more, or use own key; transcript keeps recording | off |
| period ended | renew, or use own key | off |
| server unreachable, token younger than 72 h | "works until <date>" | on |
| server unreachable longer | back to own-key mode, clear message, no silent switch to a paid key | off |
| token does not verify | "could not be verified", check again or own key | off |

Tests: `electron/billing/billing.test.ts` runs this whole list against
`server-mock` (fresh install, trial, proxy metering, 402, checkout, mock
payment, Pro, renewal, cancel and period end, offline grace, tampered token).
