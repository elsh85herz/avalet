# Progress (task scaffolding, delete before going public)

Resume rule: read `CLOUD_TASK_2.md` (current task, 0.2.0-rc.2) and `CLOUD_TASK.md` sections 0-3, then this file, then `DECISIONS.md`. Work continues from "rc.2: Next" at the bottom.

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

- Final: sensitive scan (clean; decisions listed in CLEANUP.md), `docs/dev/REPORT.md` written.

## In progress

(nothing: all steps of CLOUD_TASK.md done)

## Next

- Owner: run `docs/dev/MAC_VERIFY.md` on a Mac build from the Release (macOS) workflow; decisions in REPORT.md.

## Blockers

(none)

# 0.2.0-rc.2 (CLOUD_TASK_2.md)

## rc.2: Environment and baseline (2026-09-26)

- Same container facts as above; `npm ci` ok; Electron under Xvfb works.
- Baseline on aeba8a1: `npm run check` ok (i18n 313 strings, 129/129 tests); `npm run build` then `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` 11/11.

## rc.2: Done

- Step 1 (working controls in Simple):
  - Overlay has the same controls in both levels: Pause/Resume and End with text labels, Auto, language, opacity slider, screenshot, notes; all four quick actions visible ("More actions" fold removed, Simple highlights "Clarifying question"). Icon-only buttons have `aria-label` and `title`.
  - New overlay "End" (stop + reset); main window releases the microphone on `meeting-ended`; overlay hides after End.
  - Main window header: Pause/Resume chip while a meeting runs (Simple: History/Settings views; Advanced: always).
  - E2E `simple overlay: auto, language, opacity, pause, end are there and work` (auto off gives no suggestion, Process now does; opacity saved; language switch; pause/resume from overlay and header; End hides overlay and closes the meeting); paywall E2E checks Pause/End stay visible.
  - Screenshots: new `overlay-simple-controls-dark`, `overlay-simple-strip-paused-dark`, `overlay-simple-auto-off-dark`; `overlay-simple-more-actions-dark` removed; others regenerated.
  - DECISIONS: the two lines saying Simple hides Auto/language/opacity were replaced.
  - Verified: `npm run check` (129/129), `npm run build` + `xvfb-run ... npx playwright test` 12/12.

- Step 2 (Simple Settings complete for real work):
  - Simple Settings: Access (card, provider + key + test, one read-only line with the model in use, usage), Meeting (type, role/context, agenda), Speech (language, all three models with download/cancel/continue/delete, plain guide text incl. internet/VPN, small vs turbo), Files (export folder with a folder picker; new setting `exportDir`, IPC `avalet:export-dir-choose`), Appearance (interface language, theme, opacity), Advanced.
  - Advanced Settings got the same export folder row. Wizard step 3: "Other models can be chosen later in Settings".
  - README (EN/RU) install step and MAC_VERIFY step 5 say the same as the app about where models are chosen.
  - Tests: `electron/app-core-settings.test.ts` (export folder default, chosen, fallback); E2E Simple settings checks every item. `simple-settings-dark.png` regenerated.
  - Verified: `npm run check` (130/130), `xvfb-run ... npx playwright test` 12/12.

- Step 3 (built-in provider not a dead end):
  - `builtInProviderAvailable` in `electron/billing/config.ts` (false with the placeholder URL or key unless `AVALET_BILLING_URL` or `AVALET_BILLING=mock`); `AccessState.builtInAvailable`, `SettingsSnapshot.builtInProviderAvailable`.
  - BillingService: no call at all when unavailable; in own-key mode no call at startup, on the timer or after refusals; `providerChanged()` refreshes when switching to Avalet; failures logged once per code per session.
  - AppCore: an install with "avalet" selected switches to an own key; selecting "avalet" is refused when unavailable.
  - UI: wizard shows "Avalet, no keys" disabled with "Coming soon" and preselects own key; Settings shows a "coming soon" line instead of trial buttons; Advanced hides Avalet in the provider list; the paywall banner only for Avalet mode.
  - READMEs (EN/RU): "coming soon" wording, the access screenshot is `wizard-2-access-coming-soon-dark.png`.
  - Tests: `electron/billing/availability.test.ts` (config rule, zero calls when unavailable, zero calls in own-key mode incl. timer, log once, AppCore switch/refusal); E2E "no billing server" (wizard, Settings, Advanced list, IPC refusal, app log has no billing failure). Mock-server trial/paywall/Pro E2E still green.
  - Verified: `npm run check` (135/135), `xvfb-run ... npx playwright test` 13/13.

- Step 4 (one clear problem message):
  - `src/renderer/lib/problems.ts`: ordered problems, texts, readiness; `test/problems.test.ts` (order, model states, unchecked key, own key can never produce limit/budget text in RU/EN, Avalet used-up only when exhausted).
  - Key check state per provider (`keyCheck`), in `AccessState.keyCheck`; set by the key test and any successful call, reset on a new key.
  - Simple home: readiness line, one problem with one button (Download / Continue / Retry / Open System Settings / Check / Set up access / Reconnect / Do not start), status "Not everything is ready yet" while a problem is shown.
  - Start never opens the mic without a ready model; during a download it waits and starts by itself (also Step 5 item).
  - Wizard sample conversation (report export) shown above the sample; shared in `electron/shared/selftest.ts`; mock model answers it.
  - E2E: model missing (before and after Start, Download in place, Start waits then listens), unchecked key with Check. Screenshots: `simple-key-unchecked-dark`, `simple-home-ready-dark`, `simple-start-waits-for-model-dark`; `simple-settings-model-downloading-dark` removed.
  - Verified: `npm run check` (142/142), `xvfb-run ... npx playwright test` 14/14.

- Step 5 (robustness around real use):
  - `model-manager.test.ts`: cancel at 30%+ keeps the partial file and percent; Continue never reports less than the partial size (fake download fixture). Wizard E2E: Cancel shows "Partly downloaded", the percent and Continue; Continue resumes from there. Screenshot `wizard-3-model-partial-dark`.
  - Start during the first download explains and waits (done in Step 4, E2E `simple-start-waits-for-model-dark`).
  - `electron/log.ts`: identical lines within 10 min are counted, not repeated; key-shaped strings redacted. `electron/log-hygiene.test.ts`: repeat suppression, redaction, and a full own-key meeting with a canary in the transcript/context and the key: neither reaches the log.
  - Verified: `npm run check` (146/146), `xvfb-run ... npx playwright test` 14/14.

## rc.2: In progress

- Step 6 (docs and versioning, REPORT section).

## rc.2: Next

- Steps 2 to 6 of CLOUD_TASK_2.md, then the REPORT section "0.2.0-rc.2".

## rc.2: Blockers

(none)
