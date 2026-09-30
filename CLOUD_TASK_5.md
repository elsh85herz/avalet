# Avalet: review mode becomes a spec-sync workflow (artifact in, decisions checklist, reviewed patches out) (autonomous cloud session)

You are working alone in the background on branch `release/v0.2-autopilot`, continuing past the last commit on it. Nobody will answer questions. Decide by the rules below and log every non-obvious decision in `docs/dev/DECISIONS.md` (one line each: decision, reason). Keep `docs/dev/PROGRESS.md` current so a fresh session can resume from it and this file alone.

Read first: `CLOUD_TASK.md` (sections 0-3, still in force: copy rules, "do not claim anything is verified unless you ran it", Simple/Advanced and own-key/trial/pro model), `CLOUD_TASK_2.md`, `CLOUD_TASK_3.md`, `CLOUD_TASK_4.md` (house style; their steps are done), `docs/dev/REPORT.md`, `docs/dev/DECISIONS.md`. This task does not touch tier/billing gating, speech models, or the auto-hint pacing.

## 0. What the owner asked for (intent, translated)

The owner is a systems analyst. A typical situation: a written specification (a Markdown file) exists, a developer asks for a call, asks questions and proposes solutions, and the analyst has to walk away with the specification updated. Today the analyst does that by hand after the call.

Wanted flow, in the owner's words, condensed:

1. Before the call, load the current specification (a `.md` file) into Avalet, so the assistant helps answer questions with the real text of it.
2. Have the discussion with the developer.
3. At the end, get the transcript and a summary of **decisions that were actually taken**. Those decisions are the guide for updating the specification, so the summary must be accurate, not a retelling.
4. In the meeting screen, go through a checklist of the decisions, correct it if needed, and press an "Update the artifact" button. The specification is then rewritten (or patched) according to the confirmed decisions.
5. Download the resulting `.md` file, ready to copy into the team's documentation tool.

Explicit owner rule: **do not create a new meeting mode.** The existing `review` mode ("Document review", `electron/modes.ts`, `MODE_BOARD.review` = remarks + decisions, `MODE_SUMMARY.review`) already means "collect remarks and decisions on a document". Improve that mode. Other modes keep their behavior.

## 1. Rules that must not regress

- **The summary's grounding rule stays**: every bullet rests on a line of the transcript; the briefing is reference only (`electron/summary-prompt.ts`). Decisions and patches must never come from the artifact or the briefing alone, only from what was said in the call. This is the reason the owner can trust the output.
- **A decision counts as accepted only with an explicit agreement in the transcript** (the existing wording in the summary prompt: "согласился" only with explicit agreement, otherwise "не возражал" or "не прозвучало"). A proposal nobody accepted stays `proposed`, never applied.
- **The model never rewrites the whole specification and returns it.** A specification can be 100 KB; a full rewrite silently drops or alters passages nobody discussed. The model returns a list of patches, code applies them deterministically (see phase 4). This is a hard design rule.
- Own-key and tier behavior unchanged (`CLOUD_TASK_3.md` section 1). Review mode's current lock/unlock status is not changed by this task.
- Other modes' live prompts, boards and summaries unchanged (tests for them stay green).
- **Any change that raises token spend must warn the user before the spend happens.** Owner rule for this task and for future ones: if a feature makes a request bigger or adds a request, the person sees it in plain words first, with a rough number, and can decline. Warnings are informational and dismissible, never a hidden cost, never a new paywall, and use the same token counters the app already shows (`UsageCounter.tsx`, `electron/metering/`). Log in `docs/dev/DECISIONS.md` where each warning fires and why.
- Privacy: the artifact is the user's document. It is kept only in the meeting's local record and sent only to the user's chosen model provider, like the transcript. No new network destinations, no logging of its content (`electron/log-hygiene.test.ts` must still pass and cover the new field).
- Test fixtures and docs examples are synthetic. Never put real company, client or employee names, real endpoints or real specification text into the repo. Use an invented specification (for example a small "activity journal" spec with two API methods).

## 2. Work plan

### Phase 0: Ground truth and plan

- Read `electron/modes.ts`, `electron/summary-prompt.ts`, `electron/summary-format.ts`, `electron/meeting-summary.ts`, `electron/live-tracker*.ts`, `electron/meetings-store.ts`, `electron/shared/ipc-contract.ts` (`Meeting`, `ActionItem`, `AgendaStatusItem`, settings), `src/renderer/components/ContextFields.tsx` (briefing and agenda file import), `MeetingView.tsx`, `OverlayApp.tsx`, `src/renderer/lib/mode-board.ts`, `src/renderer/lib/agenda.ts`.
- Write a private `docs/dev/spec-sync-plan.md` (add to `docs/dev/CLEANUP.md`'s delete-before-public list at once). It must decide, with a reason each: where the artifact lives (a separate field on settings and on the `Meeting` record, not glued into the briefing, because the briefing is reference-only in the summary while the artifact is the thing being edited); size cap and what happens above it; the data shape of a decision; how patches are addressed; what the live overlay gets of the artifact (see phase 1).

### Phase 1: Load the artifact (review mode only)

- In the pre-meeting setup (`ContextFields.tsx`), when the mode is `review`, show an "Artifact" field next to the briefing: a file picker for `.md` / `.txt` (same import path as the agenda file, look at how it is done) plus a paste area. Show name and size. Stored in settings like `sessionContext`, copied onto the `Meeting` at start, editable before Start only.
- Hard cap 200 000 characters; above it, refuse with a plain message and say what to do (load the relevant part). When an artifact is loaded, show a cost note right in the field, before Start, in plain words: the artifact is sent to the model twice at the end (summary and update), not with every live hint; give a rough token figure computed from its length (state the characters-per-token assumption in `DECISIONS.md`) and highlight it above about 60 000 characters.
- **Token cost matters to the owner** (see `CLOUD_TASK_4.md` phase 3). Do not send the whole artifact with every live suggestion. Live suggestions get a compact index built in code from the artifact: headings tree with section numbers and, per section, the first line, plus any "open questions" section verbatim if it is recognisable (heading contains "Открытые вопросы" / "Open questions"). The full text goes only to the two calls that need it: the summary (phase 2) and the patch call (phase 4). If a live answer really needs a passage, the manual ask ("Process now" or typed question) may include the section the analyst names; keep that optional and log the decision.
- The live prompt for `review` gets one added paragraph: sections are addressed by their numbers from the index; a proposal by the other side is restated as `Предложение: раздел X, суть, кто сказал` (a new marker next to the existing `Замечание` and `Решение`), and a decision as `Решение: ...` only after the other side or the analyst clearly agreed. Update `MODE_BOARD.review` so the board collects three lists: remarks, proposals, decisions; update the copy-to-clipboard text and the overlay rendering (keep the secondary visual weight rule from `CLOUD_TASK_4.md` phase 1).

### Phase 2: Structured decisions in the summary

- Extend the JSON tail after `ANALYSIS_MARKER` for `review` meetings with `decisions`: `[{ "id": "...", "text": "...", "status": "accepted" | "proposed" | "rejected" | "open", "by": "...", "section": "...", "before": "...", "after": "...", "quote": "...", "at": "mm:ss" }]`.
  - `text`: one line, what was decided, phrased as an edit instruction to the specification.
  - `section`: must match a section number or heading from the artifact's index, or `не определён` if the call did not say. Never invent a section.
  - `before` / `after`: the old and new formulation only if both were said or are read directly from the artifact for `before`; otherwise empty. `before` may be quoted from the artifact, `after` must come from the transcript.
  - `quote`: a short verbatim fragment from the transcript that supports the decision; `at` its timestamp, so the UI can jump to it (reuse `QuoteRef` from `CLOUD_TASK_4.md`).
  - `status`: `accepted` only with explicit agreement (see section 1); a question left with no answer is `open`.
- Parse tolerantly in `summary-format.ts` (missing or malformed `decisions` gives an empty list, never breaks the protocol text or the agenda/actions parts). Keep `mergeSummaryAnalysis` behavior for hand-set marks: decisions the analyst edited or confirmed by hand in the checklist survive a re-summarize.
- Keep the protocol text headings for `review` as they are (`Замечания к документу`, `Решения по открытым вопросам`, ...) and make the two consistent: every `accepted` decision appears in the text under the decisions heading.
- The summary call receives the full artifact only as reference for section names and for `before`, in a separate tagged block from the briefing, with the sentence that nothing in it is a decision.
- Tests in `electron/summary-format.test.ts` / `summary-prompt.test.ts`: decisions parsed; malformed JSON tolerated; prompt contains the artifact block only for `review` with an artifact; a proposal without agreement is not `accepted` in the prompt rules (assert the prompt text, no real model calls).

### Phase 3: Decisions checklist in the meeting screen

- In `MeetingView.tsx`, for `review` meetings with decisions, show a "Decisions" panel above or beside the protocol: one row per decision with a checkbox "include in the update" (default on for `accepted`, off for the others), status badge, section, text, who said it, and a link that scrolls the transcript to `at`.
- Editable in place: text, section (a select fed from the artifact's headings), before, after, status. Delete a row. Add a row by hand. Edits are persisted in the meeting record and marked hand-set (survive re-summarize).
- Plain-language UI, the same copy rules as elsewhere; RU and EN strings in `i18n.ts`. Simple level shows the panel too (it is the value of the mode), but without the advanced fields (before/after collapsed under "details").
- Empty state: no artifact loaded, or no decisions found, with a one-line explanation.

### Phase 4: "Update the artifact"

- Button in the decisions panel, enabled when at least one decision is checked and an artifact exists. Next to the button, and again in a confirmation step before the call goes out, show the estimated cost in tokens (the artifact plus the checked decisions, and the expected size of the reply) and what it is spent on; the user confirms or cancels. The summary of a `review` meeting with an artifact is also bigger than before: say so on the End screen before the summary starts, with the same kind of figure, so it is never a surprise.
- One model call (usage purpose: add `"artifact"` to `UsagePurpose` and to metering the same way `"summary"` is handled; it counts against the same balance and is not a new paywall) with: the full artifact, the checked decisions (already edited by the user), and instructions to return **only** a JSON list of patches: `{ "decisionId": "...", "op": "replace" | "insert_after" | "delete", "anchor": "<exact text copied from the artifact>", "text": "<new text>" }`. The prompt states: change nothing that no checked decision asks for; `anchor` must be copied character for character from the artifact and be unique; keep the artifact's own style, numbering and formatting; when a decision cannot be placed, return it in a `skipped` list with the reason instead of guessing.
- **Apply in code, not by the model**: for each patch, verify the anchor occurs exactly once; apply in order; a patch whose anchor is missing or ambiguous is not applied and goes to a "not applied" list with the reason. Never fail the whole run for one bad patch. Keep the original text so every patch can be undone.
- Show a preview: per patch, the old fragment and the new one (a simple side by side or before/after block, no diff library needed), with a checkbox per patch; nothing is written until the user presses "Apply". Show "not applied / skipped" decisions at the bottom with the reason so the user can fix them by hand.
- Result: the updated artifact text is stored on the meeting (the original stays too) and can be re-opened.
- Tests (`electron/artifact-patch.test.ts` new, pure functions): replace, insert_after, delete; anchor missing; anchor ambiguous; two patches touching the same anchor; text outside the patches is byte-identical; Windows line endings; a large artifact (100 000 characters) applies fast.

### Phase 5: Export

- "Download updated artifact": save dialog, `.md`, the updated text exactly as computed (no re-formatting, no added header). Also "Copy" to the clipboard.
- "Download decisions": a plain `.md` with the checked decisions, each as section, before, after, who, quote and time, plus the protocol's action points. This is for the owner's other workflow: handing decisions to another assistant together with the original file. Keep it structured and stable (fixed headings), document the format in the README.
- Existing exports (protocol, transcript) stay as they are.

### Phase 6: Docs, guide, tests, verification

- `README.md` / `README.ru.md`: describe the review mode's new abilities in two or three sentences each; keep the copy rules.
- If the first-run guide describes modes, update the review mode line only.
- E2E (`e2e/`, mock server `server-mock/`): a fake meeting in `review` mode with a synthetic artifact and a scripted transcript: decisions appear, checkbox toggles, edit works, patches preview, apply, export. Fake capture and mock provider only, no real model.
- `npm run check` and `npm run e2e` (on Linux `npm run e2e:xvfb`) green.

## 3. Do not do in this task

- No new meeting mode, no changes to the other modes' prompts, boards, summaries, or the mode picker.
- No tier, billing, or locking changes.
- No whole-document rewrite by the model; no automatic apply without the preview and confirmation; no network destination other than the chosen provider.
- No merging of `main`, no tags, no releases, no repo settings. Do not touch `wip/model-manager`.
- Do not claim the real-model quality is verified: patch and decision quality on a real model can only be judged by the owner on a real call. Say so.

## 4. Definition of done

- `npm run check` and the e2e suite green; new tests for decisions parsing, the summary prompt's artifact block, and the patch applier (phase 4 list).
- A `review` meeting with a loaded artifact: live board shows remarks, proposals and decisions; the summary returns structured decisions; the checklist edits and persists; "Update the artifact" shows a per-patch preview, applies only confirmed patches, reports what was not applied; both downloads work.
- Every place where this task raises token spend shows a plain-words warning with a rough figure before the spend (artifact field before Start, End screen before the summary, confirmation before "Update the artifact"); tests assert the warnings appear only when an artifact is loaded and do not appear for other modes.
- Live suggestions verifiably do not carry the full artifact (test asserts the prompt size stays bounded for a 100 000-character artifact).
- `docs/dev/spec-sync-plan.md` exists, private, in `docs/dev/CLEANUP.md`.
- `REPORT.md` has a new dated section: what changed, verified here, needs a Mac and a real call, known gaps, decisions needing the owner (especially: the artifact size cap, what the live prompt gets of the artifact, and whether "Update the artifact" should also be offered in other modes).
