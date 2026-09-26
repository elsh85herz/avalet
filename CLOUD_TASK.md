# Avalet: production hardening task (autonomous cloud session)

You are working alone in the background. The owner will review the result later. Nobody will answer questions, so decide by the rules below and write every non-obvious decision to `docs/dev/DECISIONS.md` (one line each: decision, reason).

## 0. What Avalet is

Desktop meeting assistant for systems analysts (Electron + React + a Python faster-whisper sidecar). It listens to the mic and system audio, transcribes locally, streams short suggestions into a floating overlay, keeps a transcript per meeting and writes an analyst-style summary and protocol (agenda checklist, action points). Local-first, bring-your-own LLM key (Claude, OpenAI, DeepSeek, any OpenAI-compatible). macOS only for now, Russian market first, English later. License AGPL-3.0. Read `README.md` first, then `electron/main.ts`, `electron/live-session.ts`, `src/renderer/components/*`.

## 1. Hard rules

- Work on the branch you were started on. Never push to `main`, never create tags or GitHub Releases, never change repository visibility or settings.
- No real secrets, no real LLM calls, no real payments. Everything external is mocked.
- No new runtime dependency without a one-line reason in DECISIONS.md. Licenses must be compatible with AGPL-3.0.
- Do not add analytics or crash reporting that is on by default. If added at all, it is opt-in and off.
- Product copy rules: no words "invisible", "undetectable", "cheat" in UI, README or code comments. The overlay hiding from screen share stays as is, described neutrally like presenter notes. No mention of third-party competitor products in user-facing text. No employer names anywhere. No long dashes and no arrow characters in UI strings.
- Do not claim anything is verified unless you ran it. Final report separates: verified here (with the command), not verifiable in the cloud (needs a Mac), and known gaps.
- Keep the product simple. Every added control needs a reason; when in doubt, remove or hide under Advanced.
- Commit after every finished step with a clear message, run the full check (typecheck + tests) before each commit.
- Keep `docs/dev/PROGRESS.md` current (done, in progress, next, blockers). If the session is cut off, a fresh session must be able to resume from this file and this task alone.

## 2. Cloud limits you must plan around

- Linux container: no microphone, no screen capture, no macOS. Real capture, Apple Vision OCR (Swift), and .dmg building cannot run here. Isolate those behind interfaces and test everything else with fakes.
- Network may be restricted (package registries and GitHub only). Hugging Face may be blocked, so never download a speech model in tests. Use a fake sidecar that speaks the same newline-delimited JSON-RPC.
- Try to run Electron under Xvfb (install what you need with apt). If it works, do E2E and screenshots. If it does not, say so in the report and rely on unit and integration tests.

## 3. Deliverable shape: one app, two levels, two access tiers

Do NOT create separate apps or builds. One codebase, one build.

UI level (setting `uiLevel`):
- **Simple** (default for new users): guided, minimum controls. This is "the finished product".
- **Advanced**: everything that exists today (all provider settings, models, thresholds, screenshot text, logs). This is the owner's dev mode. Reachable from Settings and by env `AVALET_ADVANCED=1`.

Access tier (derived state, not a setting):
- **Own key**: free forever, unlimited, user's provider key. Works in both levels.
- **Trial**: built-in "Avalet" provider, one-off 500,000 token budget, no card.
- **Pro**: built-in provider, monthly budget 5,000,000 tokens, premium models count x4, price shown from server config (default placeholder 990 RUB/month).

## 4. Work plan (do in this order)

### Step 1. Baseline and hygiene
- `npm ci`, `npm run typecheck`, `npm test`; record results in PROGRESS.md.
- Remove type drift: `electron/preload.cts`, `src/renderer/lib/bridge.ts`, `src/renderer/lib/types.ts` duplicate the IPC types (preload lacks the "review" mode). Make one shared source of truth, with a typecheck that fails on drift.
- Branch `wip/model-manager` (speech model manager, commit 8aeb1ae) may exist on origin. If so, bring it in (cherry-pick or rebase, it diverged from main, do not merge blindly). Then finish it: download cancel, delete model, retry after network drop, state rows (not downloaded, downloading with progress, ready, error). Test progress calculation against BOTH old and new Hugging Face cache layouts using temp directories. If the branch is absent, implement this from scratch with the same behavior: never download a model silently on first Start; explain and offer the button.
- The live checklist tracker (`electron/live-tracker*.ts`) is unverified on a real meeting. Put it behind a setting, default ON in Advanced, OFF in Simple until the owner verifies. Add tests for its trigger rules (pause of other side, min 30 s between calls, cap 90 s, min 80 new chars, forward-only status, manual marks never overwritten).

### Step 2. Token metering
- Read real `usage` from every provider response (Anthropic and OpenAI-compatible, streaming and non-streaming, including image requests). No local estimation except as a labeled fallback.
- Local ledger (input, output, model, purpose: suggestion / tracker / summary / screenshot), stored in the app store, per month and per trial.
- Model weight table (flash-class x1, premium x4) in one config file.
- Show a small counter in Settings and a subtle one in the overlay; never nag.
- Background calls (tracker) must be able to use a cheaper model than live answers; add a setting (Advanced) and a sensible default.
- Cap briefing text sent in live calls to 3,500 characters (full text still used for the summary).
- On budget exhaustion: nothing breaks, the current meeting keeps its transcript, the app offers: buy more, switch to own key.

### Step 3. Billing, payment-provider neutral
The client is open source, so it cannot enforce a paywall by itself. The server enforces; the client only shows state and asks.
- Define `BillingProvider` interface: `getEntitlement()`, `startCheckout(plan)` returning a URL to open in the browser, `refresh()`, `cancelInfo()`. No card data ever touches the client.
- Entitlement = server-signed token (plan, budget, period end, signature). Verify with an embedded public key. Offline grace period 72 hours, then degrade to Own key mode with a clear message.
- Implement `MockBillingProvider` (for dev and tests) and `HttpBillingProvider` against a documented contract in `docs/dev/billing-api.md` (endpoints, token format, webhook flow on the server side, error codes). Base URL is config, default a placeholder. Leave the payment gateway itself out; the doc says the server will integrate a Russian gateway (YooKassa or CloudPayments) and the client does not care which.
- Add "Avalet" as a provider in the provider list (LLM traffic through the server proxy with the entitlement token). The server does not store transcripts, only counters. Document that in the billing doc.
- Build `server-mock/` (dependency-free Node): issues tokens, counts usage, simulates payment success, failure, cancel, expiry, and a fake LLM. This is for tests only, mark it clearly, exclude from the packaged app.
- Test the whole state machine with the mock server: fresh install, Trial, budget exhausted, paywall, mock payment, unlocked, period end, locked, offline grace, refresh. Also: tampered token is rejected.

### Step 4. Simple level and first run (the product)
First-run wizard, max 4 screens, skippable where possible:
1. Permissions (microphone, screen recording) with a live status check and a "how to fix" link; explain why in one sentence each.
2. Access: "Avalet (no keys)" or "My own key". Own key: provider, key, a "test" button that makes one tiny real call and shows a human error if it fails.
3. Speech model: recommended one preselected, size and time estimate, progress, cancel, and the hint "slow or not downloading: turn on a VPN for the first download" with the link already in README.
4. Minimal context: language, meeting type (mode), one field "what is this project or role" (optional), agenda (optional). Nothing else. Then "Try it": a 20-second self-test that runs the mic level meter and shows a sample suggestion using a canned transcript, so the user sees value before the first real meeting.
After the wizard, the Simple main window has: Start/Stop, meeting type, context, transcript, summary, export. Everything else lives in Advanced. Empty states and error states must always say what happened and what to do next in one sentence and one button.

Simplify the overlay: opacity slider only in Settings (overlay keeps a minimal control if the owner already relies on it, decide and log), quick actions collapsed by default in Simple, one primary action visible.

Quality bar: keyboard reachable, visible focus, contrast checked in dark and light themes, all strings in RU and EN with a script that fails CI on a missing key or a string left in one language, no layout jump when streaming.

### Step 5. Tests and evidence
- Unit: settings-store migrations, meetings-store (create, append, summary merge, export), live-session triggers, echo filter, segmenter, resample, metering, billing state machine, agenda/protocol parsing, summary format.
- Integration: main process with a fake sidecar and a fake provider; full meeting flow: start, fake transcript, suggestion, stop, summary, export .md and .txt.
- E2E (if Xvfb works): Playwright or Electron test runner with `AVALET_E2E=1` (fake capture, fake sidecar, mock provider, mock billing). Cover: first-run wizard, Simple meeting flow, Advanced switch, paywall flow. Save screenshots of every screen and state to `docs/screens/` so the owner can review visually without running anything.
- Add coverage output; do not chase a number, cover the logic that can lose user data or money.
- Run a self-review pass on your own diff at the end (correctness, security of IPC, key handling, path handling in exports, race conditions in start/stop). Fix what you find; list what you did not fix.

### Step 6. Packaging and CI (the .dmg)
You cannot build a .dmg here. Prepare everything so GitHub builds it:
- `.github/workflows/ci.yml`: on push and PR, Ubuntu: install, typecheck, tests, E2E under Xvfb.
- `.github/workflows/release-mac.yml`: manual dispatch and on version tag, macOS runners, one job per architecture (arm64 and x64), because the bundled Python venv is architecture specific. Check which runner labels exist today. Steps: Node, Python, `scripts/setup-python.sh`, `npm run dist:mac:unsigned`, upload `.dmg` and `.zip` as artifacts, create a DRAFT release only on tag. Unsigned build, no secrets. Note in the workflow header that private repos consume macOS minutes at a multiplier.
- Verify `electron-builder.config.mjs` still packs: sidecar, venv, native OCR helper, entitlements, mac usage descriptions. Lint the config by running `electron-builder --dir` on Linux if feasible, only to catch config errors.
- Write `docs/dev/MAC_VERIFY.md`: a 10-minute checklist the owner runs on a Mac with the produced .dmg: install through Open Anyway, permissions, wizard, model download, a short call, summary, export, paywall with the mock, update path. Each item has an expected result.
- Bump version to `0.2.0-rc.1` in package.json, add `CHANGELOG.md`. Do not tag.

### Step 7. Docs and market check
- Update `README.md` and `README.ru.md` for the new flow, screenshots from `docs/screens/`, honest limitations.
- `docs/dev/market-check.md`: compare Avalet with current meeting assistants (notetakers and real-time copilots) on 8 to 10 concrete criteria, with sources and dates. Do not write that Avalet is "the best". Write what is different (analyst-specific protocol and agenda tracking, local-first, own key, Russian first), what is weaker, and the three things most worth improving next.

## 4a. Cleanup manifest (mandatory)

The owner will remove all task scaffolding before the repository goes public and wants to do it with one command. Therefore:
- Everything that exists only because of this task lives under `docs/dev/` (PROGRESS, DECISIONS, REPORT, MAC_VERIFY, market-check, billing-api, CLEANUP) or in `server-mock/`. Do not scatter scaffolding elsewhere.
- Files that stay in the product (`docs/screens/`, README updates, CHANGELOG, workflows, tests) are not scaffolding.
- Create `docs/dev/CLEANUP.md` at the start and keep it current. It lists: (a) files to delete before going public (`CLOUD_TASK.md`, PROGRESS, DECISIONS, REPORT, and anything else temporary), (b) files to KEEP but move if wanted (`MAC_VERIFY.md`, `billing-api.md`, `market-check.md`), (c) a ready copy-paste block of git commands: `git rm` for the deletions, then commit; plus deleting the remote branches `release/v0.2-autopilot` and `wip/model-manager` after the squash merge.
- Before finishing, scan your own diff and all docs for anything that must not be public (employer names, internal project names, personal data, strategy numbers, tokens). Remove it or list it in CLEANUP.md under "sensitive, check before publishing".

## 5. Order of value if you run out of budget

1 (baseline, types) then 5 partial (tests for what exists) then 2 (metering) then 4 (wizard and Simple level) then 3 (billing) then 6 (CI and dmg workflow) then the rest. Always leave the branch green and PROGRESS.md accurate.

## 6. Final report (`docs/dev/REPORT.md`)

Sections: what changed (by step), verified here (with commands and results), not verifiable here (needs a Mac, with pointers to MAC_VERIFY.md), known gaps and risks, decisions needing the owner (max 10, each with a recommended answer), the three next steps. Keep it under two pages.
