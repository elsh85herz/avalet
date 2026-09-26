# Report: 0.2 autopilot session (2026-09-26)

Branch `release/v0.2-autopilot`, version `0.2.0-rc.1`, not tagged. Details in
`PROGRESS.md` (per step) and `DECISIONS.md` (every non-obvious choice).

## What changed

1. **Hygiene.** One IPC contract (`electron/shared/ipc-contract.ts`) for main, preload and renderer; drift fails `tsc`. IPC logic moved into a testable `AppCore`; stores take injected backends. `wip/model-manager` ported by hand and finished: states, progress, cancel, delete, auto-retry with resume, never downloads on Start. Live checklist behind a setting (Advanced on, Simple off) with trigger tests.
2. **Metering.** Real `usage` from Anthropic and OpenAI-compatible (stream, non-stream, images); labeled estimate only as fallback. Ledger per month/trial/meeting, weight table (x1/x4) in one file, cheaper background model, briefing capped at 3,500 chars, counters in Settings and overlay.
3. **Billing.** `BillingProvider` with HTTP and mock implementations, Ed25519-signed entitlements, 72 h offline grace, pure access state machine, built-in "Avalet" provider via the server proxy, paywall that keeps the transcript. `server-mock/` and `docs/dev/billing-api.md`.
4. **Product.** 4-screen first-run wizard (permissions, access with key test, model download, context + 20 s self-test), Simple level, Advanced level (`AVALET_ADVANCED=1` too), simplified overlay, i18n/copy-rules check, WCAG AA colours, keyboard focus.
5. **Evidence.** 129 unit/integration tests (integration: real fake-sidecar process, mock model and billing over HTTP), 11 Playwright E2E, 34 screenshots in `docs/screens/`, coverage script.
6. **Packaging.** `ci.yml`, `release-mac.yml` (arm64 `macos-15`, x64 `macos-15-intel`, draft release on tags), builder fixes, `MAC_VERIFY.md`, `CHANGELOG.md`.
7. **Docs.** READMEs (RU/EN) for the new flow with honest limitations; `market-check.md`.

## Verified here (Linux container, commands run)

| Command | Result |
|---|---|
| `npm ci` | ok |
| `npm run check` (typecheck + `check-i18n` + `npm test`) | ok; i18n 313 strings per language; tests 129/129 |
| `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` (after `npm run build`) | 11/11 passed |
| `npm run test:coverage` | ledger, metering, access 100%; model manager 98%; meetings store 92%; billing service 91% |
| `npx electron-builder --config electron-builder.config.mjs --linux dir` | packs; asar has only dist-electron, dist, package.json (no tests, test helpers, server-mock) |
| Typecheck after deleting a preload method | fails, as intended |
| GitHub Actions CI run 1 (commit 5e3d3cc) | every step green incl. E2E (shown "cancelled" because the next push superseded it at the end) |

## Not verifiable here (needs a Mac): see `MAC_VERIFY.md`

Real mic and system audio capture, macOS permission prompts and panes, the
bundled Python venv and a real Hugging Face download (progress, cancel,
resume on the real `huggingface_hub`), Apple Vision OCR, content protection
of the overlay, the `.dmg`/Gatekeeper path, the release workflow itself (it
runs only on macOS runners), and the upgrade from a 0.1 install.

## Known gaps and risks

- The built-in provider cannot work until a billing server exists and its public key replaces the placeholder. Trial abuse (new install = new trial) must be limited server-side.
- The entitlement token is stored unencrypted (short-lived, signed); `AVALET_BILLING_DEV_PUBKEY` lets a user make the client *display* any plan (the server still refuses). Both by design, documented.
- Download progress assumes `.incomplete` files grow; set `HF_HUB_DISABLE_XET=1` for that. Not checked against the real hub here.
- The live checklist and suggestion timing are unverified on real meetings. Renderer audio capture has no automated test (needs WebAudio and devices).
- Screenshots come from Linux (no vibrancy); the Mac look must be checked by eye.
- 16 `npm audit` findings in transitive dev dependencies were not addressed.
- Self-review fixed: overlay window sandbox and navigation lock, double Start opening two captures, "paused" after End. Not fixed: nothing else found that loses data or money.

## Decisions needing the owner

1. **Billing server and key.** Build the server to `billing-api.md`, put its public key in `electron/billing/config.ts`. *Recommended: yes, before announcing "Avalet without keys".*
2. **Gateway.** YooKassa or CloudPayments. *Recommended: the one that supports recurring payments for your legal form with the least onboarding; this session did not compare their terms, and the client is neutral either way.*
3. **Prices and budgets.** 990 RUB/month, 500k trial, 5M Pro, x4 premium. *Recommended: keep as placeholders until a week of real usage data from own-key meetings is in the ledger.*
4. **Checklist default in Simple.** *Recommended: turn on after 3 real meetings where it marked correctly (MAC_VERIFY step 9 plus real calls).*
5. **Overlay opacity slider on the overlay in Advanced.** *Recommended: keep (you rely on it).*
6. **History in Simple.** *Recommended: keep (it is the user's data).*
7. **VPN link in the app.** The wizard links `ast-net.ru` as the README does. *Recommended: keep only if you are fine with it being in the product UI; otherwise link the README section.*
8. **market-check.md public or private.** *Recommended: private.*
9. **Release workflow cost.** macOS minutes are billed at a multiplier in a private repo. *Recommended: run it only manually or on tags (as configured).*
10. **Squash merge message.** *Recommended: squash `release/v0.2-autopilot` into `main` with a plain message, then run the commands in `CLEANUP.md`.*

## Three next steps

1. Run `MAC_VERIFY.md` on the `.dmg` from the Release (macOS) workflow and fix what it finds.
2. Use it on real meetings with an own key for a week; tune the checklist and suggestion timing from the ledger and logs.
3. Stand up the billing server (contract ready, mock shows the flows), then enable the built-in provider.

---

# 0.2.0-rc.2 (2026-09-26, CLOUD_TASK_2.md)

Branch `release/v0.2-autopilot`, version `0.2.0-rc.2`, not tagged. One commit
per step; details in `PROGRESS.md` ("rc.2") and `DECISIONS.md` (section "0.2.0-rc.2" and the replaced lines).

## What changed

1. **Simple overlay has every meeting control.** Labelled Pause/Resume and End, Auto, language, opacity, screenshot, notes, all four quick actions, in both levels. End from the overlay closes the meeting, releases the mic, hides the overlay. Main window header: Pause/Resume on every screen while a meeting runs.
2. **Simple Settings complete.** Access and key test, model in use (read-only), meeting type/role/agenda, all speech models with delete and a plain guide, export folder (new setting), opacity, language. Wizard: "Other models can be chosen later in Settings".
3. **Built-in provider not a dead end.** `builtInProviderAvailable` (false with the placeholder URL/key unless `AVALET_BILLING_URL` or the mock): Avalet shows "Coming soon", no billing call at all; an install with Avalet selected goes back to an own key. With an own key billing is never contacted by itself; failures logged once per session.
4. **One clear problem.** Pure `problems.ts`: fixed order, one sentence, one button, readiness line. Budget wording only for an exhausted Avalet plan. "Key is not checked yet" + Check (per-key check state). Start never opens the mic without a ready model and waits for a download in progress. Wizard sample no longer about limits and shown with its conversation.
5. **Robustness.** Resume after cancel tested (unit + E2E); log skips identical lines (10 min, with a count) and redacts key-shaped strings; canary test for meeting text and key.
6. **Docs.** Version, CHANGELOG, READMEs (RU/EN), MAC_VERIFY (steps 4, 7a, 7b, 7c, 8a), CLEANUP (`CLOUD_TASK_2.md`).

## Verified here (Linux container, commands run)

| Command | Result |
|---|---|
| `npm run check` (typecheck, `check-i18n`, unit + integration) | ok; 352 strings per language; 146/146 tests (was 129) |
| `npm run build` then `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` | 14/14 (was 11): Simple overlay controls, pause/end from overlay and header, auto off, Simple Settings items, no-billing-server state incl. app log, model missing/waiting, unchecked key, cancel/continue, paywall with Pause/End visible, mock trial/Pro |
| `npm run test:coverage` | problems 97%, access 100%, billing config 100%, billing service 95%, log 96%, model manager 98% |
| `test/problems.test.ts` | own-key mode cannot produce limit/budget/"used up" text in any status, key state or model state, RU and EN |
| `electron/billing/availability.test.ts` | zero billing calls when unavailable, and in own-key mode at startup, on the timer and on refresh |
| `electron/log-hygiene.test.ts` | canary transcript text and key absent from the log after a full meeting, present in the exports |
| Screenshots | regenerated in `docs/screens/` (new: overlay controls, strip paused, auto off, coming soon, key unchecked, home ready, start waits, model partial) |

## Needs a Mac (`MAC_VERIFY.md`)

The overlay rows at 380 px with macOS fonts (checked only with Linux fonts);
the mic indicator going off after End from the overlay (step 7b; E2E uses a
fake capture); a refused Start leaving the mic closed (7c); permission polling
reflecting System Settings changes; the export folder picker and the save
dialog opening in it; the normal launch showing "Coming soon" with a clean log
(8a); everything from the rc.1 list (real capture, Hugging Face download,
Vision OCR, `.dmg`).

## Known gaps

- "Build-time" availability is the two constants in `electron/billing/config.ts`; there is no separate build flag. A build that replaces both turns Avalet on.
- Keys saved before rc.2 show "Key is not checked yet" once, until Check or the first answer.
- The owner's "question about a limit" was read two ways (budget text; the wizard sample about a card limit); both are addressed, the exact screen was not available here.
- Opacity keeps its label "Opacity" (the task calls it brightness).
- Not touched on purpose: billing server, prices, gateway, token hint, checklist default, speech engine, `npm audit` findings in dev dependencies.

## Decisions needing the owner

1. Avalet in the wizard: disabled with "Coming soon" (current) or hidden. *Recommended: keep disabled, it tells users what is coming.*
2. End without a confirmation (both windows). *Recommended: keep; nothing is lost, the meeting stays in History.*
3. Readiness line always visible on the Simple home. *Recommended: keep for rc.2, revisit after a week of use.*

## Next steps

1. Run `MAC_VERIFY.md` (new steps 4, 7a to 7c, 8a first) on the rc.2 `.dmg`.
2. A week of real meetings in Simple with an own key; then decide the checklist default.
3. Billing server and Robokassa integration as a separate task; replacing the two config constants turns the built-in provider on.
