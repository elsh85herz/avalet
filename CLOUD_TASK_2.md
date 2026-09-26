# Avalet 0.2.0-rc.2: fixes after the first Mac test (autonomous cloud session)

You are working alone in the background on branch `release/v0.2-autopilot`. Nobody will answer questions. Decide by the rules below and log every non-obvious decision in `docs/dev/DECISIONS.md` (one line each: decision, reason). Keep `docs/dev/PROGRESS.md` current so a fresh session can resume from it and this file alone.

Read first: `CLOUD_TASK.md` (sections 0-3 and the hard rules still apply in full, including copy rules and "do not claim anything is verified unless you ran it"), `docs/dev/REPORT.md`, `docs/dev/DECISIONS.md`, `docs/dev/MAC_VERIFY.md`.

## 0. What happened

The owner built the `.app` from this branch on a Mac (arm64) and tested it with a real provider key and a real model. Result: the core works (recognition, suggestions, summary, own key). The owner then found that **Simple mode is too stripped down to work with**. Findings below are facts from the test, not guesses.

## 1. Hard rules (in addition to CLOUD_TASK.md)

- Same branch, never `main`, no tags, no releases, no repo settings. Commit and push after every finished step; run `npm run check` before each commit.
- Do not build a billing server, do not change prices or budgets, do not add a payment gateway. The gateway will be Robokassa, but that is a later task; the client stays gateway neutral.
- Do not touch anything under `docs/dev/` except PROGRESS, DECISIONS, REPORT, MAC_VERIFY and `billing-api.md` where a step says so. Do not re-add `docs/dev/market-check.md` (it is private and was removed on purpose).
- No long dashes and no arrow characters in UI strings. Russian copy in plain language, no anglicisms where a normal word exists.

## 2. The main principle for this task

**Simple is not a demo. It is the same working product with fewer settings, not fewer working tools.**

Rule for every control:
- If a user needs it **during a meeting** (start, pause, stop, end, auto on/off, brightness of the overlay, language switch, quick actions, screenshot, notes), it exists in Simple exactly as in Advanced.
- If it is a **tuning or expert setting** (provider URLs, model names, thresholds, sidecar options, log folder, detailed usage table), it stays in Advanced only.
- Simple differs from Advanced by: a shorter Settings screen, plain wording, the first-run wizard, sensible defaults, and fewer expert options. It must never lack a control the owner used daily in 0.1.

## 3. Work plan (in this order)

### Step 1. Restore working controls in Simple

Facts: in Simple the overlay hides the Auto toggle and the language button (`OverlayApp.tsx`, `advanced ? autoButton : null`, `advanced ? uiLangButton : null`), the brightness slider lives only in Settings, quick actions are collapsed behind "More actions". The owner could not find how to stop listening.

- Show in the Simple overlay: Auto toggle, language button, brightness slider, pause/resume, screenshot, notes. Same behavior as in Advanced, same components.
- Every icon-only control in the overlay gets a visible text label or at least a clear tooltip and an accessible name; the pause/resume and end actions must be unmistakable. Add an explicit "End meeting" action in the overlay in both levels (today it exists only in the main window).
- Quick actions: keep the collapsed "More actions" idea only if the frequently used ones (clarifying question, next question, summary of the last minutes, reply draft, whatever 0.1 had as main actions) are one click away. If in doubt, show them all. Simple may keep "Clarifying question" as the highlighted primary one.
- Stop is always reachable within one click from the overlay and from the main window, in every state (listening, paused, degraded audio, paywall shown).
- Add or update tests and E2E: Simple overlay contains Auto, language, brightness, pause, end; the pause button works; auto off stops suggestions. Regenerate the affected screenshots in `docs/screens/`.
- Revisit `DECISIONS.md` lines that said Simple hides Auto and language: replace them, do not leave contradicting lines.

### Step 2. Simple Settings: short, but complete for real work

- Simple Settings must let the user, without switching to Advanced: choose access (own key or Avalet), choose provider and set the key, test the key, choose the speech model (full list with download, cancel, resume, delete, this already exists, keep it visible), choose overlay brightness, choose language, choose the meeting mode, set the role and context, choose where files are saved, switch to Advanced.
- Choosing which LLM model to use with a provider stays in Advanced, but Simple shows the model that is in use (read-only, one line) so the user knows what is answering.
- Add a plain hint under the speech model list: what the models are, that the first download needs internet and often a VPN from Russia, that small is faster and lighter, turbo is more accurate but heavier.
- The wizard keeps showing only the recommended model. Add one line there: "Other models can be chosen later in Settings".
- Verify README and `MAC_VERIFY.md` say the same as the app about where the model is chosen.

### Step 3. Built-in "Avalet" provider must not be a dead end

Facts: there is no billing server; the default URL is `https://billing.avalet.invalid`. Choosing "Avalet" or "Start free trial" ends in "Could not reach the Avalet server". The log shows `[billing] network: billing server unreachable` about six times in ten minutes even with an own key.

- Introduce a build-time and runtime flag `builtInProviderAvailable`. It is false unless a real billing base URL and a real public key are configured (the placeholder host `.invalid` and the placeholder key count as not configured), or `AVALET_BILLING_URL` is set (mock and dev).
- When false: hide the "Avalet without keys" and "Start free trial" actions in the wizard, in Settings and in the paywall, or show them disabled with the text "Coming soon". No network call to the billing server at startup, on a timer, or on window focus. The trial and Pro code paths stay in place and tested (mock).
- When the user has chosen an own key, never call the billing server and never log `billing server unreachable`. Offline refresh failures are logged at most once per session and never repeated on a timer while the user is in own-key mode.
- Update the wizard step 2, Settings, README (both languages) so nothing promises "without keys" as available today. Keep the honest limitation text.
- Keep the mock server tests and E2E for trial, paywall and Pro green.

### Step 4. One clear problem message, and never a wrong one

Facts: the owner saw a repeated question about a "limit" while using an own key or while the speech model was not downloaded, and thought the model did not work and speech was not recognized. The Simple home shows one problem at a time, most blocking first.

- Order the problems strictly: speech model missing, microphone or screen permission blocked, no access configured, transcription failing, audio degraded, budget exhausted. Test the order with unit tests.
- A "limit", "budget", "tokens are used up" message may only appear when the access mode is Avalet (trial or Pro) and the state is really `exhausted`. In own-key mode it must never appear. Add a test that fails if own-key mode can produce that text.
- If the key is entered but not tested, the message says "Key is not checked yet" with a "Check" button, not "no access".
- When the speech model is missing or half downloaded, the message says exactly that and has one button "Download" (or "Continue" if partial). Starting a meeting without a model must not start listening silently.
- Make the state of the whole session visible in one line in the Simple home: what is ready (model, key, permissions) and what is missing.

### Step 5. Robustness checks around real use

- Speech model download: verify cancel then continue resumes from the partial file and does not restart (unit test with the fake download fixture). Verify that after cancel the row shows the partial size and a "Continue" button.
- If the first model download is in progress and the user presses Start, explain and wait, do not fail silently.
- Log hygiene: no repeating identical warnings; the log never contains meeting text or keys (add a test that greps the log output for a canary string used in the transcript and the key).

### Step 6. Docs and versioning

- Bump to `0.2.0-rc.2`, update `CHANGELOG.md`, READMEs (RU and EN), `MAC_VERIFY.md` (steps for the new Simple overlay, step for "Avalet unavailable" state, step for stop from overlay).
- Update `docs/dev/CLEANUP.md`: add `CLOUD_TASK_2.md` to the list of files to delete before going public.
- Add a section "0.2.0-rc.2" to `docs/dev/REPORT.md`: what changed, what was verified with which command, what needs a Mac, known gaps.

## 4. Do not do in this task

- The billing server, prices, gateway integration, payment webhooks.
- The token counter hint "enough for N meetings" (needs real usage data, later).
- Enabling the live checklist by default in Simple (owner decision after three real meetings).
- Changing the speech engine (whisper.cpp), new features, new dependencies.
- Anything in `main`.

## 5. Definition of done

- `npm run check`, unit and integration tests green; the E2E under Xvfb green if Electron runs there, otherwise say so.
- Simple overlay and Simple Settings pass the rule in section 2, shown by tests and screenshots.
- With an own key and no billing server configured, no network call to the billing host happens and no "limit" text can appear (tests prove it).
- Final report separates: verified here (with commands), needs a Mac, known gaps.
