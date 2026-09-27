# Avalet: meeting-mode tiers and a commercial plan (autonomous cloud session)

You are working alone in the background on branch `release/v0.2-autopilot`, continuing past commit `6119ac7`. Nobody will answer questions. Decide by the rules below and log every non-obvious decision in `docs/dev/DECISIONS.md` (one line each: decision, reason). Keep `docs/dev/PROGRESS.md` current so a fresh session can resume from it and this file alone.

Read first: `CLOUD_TASK.md` (sections 0-3 and the hard rules still apply in full — copy rules, "do not claim anything is verified unless you ran it", the Simple/Advanced and own-key/trial/pro model), `CLOUD_TASK_2.md` (for house style; its own steps are done), `docs/dev/REPORT.md`, `docs/dev/DECISIONS.md`. Then read `electron/modes.ts` (`MODE_INSTRUCTIONS`, six modes: free, requirements, grooming, demo, review, interview), `electron/shared/ipc-contract.ts` (`AccessState`, `AccessTier`), and `src/renderer/components/OverlayApp.tsx` around `meetingMode` (search `meetingMode === "interview"`) — that is the one mode that already got UI-level customization (main window auto-hides, live checklist hidden, the four canned quick actions replaced by a permanent Process Now), commits `5da0316` and `6119ac7`. Use it as the pattern, not something to redo.

## 0. What the owner asked for (verbatim intent, translated)

1. Different meeting modes should be customized **by interface**, not only by prompt. Interview already got this. Requirements gathering needs risks/checklist-type support; grooming needs "something else" — work out what, per mode, from what each mode's `MODE_INSTRUCTIONS` already says it listens for.
2. The live checklist (`electron/live-tracker*.ts`, the tracker panel in the overlay) is a good feature but should become a **paid** feature: not in the base tier, but visible to base users so they know it exists and what upgrading gets them.
3. A concrete tier proposal to evaluate and refine, not to copy blindly:
   - **Base (and Trial)**: Интервью (interview) mode only.
   - **Middle tier ("Analyst")**: adds Сбор требований (requirements) and Груминг (grooming).
   - **Ultra tier**: adds Ревью документа (review) and Демо/Приёмка (demo).
   - (`free`, the no-specialization mode, is not mentioned by the owner — decide where it sits; the obvious default is "available everywhere," argue for or against it.)
4. Locked features should be discoverable, not hidden: click a locked mode or the checklist, see a **visualization of how it works**, then a clear path to upgrade and pay. Never a dead end that just says "no."
5. Do the market/product research and turn it into an actual commercial plan (tier boundaries, what each tier is worth, how the upgrade prompt is framed) before implementing — this is a research-and-propose task, not "invent numbers and ship."

## 1. The one rule that overrides everything else here

**Own-key access is free, unlimited, and untiered. Nothing in this task may restrict a mode, the live checklist, or anything else for a user in own-key mode.** This is not new — `CLOUD_TASK.md` section 3 already states it ("Own key: free forever, unlimited... Works in both levels") and `test/problems.test.ts` already has a hard test that own-key mode can never show limit/budget/exhausted text. Tiers in this task apply **only** to `AccessState.mode === "avalet"` (the built-in, no-keys provider: trial and pro). If you find yourself writing a check that could gate something for `mode === "own"`, stop and re-read this section.

Practically: a locked-mode or locked-checklist state can only ever be reached when `access.mode === "avalet"`. In own-key mode, or when `builtInProviderAvailable` is false (today's real state — no billing server exists yet), every mode and the live checklist work exactly as they do today, completely unlocked, no preview screens, nothing new to look at. The entire feature built in this task must be **invisible and inert** until a real billing server exists and a user is actually in Avalet trial/pro mode. Verify this with a test, the same way `test/problems.test.ts` already proves own-key mode is untouched by budget language.

## 2. Two axes, do not conflate them

- **UI level** (Simple/Advanced, `uiLevel` setting) is a workspace-complexity control, orthogonal to billing. `CLOUD_TASK.md` is explicit that own-key works fully in both levels, and Simple's whole design principle (`CLOUD_TASK_2.md` section 2) is "the same working product with fewer settings, not fewer working tools." The owner asked in passing whether Simple/Advanced should depend on subscription — **do not implement that.** Write one paragraph in `docs/dev/REPORT.md` under "Decisions needing the owner" explaining why (breaks the Simple design principle, own-key users must keep full Advanced access per existing policy, and gating the workspace view itself is a different, much bigger product change than gating a meeting mode). If research in phase 0 turns up a strong reason to reconsider, say so there — but do not build it.
- **Meeting-mode / live-checklist access** is the new commercial axis this task adds. It touches: which of the six modes appear enabled in the mode picker (`src/renderer/components/ContextFields.tsx`, `MEETING_MODES` from `src/renderer/lib/types.ts`), and whether the live-checklist toggle in Settings and its panel in the overlay are available.

## 3. Work plan

### Phase 0: Ground truth

- Read every `MODE_INSTRUCTIONS` entry in `electron/modes.ts` closely. For each of requirements, grooming, demo, review, write down: what does this mode's prompt already ask the model to listen for and produce, and which existing UI element (live checklist / agenda tracking, action points, quick actions, something not built yet) would make that easier to *see* rather than only read in the block text. The owner's own examples: risks matter for requirements gathering (the "Risks?" quick action already exists — confirm it stays available whenever `requirements` is unlocked); grooming needs "something else" — read the grooming prompt (splitting into slices, hidden work, estimate dependencies) and propose one concrete UI idea (for example: a running list of the proposed slices as they're suggested, separate from the general agenda checklist — your call, argue for it).
- Read `AccessState` (`electron/shared/ipc-contract.ts`) and `docs/dev/billing-api.md` fully. Note today's model has exactly two paid plans (`trial`, `pro`) plus `own`. The owner's proposal has **three** user-facing tiers (Base+Trial, Analyst, Ultra). These do not currently map one to one. Resolve this explicitly in phase 1, do not silently pick an interpretation.
- General market research on how comparable "meeting copilot" / interview-prep products commonly structure paid tiers around feature sets (not pricing you can verify, just structure: what's typically free vs. gated, how many tiers is normal, how upgrade prompts are usually framed). No named competitor products anywhere in code, comments, or docs that could ship (house rule, `CLOUD_TASK.md` section 1: "No mention of third-party competitor products in user-facing text"). Write findings to a new **private** file `docs/dev/mode-tiers-research.md` — treat it exactly like `market-check.md` was treated before (`CLOUD_TASK_2.md` step 6 / `docs/dev/CLEANUP.md`): not published, and add it to the cleanup list now so it does not leak later.

### Phase 1: Commercial plan (write it down, get it reviewable in one read)

Produce `docs/dev/mode-tiers-plan.md` (also private, same treatment) containing:

- A table: mode -> which tier unlocks it (own-key row = "always, every mode, every tier" to make the rule from section 1 impossible to miss).
- Where `free` mode sits, with your reasoning.
- The live-checklist rule: which tier(s) get it, and whether it differs from the "Analyst"/"Ultra" split for modes (the owner's instinct was that the checklist is valuable enough to gate on its own, possibly at a different tier than where its most natural mode — requirements — unlocks; decide and justify).
- **The three-tier-vs-two-plan resolution.** Options to weigh, pick one, justify it:
  (a) Add a third plan value to the billing model (touches `AccessState.plan`, `docs/dev/billing-api.md`, the not-yet-built billing server's contract — the biggest option, flag clearly if you recommend it since it is a real API contract change);
  (b) Map the owner's "Base" to the existing free/no-Avalet-activated state, "Analyst" to `trial`-or-better, "Ultra" to `pro` — i.e. two paid tiers total, "Analyst" is really "what trial or a cheaper Pro-lite gets you" reframed;
  (c) Something else you find in phase 0 research.
  This is a real pricing decision. Write your recommendation with reasoning, list it prominently in `REPORT.md` under "Decisions needing the owner," and implement against your recommendation — but do not treat it as final; the owner reviews and can override before anything ships publicly.
- A short spec for the upgrade-prompt copy: what a locked mode's preview screen says, what the checklist's locked state says, in both languages, following the existing copy rules (no long dashes, no arrows, plain language, no anglicisms where a normal word exists — `feedback_formatting_no_arrows_dashes` / `feedback_formatting_straight_quotes` style already enforced by `scripts/check-i18n.mjs`, run it).

### Phase 2: Locked-feature preview UX

- One reusable pattern for "this exists, here's what it does, upgrade to use it": reuse the screenshot-plus-caption mechanism already built for the first-run guide (`src/renderer/components/HowItWorks.tsx`, `src/renderer/assets/guide/*.png`, generated via `AVALET_SCREENSHOT_DIR` under Xvfb — see how that was done, same tool works here, do not hand-draw mockups). A locked mode in the mode picker (`ContextFields.tsx`) shows a lock affordance; selecting it opens a short preview (what this mode's prompt focuses on, one real screenshot of it in use if one already exists in `docs/screens/`, one sentence on what tier unlocks it) with an upgrade button. Same idea for the live-checklist toggle in Settings and its panel-not-shown state in the overlay.
- The upgrade button's destination: reuse the existing paywall/checkout plumbing (`AccessCard.tsx`, `bridge.billing.checkout`, the mock server's checkout flow) rather than inventing a new one. If the tier model from phase 1 needs a new plan value the mock server does not support yet, extend the mock server minimally (same spirit as the existing `server-mock/`), do not build a real one.
- Verify against `npm run mock:server` exactly like `MAC_VERIFY.md` step 8 already does for trial/paywall.

### Phase 3: Implementation

- Gate the mode picker and the live-checklist toggle (Settings and overlay panel) by the tier rule from phase 1, reading current `access` state (already available via `useAccess()` / `bridge.access.get` — see `AccessCard.tsx` for the existing pattern). Own-key and `builtInProviderAvailable === false` (today's real deployed state) must short-circuit to "everything unlocked, no lock UI rendered at all" — check this exact condition first, before any tier logic, so it is structurally impossible to regress section 1.
- Build the per-mode UI customization from phase 0's findings for requirements and grooming (interview is already done; demo and review get the same treatment if phase 0 finds something concrete, otherwise leave their UI as today's shared default and say so in the report — do not force a change with no real justification).
- Tests:
  - A hard invariant test, same shape as the existing "own key: no state can produce limit, budget or 'tokens used up' text" test in `test/problems.test.ts`: own-key mode and `builtInProviderAvailable: false` can never render a lock, a preview screen, or an unavailable mode/checklist, in any tier field combination.
  - Tier gating logic itself: each tier sees exactly the modes and checklist state your phase-1 table says it should.
  - E2E for the preview-then-upgrade flow against the mock server (extend `e2e/` following existing patterns).
- Regenerate any `docs/screens/` screenshots that change, update README mentions if the feature list changes, update `docs/dev/REPORT.md` with a new dated section in the existing format (What changed / Verified here / Needs a Mac / Known gaps / Decisions needing the owner / Next steps).

## 4. Do not do in this task

- No real billing server, no real prices, no payment gateway integration (same standing rule as `CLOUD_TASK_2.md`).
- Nothing that restricts own-key mode, ever, under any tier field value. This is the one regression that matters most.
- Do not make Simple/Advanced (`uiLevel`) itself subscription-gated — write the reasoning to REPORT.md instead, per section 2.
- Do not invent final prices or publish the research/plan files anywhere public-facing (README, in-app copy) — they inform the implementation and the owner's review, they are not deliverables to ship as-is.
- Anything in `main`, tags, releases, repo settings.

## 5. Definition of done

- `npm run check` green; new tests for tier gating and the own-key/no-billing-server invariant pass.
- `docs/dev/mode-tiers-research.md` and `docs/dev/mode-tiers-plan.md` exist, are private (added to `docs/dev/CLEANUP.md`'s delete-before-public list), and are readable in one pass each.
- At least one locked mode and the live checklist have a working preview-then-upgrade flow, demonstrated against the mock server, with screenshots in `docs/screens/`.
- A test proves own-key mode and `builtInProviderAvailable: false` are completely unaffected by everything built in this task.
- `REPORT.md` has a new section listing every decision that still needs the owner's actual sign-off (the two-tier-vs-three-tier resolution above all), separated from what was simply implemented per this brief.
