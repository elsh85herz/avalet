# server-mock (test only)

A dependency-free, in-memory stand-in for the Avalet billing server and LLM
proxy. It implements the contract in `docs/dev/billing-api.md` so the client's
billing code, the paywall and E2E can run without a real server.

- Not part of the app: electron-builder packs only `dist-electron/` and `dist/`.
- No real payments, no real model calls: payments are buttons on a local page,
  the "model" returns canned Russian text with token counts.
- Signs tokens with a key pair it makes at startup; nothing secret is stored.

Run it: `npm run mock:server` (prints `{"url", "publicKey"}`), then start the
app with `AVALET_BILLING_URL=<url>` and `AVALET_BILLING_DEV_PUBKEY=<publicKey>`.
The endpoints under `/mock/` simulate payment success, failure, cancel, the
end of a period, usage and an outage (see the header of `server.mjs`).
