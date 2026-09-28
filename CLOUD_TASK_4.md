# Avalet: checklist UX, single speech model, quieter auto-hints, overlay cleanup (autonomous cloud session)

You are working alone in the background on branch `release/v0.2-autopilot`, continuing past commit `db2953c`. Nobody will answer questions. Decide by the rules below and log every non-obvious decision in `docs/dev/DECISIONS.md` (one line each: decision, reason). Keep `docs/dev/PROGRESS.md` current so a fresh session can resume from it and this file alone.

Read first: `CLOUD_TASK.md` (sections 0-3, still in force: copy rules, "do not claim anything is verified unless you ran it", Simple/Advanced and own-key/trial/pro model), `CLOUD_TASK_2.md` and `CLOUD_TASK_3.md` (house style; their own steps are done — `CLOUD_TASK_3.md`'s tier work landed in commits up to `db2953c`, not yet merged to `main`), `docs/dev/REPORT.md`, `docs/dev/DECISIONS.md`. This task is independent of the tier/billing work in `CLOUD_TASK_3.md` — do not re-open that, do not change tier gating, this is UX and cost work on top of it.

## 0. What the owner asked for (verbatim intent, translated)

1. The live checklist (agenda status + action points, `electron/live-tracker*.ts`) is a feature worth keeping and investing in, not removing. It needs **research**, then a **better way to work with checkpoints, decisions and action points** per mode — but without the checklist's visual weight burying the value of the main live-suggestion text, which stays primary.
2. Trigger for this: dogfooding review mode found the checklist's `note` field (capped at ~12 words) drops the literal question or remark that was actually said — only the terse verdict survives. The owner wants this class of problem researched and fixed, not just this one field patched blind.
3. Drop the speech-model choice entirely. Keep only `small`. Start downloading it as early as possible — ideally during the first-run guide ("Как это работает" / `HowItWorks.tsx`) screen, so it is ready (or close) by the time the person finishes reading, instead of waiting for Start or a wizard step.
4. Auto-suggestions spend too many tokens. Reduce how often they fire by default, and/or shift the default toward "mostly on request" rather than continuous, so the app does not burn tokens with nobody reading.
5. Remove the RU/EN language toggle from the overlay (in-call control). Keep language selection only in the main window: Settings and the pre-meeting setup screen. It does not need to be changeable mid-call.
6. The "Explain" quick action (`explainThis` in `src/renderer/live/quick-actions.ts`) stays as-is — already decided, no research needed, do not remove or rework it. It is the deliberate on-request path once auto-suggestions get quieter (item 4), and no mode's system prompt already covers plain-language explanation the way every mode's prompt already covers risks (which is why the "Risks?" button *was* dropped everywhere except `free` — see the comment above `quickActionsFor` in that file). Leave that function and its reasoning comment alone; just make sure item 5's overlay changes do not accidentally touch this row.

## 1. Two things that must not regress

- **Own-key behavior**: nothing here is billing-related, but if any change touches `AccessState`-gated UI (it should not), the same rule as `CLOUD_TASK_3.md` section 1 applies — own-key stays fully unlocked, untouched.
- **The four already-shipped meeting modes' value must not drop.** Every change here is about *how* the checklist/model/hints are presented, not about removing what already tested well (voice, screenshot mode, draft-first behavior, per `docs/dev/DECISIONS.md` history). If a research finding argues for removing something else, write it to `REPORT.md` under "Decisions needing the owner" instead of doing it.

## 2. Work plan

### Phase 0: Ground truth on the checklist problem

- Read `electron/live-tracker-logic.ts` fully (`buildTrackerSystemPrompt`, `buildTrackerUserPrompt`, `parseTrackerReply`, the `AgendaStatusItem`/`ActionItem` shapes in `electron/summary-format.ts`) and `electron/live-tracker.ts` (where it is scheduled, `meeting.mode === "interview"` is the only exclusion today — confirm whether that should stay the only exclusion or whether the checklist should be opt-in/mode-specific after this task).
- Read `electron/modes.ts` `MODE_INSTRUCTIONS` for `requirements`, `grooming`, `demo`, `review` again with this specific question: for each mode, what would actually help the analyst navigate back through "what was asked / said" without re-reading the whole transcript — a verbatim quote field, a timestamp/jump-to-transcript link, grouping by topic, something else. The owner's own framing: the checklist should get "отличный функционал работы по этим чек-поинтам, решениям и экшн-поинтам" (excellent functionality for working with these checkpoints, decisions and action points) — treat this as an open design problem, not "just widen the note field."
- Look at how the checklist panel is actually rendered in the overlay today (`src/renderer/components/OverlayApp.tsx`, search for the tracker/agenda panel) and how much visual space/attention it takes relative to the main live-suggestion block. This is the "не перекрывает ценность основного текста" (does not bury the value of the main text) constraint — if today's panel already competes for space, that is part of the problem to research, not only the missing quote.
- Light research (structure, not named competitors, same house rule as `CLOUD_TASK_3.md` phase 0) on how comparable live-notetaking/meeting-copilot UIs commonly separate "live answer stream" from "running structured state" without one crowding the other (collapsed-by-default panel, tap-to-expand per item, side rail vs. inline, etc.).
- Write findings to a new private file `docs/dev/checklist-ux-research.md` (add it to `docs/dev/CLEANUP.md`'s delete-before-public list immediately, same treatment as `mode-tiers-research.md`).

### Phase 1: Checklist redesign proposal, then implement

- Produce `docs/dev/checklist-ux-plan.md` (private, same treatment): what changes in the tracker's data shape (e.g., an added short verbatim-quote field per agenda item and per action, a source timestamp/transcript-offset field), what changes in the prompt (`buildTrackerSystemPrompt`), what changes in rendering (collapsed summary row + expandable detail, or moved to a side panel, your call — argue for it), and explicitly state how the main live-suggestion block stays the primary visual element (size, position, contrast) with the checklist secondary.
- Implement it. Extend `AgendaStatusItem`/`ActionItem` and the tracker prompt/parser with tests (`electron/live-tracker-logic.test.ts` — check it exists, extend it) covering: a quote/detail field is captured, parsing still tolerates the model omitting it, existing behavior (agenda only moves forward, task de-duplication via `sameTask`) is unchanged.
- Update the overlay rendering and the first-run guide (`HowItWorks.tsx`, `overlayChecklist` screenshot) to match; regenerate the screenshot via `AVALET_SCREENSHOT_DIR` the same way existing guide screenshots were made.

### Phase 2: Single speech model, early background download

- Read `electron/shared/ipc-contract.ts` (`SPEECH_MODELS`, `SpeechModelName`), `electron/speech-models.ts`, `electron/model-manager.ts`, `src/renderer/components/SpeechModels.tsx`, and where it is used: `SettingsPanel.tsx`, `SimpleSettings.tsx`, `FirstRunWizard.tsx`. Today this already offers a three-way picker (small/medium/turbo, manual download button per row) — this shipped as part of `CLOUD_TASK_3.md`'s step 1, it is not the unfinished `wip/model-manager` branch (that branch is a separate, more elaborate model-manager effort explicitly deferred by the owner on 2026-09-20 and stays deferred/unmerged — do not touch or merge it in this task).
- Change `SPEECH_MODELS` to `["small"]` (or keep `medium`/`turbo` in the type for internal/test use but remove them from every user-facing picker — pick whichever is the smaller diff and say which in `DECISIONS.md`). Remove the picker UI: no row-per-model, no "recommended" badge, no manual choice. Replace with a single readiness indicator (not downloaded / downloading with progress / ready / error+retry — reuse the existing state machine, just for one model) wherever `SpeechModels` is used today.
- Start the `small` model's download automatically the first time `HowItWorks.tsx` mounts in `mode: "first-run"` (the first-run guide, read before the first real call) rather than waiting for a wizard step or Start. If it is already downloaded, this is a no-op. Do not start it on every app launch if already present — check `model_status` first. Make sure this does not regress the existing rule that Start blocks with a clear message while the model is not ready (`FirstRunWizard.tsx`, `SimpleSettings.tsx` start-blocked states) — the difference is only *when downloading begins*, not whether Start still waits for it.
- Update README/README.ru and any in-app copy that mentions choosing a model.
- Tests: model-list state machine still passes with one model; the auto-download-on-guide-mount behavior (mock the bridge call, assert it fires once, not on every render/reopen).

### Phase 3: Quieter auto-suggestions

- Read `electron/live-session.ts` around `MIN_INTERVAL_MS`/`MAX_INTERVAL_MS`/`MIN_NEW_CHARS`/`FALLBACK_CHARS` (the existing tuning history is in `docs/dev/DECISIONS.md` and the memory note this task was written from — it has already been tuned twice live, so treat further constant changes as a real trade-off, not a free lever) and the Auto-suggest on/off toggle already in the overlay header and Settings.
- Decide, with reasoning written to `docs/dev/checklist-ux-plan.md` or a new short `docs/dev/auto-hints-plan.md`: (a) whether default auto-suggest frequency should simply drop (wider intervals / higher char threshold), (b) whether the default toggle state should change (e.g., default off for modes where quick actions already cover the common need, default on only for `free`/`interview` where there is no other way to get help), (c) both. Weigh: modes with quick actions (`quickActionsFor`) already give an on-request path; `interview` already has no toggle debate (always live, that is the point); `free` has the least structure so probably keeps the most aggressive default.
- Implement the chosen default(s). Do not remove the manual toggle or the "Process now" button — those are the on-request path this task leans on more heavily now. Add/update a token-cost note in `docs/dev/REPORT.md` (rough before/after estimate: calls per minute of talk at old vs. new thresholds) so the owner can see the actual saving, not just "reduced."
- Tests: existing `live-session` tuning tests (find them, likely `electron/live-session.test.ts`) still pass and cover the new defaults.

### Phase 4: Overlay language toggle removal

- Remove the RU/EN toggle from `OverlayApp.tsx` (currently near the `uiLanguage`/`setUiLanguage` toggle button, look for the `{uiLanguage === "ru" ? "RU" : "EN"}` button). Language stays settable in the main window Settings and the pre-meeting setup screen only — confirm both of those already expose it (they should, this is a removal, not a new control) and do not add a new one.
- The overlay must still *display* in whatever `uiLanguage` was set before Start; it just cannot be changed live anymore. Check nothing else in the overlay (quick-action labels, checklist panel text from phase 1) depended on being able to flip language mid-call for testing — if some E2E test relies on the overlay toggle, move that assertion to the Settings/setup-screen control instead of deleting the coverage.
- Update the first-run guide if it has a page pointing at the overlay's language button.
- Do NOT touch the `explainThis` quick action — see section 0 item 6. If phase 4's overlay edits are anywhere near `quick-actions.ts` or the actions row in `OverlayApp.tsx`, leave that entry and its comment exactly as they are.

## 3. Do not do in this task

- No changes to tier/billing gating from `CLOUD_TASK_3.md` (`AccessState`, mode locking, checkout flow) — separate axis, already decided, not in scope here.
- Do not merge or continue `wip/model-manager` — superseded by phase 2's single-model decision.
- Do not remove the manual Auto-suggest toggle, "Process now", or any existing quick action (including `explainThis`) — only change *defaults* and *the checklist's shape*.
- Anything in `main`, tags, releases, repo settings.

## 4. Definition of done

- `npm run check` green; new/updated tests for the tracker's quote/detail field, the single-model state machine and auto-download-on-guide, and the new auto-suggest defaults.
- `docs/dev/checklist-ux-research.md` and `docs/dev/checklist-ux-plan.md` exist, private, added to `docs/dev/CLEANUP.md`.
- Overlay checklist panel visibly secondary to the main live-suggestion text (screenshot in `docs/screens/` showing both together).
- Speech-model picker gone from Settings/Simple Settings/wizard; single `small`-model readiness row; download starts from the first-run guide, verified by a test that it does not also fire redundantly on every relaunch once downloaded.
- RU/EN button gone from the overlay; still present and working in Settings and the pre-meeting screen; `explainThis` quick action unchanged.
- `REPORT.md` has a new dated section: what changed, verified here, needs a Mac, known gaps, decisions needing the owner (especially: default auto-suggest thresholds chosen in phase 3, and the token-cost before/after estimate).
