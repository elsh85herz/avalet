# Progress (task scaffolding, delete before going public)

Resume rule: read `CLOUD_TASK.md`, then this file, then `DECISIONS.md`. Work continues from "Next".

## Environment facts (cloud container, 2026-09-26)

- Node 22.22.2, npm 10.9.7, Python 3.11.15, Linux x64.
- `npm ci` works (npm registry reachable). Electron 33 binary downloads fine.
- Electron runs under Xvfb (`xvfb-run -a electron . --no-sandbox`); the existing
  `AVALET_SCREENSHOT_DIR` mode produced all 10 PNGs.
- `origin/wip/model-manager` exists (8aeb1ae), diverged from main at 69d1cf5.

## Baseline (before any change)

- `npm ci`: ok (16 audit warnings from transitive dev deps, not addressed).
- `npm run typecheck`: ok.
- `npm test`: 45 tests, 45 pass.

## Done

- Step 1 (baseline and hygiene):
  - Shared IPC contract `electron/shared/ipc-contract.ts`; preload/renderer/main use it; drift fails `tsc` (checked).
  - `electron/app-core.ts` holds all non-window IPC handlers; `main.ts` is a thin shell; a test asserts every channel has exactly one handler.
  - Stores injectable (MemoryKV + fake keychain in tests); settings schema v1 with migration (existing key => Advanced, no wizard).
  - Speech model manager (ported from `wip/model-manager` by hand): states absent/downloading/ready/error, progress, cancel, delete, auto-retry with resume; sidecar never downloads on Start (`model_not_downloaded`), Start returns `{ok:false, reason:"model-missing"}`.
  - Live checklist behind a setting (Advanced on, Simple off), background model, tests for all trigger rules.
  - Fixtures: `test/fixtures/fake-sidecar.mjs`, `test/fixtures/fake-model-download.mjs` (sparse files).
  - Verified: `npm run typecheck` ok, `npm test` 81/81, `npm run build` ok, app runs under Xvfb (screenshot mode).

- Step 2 (token metering):
  - Real `usage` from Anthropic and OpenAI-compatible, streaming and non-streaming, image requests; labeled estimate only as fallback.
  - `electron/metering/`: weight table, ledger (month / trial / meeting / recent), `meteredGenerate` wraps every call with its purpose.
  - Background (checklist) model per provider, Advanced setting; briefing capped at 3,500 chars in live calls.
  - Counters: Settings (month, Advanced breakdown), overlay (this meeting, muted).
  - Budget exhaustion: typed `ProviderHttpError` with server code (`budget_exhausted`); the UI reaction (buy more / own key) is wired in Step 3 with the access state.
  - Verified: typecheck ok, `npm test` 97/97.

- Step 3 (billing, payment-provider neutral):
  - `electron/billing/`: token (Ed25519), config (placeholder key and URL), `BillingProvider` interface, `HttpBillingProvider`, `MockBillingProvider`, pure `deriveAccess()`, `BillingService` (identity, refresh, checkout polling, offline grace).
  - "Avalet" provider in the provider list: OpenAI-compatible proxy at `<billing>/v1/llm` with the entitlement token; `provider-credentials.ts` blocks calls when access says no.
  - Paywall: overlay banner (buy / own key / close), access card in Settings; transcript unaffected.
  - `server-mock/` (dependency-free, test-only): contract endpoints, fake LLM, simulated payment/cancel/expiry/usage/outage/clock.
  - `docs/dev/billing-api.md`: endpoints, token format, webhook flow, error codes, "no transcripts on the server".
  - Key test IPC (`provider-test`) with human error text.
  - Verified: typecheck ok, `npm test` 106/106 (billing state machine against server-mock included), app starts under Xvfb.

- Step 4 (Simple level and first run):
  - `uiLevel` simple/advanced (+ `AVALET_ADVANCED=1`), first-run wizard (4 screens, skippable, Try it with mic meter and a real sample suggestion).
  - Simple main window (Start/Pause/End, meeting type, context and agenda, transcript, summary, export; one-sentence problems with one button), Simple settings, History.
  - Advanced = previous settings plus access card, background model, key test, live checklist switch, opacity, log folder.
  - Overlay simplified in Simple; paywall banner; SVG chevrons instead of arrow glyphs.
  - Shared contexts: `lib/session.tsx` (capture + start/stop), `lib/settings.tsx`.
  - `scripts/check-i18n.mjs`; contrast, keyboard and no-layout-jump E2E checks.
  - Fixed: after "End meeting" the windows kept showing "paused" (state was not re-broadcast).
  - Verified: `npm run check` ok (typecheck, i18n 313 strings each, 106 unit tests); `xvfb-run npx playwright test` 10/10; 29 screenshots in `docs/screens/`.

- Step 5 (tests and evidence):
  - New unit tests: meetings store, live-session triggers (pause, cues, 6 s gap, 45 s fallback, auto off, paused, transcription errors, paywall), human errors.
  - `electron/integration.test.ts`: full meeting through AppCore handlers with the fake sidecar process and the mock model over HTTP (start refused without model, download, start, transcript, suggestion, usage, stop, summary with JSON tail, export .md/.txt, reset); trial through the proxy then 402 and paywall.
  - E2E (Playwright, 11 tests): wizard, Simple meeting, model missing, paywall and mock payment, own key test, Advanced switch, AVALET_ADVANCED, Advanced checklist and history, contrast in both themes, keyboard-only wizard, no layout jump. 34 screenshots in `docs/screens/`.
  - Coverage (`npm run test:coverage`): ledger/metered/access/weights/usage 100%, model manager 98%, meetings store 92%, billing service 91%, live session 85%, app-core 72%.
  - Self-review: see REPORT; fixed overlay hardening and double Start.
  - Verified: `npm run check` (129 unit/integration tests), `xvfb-run -a npx playwright test` 11/11.

- Step 6 (packaging and CI):
  - `.github/workflows/ci.yml` (Ubuntu: install, check, coverage summary, build, E2E under Xvfb, screenshots as artifact).
  - `.github/workflows/release-mac.yml` (manual and `v*` tags; arm64 on macos-15, x64 on macos-15-intel; setup-python, venv, `dist:mac:unsigned`, artifacts; draft release only on tags; cost note).
  - Builder config checked with `npx electron-builder --linux dir` here (packs; contents listed in DECISIONS). `.dmg` not buildable here.
  - `docs/dev/MAC_VERIFY.md` (10 steps with expected results), version `0.2.0-rc.1`, `CHANGELOG.md`.

- Step 7 (docs): README.md and README.ru.md (new flow, two access modes, screenshots table, honest limitations: built-in provider not live, checklist unverified), `docs/dev/market-check.md` (8 products, 10 criteria, dated sources).

## In progress

- Final: CLEANUP scan, REPORT.

## Next

- Final report.

## Blockers

(none)
