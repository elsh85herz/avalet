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

---

# Mode tiers (2026-09-27, CLOUD_TASK_3.md)

Branch `release/v0.2-autopilot`, version still `0.2.0-rc.2` (changes are in
CHANGELOG "Unreleased"), not tagged. Plan: `docs/dev/mode-tiers-plan.md`,
research: `docs/dev/mode-tiers-research.md` (both private, in CLEANUP).
Details in `PROGRESS.md` ("Mode tiers") and `DECISIONS.md` ("Mode tiers").

## What changed

1. **Commercial plan (private docs).** Per-mode findings, how comparable products structure tiers, a tier table, where `free` sits, the checklist rule, three options for "three tiers vs two plans", upgrade copy in RU and EN.
2. **One gate for plan limits.** `electron/shared/tiers.ts`: `PLAN_FEATURES` (Trial: free, interview, requirements, grooming; Pro: everything) and `featureGate()`, which returns "everything unlocked" first for an own key and for a build without a billing server. Optional `features` list in the entitlement token (additive, `billing-api.md`); mock server `POST /mock/features`.
3. **Main process enforces it.** A locked mode cannot be set over IPC; a stored locked mode starts as `free` and the pickers are told; the live checklist makes no background call when the plan lacks it.
4. **Per-mode UI.** Requirements, grooming, demo and review keep a running list in the overlay (requirements and risks; slices, separate tasks and risks; deviations and checks; remarks and decisions), read from marker lines the prompts now ask for, no extra model call, with Copy. Grooming's "Risks?" button also asks about hidden work. Interview unchanged (already customized); free has no list.
5. **Locked but discoverable.** Trial: "Document review (Pro)" and "Demo / acceptance (Pro)" stay in the picker; choosing one opens a card with a real overlay screenshot of that mode, what it does, the plan line, the modes the plan has, "Get Pro", "Not now" and the own-key hint; after the (mock) payment it turns into "Done" and "Use it". The live checklist: a locked row in Advanced and Simple Settings (Simple only in Avalet mode) and in the overlay, the same kind of card. The preview images come from the screenshot mode under Xvfb.
6. **E2E back to green.** The CI test job was already red on the base commits (`0e8e177`, `76459cd`); the first local run here had 13 of the 14 older E2E tests stopping on the how-it-works guide added in rc.2 steps 8 to 11 (the tests never marked it seen). Fixed, plus a new `e2e/tiers.spec.ts`.

## Verified here (Linux container, commands run)

| Command | Result |
|---|---|
| `npm run check` (typecheck, `check-i18n`, unit + integration) | ok; 394 strings per language; 168/168 tests (was 147) |
| `npm run build` then `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` | 17/17 (14 older + 3 new) |
| `electron/shared/tiers.test.ts` | own key (every tier, status, server features, built-in available or not) and no billing server: gate open; the same through the real `deriveAccess` for every token; trial/pro/none tables; server features |
| `test/locks.test.ts` | renderer: 768 own-key / no-server states in RU and EN, no option marked, no "Pro" in labels, no locked checklist, no plan UI |
| `electron/integration.test.ts` (3 new) | trial refuses review, demo and the checklist, a stored locked mode starts as free, a mock payment unlocks all; the owner's three-tier split via `/mock/features`; own key with a trial token on the install is never limited |
| `e2e/tiers.spec.ts` | preview then mock payment unlocks review in place; checklist locked in Simple Settings, overlay and Advanced with previews; own key: no lock anywhere, the review list fills |
| GitHub Actions CI run 25 (commit `ca98c04`) | green: typecheck, i18n, unit and integration tests, coverage, build, E2E under Xvfb |
| Screenshots | new in `docs/screens/`: `tier-preview-review-dark`, `tier-preview-unlocked-dark`, `tier-preview-checklist-dark`, `tier-simple-settings-trial-dark`, `overlay-checklist-locked-dark`, `overlay-checklist-preview-dark`, `overlay-requirements-board-dark`, `overlay-review-board-dark`; others regenerated |

## Needs a Mac

`MAC_VERIFY.md` step 8b (plans and modes against the mock server); the
overlay's list panel and the preview card with macOS fonts at 380 px; that a
real model actually writes the marker lines in each mode (checked here only
with the mock model and the prompt text).

## Known gaps

- Mode gating is a soft gate: the client is open source, the server enforces only the budget. Written in the plan; no prompt inspection on the proxy.
- The running lists live only in the overlay during the meeting (not saved to the meeting record or exports; the summary has the same headings).
- Whether real models keep to the markers is unverified; a missed marker only means an item is not listed, the suggestion text is unchanged.
- Opening a locked mode's preview needs a click on a native select option; on macOS the native menu shows "(в Pro)" text only, no icon.
- The how-it-works guide images (`overlay-expanded.png`, `overlay-checklist.png`) were not regenerated, so they do not show the running lists; their highlight rings are measured on those files.

## Decisions needing the owner

1. **Three tiers vs two plans (the main one).** Implemented: two plans, Trial = free, interview, requirements, grooming; Pro = everything incl. review, demo, the live checklist; plus an optional server `features` list so a third plan can come later without a client redesign. Your proposal put only interview in Base and Trial. *Recommended: keep the analyst modes in the Trial (a trial must show analysts the analyst modes) and add a third paid plan only with usage data. To switch to your split, change the `trial` row in `electron/shared/tiers.ts` (one line) or send `features` from the server.*
2. **Live checklist in Pro only**, separate from where requirements unlocks. *Recommended: yes (continuous token cost, clearest Pro argument); manual agenda marks stay free.*
3. **`free` mode in every plan** and as the fallback for a locked stored mode. *Recommended: yes.*
4. **Simple/Advanced must not depend on the subscription.** Not implemented, on purpose. `uiLevel` is a workspace-complexity switch, not a product edition: Simple's design rule is "the same working product with fewer settings, not fewer working tools" (CLOUD_TASK_2), so gating Advanced would turn a comfort setting into a paywall for things like provider URLs and the log folder; own-key users must keep full Advanced access by the existing policy (CLOUD_TASK section 3), so the gate would bite only Avalet users and be bypassed by the free own-key path anyway; and gating the workspace itself means re-deciding every control's place by plan instead of by frequency of use, a much bigger product change than gating a meeting mode. Research did not show a reason to reconsider: comparable products gate volume, live features and team/admin features, not the settings screen. *Recommended: keep the two axes independent.*
5. **Own-key hint in the upgrade card** ("With your own key all of this is free"). *Recommended: keep; it is true and matches the product's open stance, and people who would use a key were never going to buy the plan.*
6. **Running lists for all access modes, own key included.** *Recommended: keep; they are product improvements, not a plan feature.*

## Next steps

1. Decide item 1 above, then MAC_VERIFY step 8b.
2. Try the running lists in two real requirements or grooming meetings; tune the markers if the model skips them.
3. When the billing server is built: send `features` in the token from day one, so the table can change without a client release.

---

# Checklist UX, one speech model, quieter hints, overlay cleanup (2026-09-28, CLOUD_TASK_4.md)

Branch `release/v0.2-autopilot`, version still `0.2.0-rc.2` (CHANGELOG
"Unreleased"), not tagged. Research and plans (private, in CLEANUP):
`checklist-ux-research.md`, `checklist-ux-plan.md`, `auto-hints-plan.md`.
Tier and billing gating not touched. Details in `PROGRESS.md` ("CLOUD_TASK_4")
and `DECISIONS.md` ("CLOUD_TASK_4").

## What changed

1. **Checklist keeps what was said (the review-mode bug, as a class).** The single `note` slot was doing three jobs: verdict, evidence, location. Agenda items and action points now carry an optional verbatim `quote`, `speaker` and `at` next to the 12-word verdict. The tracker prompt asks for the exact words, with one line per mode on which sentence counts as evidence. Quotes are checked locally against the excerpt the model saw (word stems in 1 to 3 consecutive segments, 60%): an unbacked quote is dropped, and time and speaker come from the matched segment, not from the model. The summary merge keeps live quotes. No third "decisions" list, no topic grouping (reasons in the plan).
2. **Checklist stays secondary in the overlay.** The folded row stays where it was. Open, it takes at most about a third of the overlay (`32vh`, was 240 px = 43%), one line per item, detail (verdict, quote, who, m:ss) on a click, add and "Update now" behind one link. It folds itself when a new suggestion starts unless the pointer is over it or someone is typing in it; the mode board does the same. The main window shows each quote with a time button that jumps to that moment in the transcript and highlights it; the protocol export quotes under the item and under the task table.
3. **One speech model.** `small` only; the picker is one readiness row (status, progress, Cancel, Continue, Retry, Delete) in both Settings and the wizard. The download starts in the background when a new user leaves the first wizard screen or when the first-run guide opens, once per window, only if the model is absent (partial resumes); Start still waits for a ready model.
4. **Quieter automatic suggestions, per mode.** Interview keeps the live pace (6 s, any pause). Free is balanced (15 s, a pause after 120 new characters). Requirements, grooming, demo and review are quiet (25 s, a pause after 300 new characters, or a question). Manual paths are untouched.
5. **No RU/EN button on the overlay.** Language is set in Settings (both levels) and the first-run setup; the overlay follows it. "Explain" and its reasoning comment untouched.

## Token cost before and after (estimate, `auto-hints-plan.md`)

Simulated 10-minute call, automatic calls: old pace 57-65 (every mode); free 33; board modes 20-22; interview unchanged. At about 2,500 input and 150 output tokens per call: **about 950k tokens per hour of talk before, about 530k in free (-45%), about 330k in the board modes (-65%)**. From a synthetic call and prompt sizes, not measured; the ledger after a week of real use is the check.

## Verified here (Linux container, commands run)

| Command | Result |
|---|---|
| `npm run check` (typecheck, `check-i18n`, unit + integration) | ok; 393 strings per language; 187/187 tests (was 168) |
| `npm run build` then `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` | 19/19 (was 18) |
| `electron/live-tracker-logic.test.ts` | quote parsed and optional; grounding across segments, tolerant of small wording changes, drops unsaid quotes; forward-only, manual, closed and `sameTask` rules unchanged with quotes; merge keeps quotes; every mode's prompt asks for verbatim quotes |
| `electron/live-tracker.test.ts` | a real `LiveTracker` run stores the quote with the segment's time and speaker and drops an unbacked one |
| `electron/summary-format.test.ts` | protocol quote lines with speaker and `HH:MM:SS` |
| `test/early-download.test.ts` | fires once per window however often called; nothing when ready (relaunch), downloading or failed |
| `electron/model-manager.test.ts` | the state machine on one model (progress, retry, error, cancel/continue, delete) |
| `electron/live-session-triggers.test.ts` | pace table per mode, quiet and balanced rules, 25 s in a requirements session with direct asks instant, simulation: quiet at most 40% of the old pace |
| E2E | overlay item detail with quote; list folds on a new suggestion; main-window jump highlights the segment; wizard sees the download start after step 1, cancel/continue on step 3; the first-run guide starts the download; Settings show one model row; no language button on the overlay, "Explain" present, language switched from Settings |
| GitHub Actions CI run 36 (commit `601926d`) | green: typecheck, i18n, unit and integration tests, coverage, build, E2E under Xvfb |
| Screenshots | `docs/screens/overlay-checklist-with-suggestion-dark.png` (checklist open next to a suggestion), overlay and wizard shots regenerated; guide images regenerated, the Auto ring re-measured by pixel scan |

## Needs a Mac

`MAC_VERIFY.md` step 5 (early download on the real Hugging Face hub), 7a
(overlay without the language button) and new 9a: whether a real model gives
verbatim quotes the grounding accepts (checked here only with the mock model),
the tray and fold with macOS fonts at 380 px, the real pace of automatic
suggestions in a live call.

## Known gaps

- Quote quality depends on the real model copying words; a model that paraphrases more than about 40% loses the quote (by design: nothing unbacked is shown). Unverified on real meetings.
- Quotes are not in the summary JSON; an item the live checklist never saw gets no quote.
- Files of a medium or turbo model downloaded earlier stay on disk (about 1.5 GB each); nothing deletes them silently and the app no longer offers them. Removing them needs Finder (`~/.cache/huggingface/hub`).
- The early download uses the network without a separate prompt (the owner asked for it); on a blocked Hugging Face it fails into the usual error row with Retry and the VPN hint.
- The token saving is a simulation estimate; interview is unchanged on purpose.

## Decisions needing the owner

1. **Auto-suggestion paces** (free 15 s / 120 chars, board modes 25 s / 300 chars, interview unchanged). *Recommended: keep for a week, then compare the ledger's suggestion calls per meeting with the estimate; if the board modes feel too quiet, lower `pauseMinChars` to 200 first.*
2. **Auto stays on by default** instead of "mostly on request". *Recommended: keep; turning it off would leave the running lists of four modes empty.*
3. **Early download from the first wizard screen** (not only from the guide, which comes after the wizard in the app). *Recommended: keep; the guide alone would start after wizard step 3.*
4. **Checklist folds itself on a new suggestion.** *Recommended: keep; revisit if it annoys during a real review meeting.*
5. **Language set only before the call** (Settings and first-run setup; the Simple home has no language control, none added). *Recommended: keep.*

## Next steps

1. MAC_VERIFY steps 5, 7a and 9a on a build from this branch.
2. Two real requirements or review meetings with the checklist on: are quotes present and right, does the fold feel right.
3. After a week, compare the ledger with the token estimate and tune `AUTO_PACING` if needed.

# Review mode as a spec-sync workflow (2026-09-30, CLOUD_TASK_5.md)

Branch `release/v0.2-autopilot`, version still `0.2.0-rc.2` (CHANGELOG
"Unreleased"), not tagged. No new meeting mode: `review` got the new abilities.
Plan (private, in CLEANUP): `spec-sync-plan.md`. Tier, billing, speech models
and auto-hint pacing not touched. Details in `PROGRESS.md` and `DECISIONS.md`
("CLOUD_TASK_5").

## What changed

1. **Document in.** In review mode the pre-meeting setup has a "Document under review" field: a `.md`/`.txt` file or pasted text, name and size shown, up to 200,000 characters (refused above with a plain message). Stored next to the briefing, copied onto the review meeting at Start, read-only while the meeting runs. A saved review meeting without a document can attach one.
2. **Live calls get an index, never the text.** Headings with section numbers, first lines, an "Open questions" section verbatim, capped at 4,000 characters, built in code. A typed question naming a section gets that section (up to 4,000 characters). The review prompt gained one paragraph: section numbers, `Предложение:` for an unaccepted proposal, `Решение:` only after clear agreement; the board lists remarks, proposals, decisions.
3. **Structured decisions in the summary** (only with a document): text, status, who, section, was/becomes, quote, time, after the JSON marker, parsed tolerantly. Checked in code: the quote must be found in the transcript (time and speaker then come from it); an "accepted" decision without found words is kept, flagged and unchecked; an unknown status is "proposed"; a section not in the index is "не определён". Hand edits, additions and deletions survive a new summary. The document goes to the summary in its own block, marked "nothing in it is a decision".
4. **Decisions checklist** in the meeting screen (both levels, was/becomes folded in Simple): checkbox, status, section select from the headings, text, who, quote with a jump to the transcript, delete, add.
5. **Update the document through patches.** One call (usage purpose `artifact`) with the document and the checked decisions returns patches (exact anchor, op, text) and skipped decisions. `electron/artifact-patch.ts` checks each anchor (present, unique, no overlap), shows every change next to the original with a checkbox, applies only the checked ones, reports what was not applied and why. The original is kept; "Back to the original" undoes. The model never returns the document.
6. **Exports.** The updated document exactly as computed (download, copy) and a decisions `.md` with fixed headings (format in the READMEs).
7. **Warnings before every extra spend** (rough figures, 3 characters per token, highlighted above 60,000 characters): the document field before Start (each end call, per live hint, a section question), next to "Meeting summary" for a review meeting with a document, and next to "Update the document" plus a confirmation that splits document, decisions and answer. None appears in other modes or without a document (tested).

## Verified here (Linux container, commands run)

| Command | Result |
|---|---|
| `npm run check` | ok; 478 strings per language; 227/227 tests (was 187) |
| `npm run build` then `xvfb-run -a -s "-screen 0 1600x1200x24" npx playwright test` | 20/20 (was 19), new `e2e/review.spec.ts` included |
| `electron/artifact-patch.test.ts` | replace, insert_after, delete; anchor missing, ambiguous, empty, bad op; two patches on one anchor; unknown decision; text outside patches byte-identical; CRLF kept; 100,000 characters with 50 patches under 200 ms; tolerant reply parser; the update prompt forbids rewriting and its overhead bound holds |
| `electron/artifact-index.test.ts`, `electron/review-artifact.test.ts` | numbering (own, counted, title, plain text, code fences), index capped for 100 k characters, section lookup; field cap and lock, copy onto review meetings only; the live prompt with a 100 k-character document grows by at most the index cap and carries none of the body |
| `electron/summary-prompt.test.ts`, `electron/summary-format.test.ts`, `electron/decisions.test.ts` | decisions requested only in review with a document; document block separate from the briefing; "accepted" only with explicit agreement; decisions parsed, malformed ones never break protocol, agenda or actions; grounding, section check, merge with hand edits, renderer input sanitized |
| `electron/review-flow.test.ts` | through AppCore with the fake recognizer and the mock model over HTTP: summary decisions grounded, edits survive, patch call metered as `artifact`, apply one or both, undo, both exports byte-checked; review without a document unchanged |
| `test/artifact-cost.test.ts` | the three warnings return nothing in every other mode and without a document or checked decision |
| `electron/log-hygiene.test.ts` | a whole review flow with a canary in the document and its file name: not in the log |
| GitHub Actions CI runs 40, 43, 45, 46 | green (41, 42, 44 cancelled by a newer push) |
| Screenshots | `docs/screens/review-*.png`, `overlay-review-proposals-dark.png`; guide image `mode-review.png` regenerated |

One unit test outside this task (`model-manager.test.ts`, "cancel then Continue resumes") failed once in a local full run and passed in 4 reruns and in CI; it is timing-sensitive under load. Not changed.

## Needs a Mac and a real call

`MAC_VERIFY.md` step 9b (EN/RU). Only a real model shows whether it finds the decisions that were actually taken, keeps "accepted" to explicit agreement, copies anchors exactly and writes changes in the document's style. Everything here ran against the mock model.

## Known gaps

- Decision and patch quality on a real model is unverified (by design of this environment).
- The summary text and the decisions list are made consistent by the prompt only; no code rewrites the model's text.
- A 200,000-character document plus a long transcript needs a large-context provider; a smaller context fails with the provider's error, nothing is cut silently.
- The warnings are estimates (3 chars per token and fixed allowances), not the provider's count; the ledger shows the real numbers afterwards.
- A proposal stays on the meeting after the decisions change; pressing "Update the document" again makes a new one.

## Decisions needing the owner

1. **Document cap 200,000 characters**, highlight above 60,000. *Recommended: keep; lower the cap only if a real provider fails on it.*
2. **What live hints get:** the 4,000-character index, plus a named section on a typed question only. *Recommended: keep; add "section in every hint" only if real calls show hints missing the text.*
3. **Structured decisions only with a document** (a review without one keeps the old summary). *Recommended: keep; it is the cost rule, and a document can be attached after the call.*
4. **"Update the document" in other modes** (requirements, demo). *Recommended: not now; first see it work in review on real calls, then requirements is the natural next one.*
5. **An accepted decision without words found in the transcript starts unchecked.** *Recommended: keep; it is the trust rule made visible.*

## Next steps

1. MAC_VERIFY step 9b on a build from this branch, with a real spec on a real call.
2. Compare the warnings' figures with the ledger after two review meetings; adjust the allowances.
3. Decide item 4 above after that.
