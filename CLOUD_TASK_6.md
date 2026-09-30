# Avalet: honest summaries of review calls (unanswered questions are risks, ambiguous decisions are pinned down, transcript noise is cut) (autonomous cloud session)

You are working alone in the background on branch `release/v0.2-autopilot`, continuing past the last commit on it. Nobody will answer questions. Decide by the rules below and log every non-obvious decision in `docs/dev/DECISIONS.md` (one line each: decision, reason). Keep `docs/dev/PROGRESS.md` current so a fresh session can resume from it and this file alone.

Read first: `CLOUD_TASK.md` (sections 0-3, still in force: copy rules, "do not claim anything is verified unless you ran it", Simple/Advanced and own-key/trial/pro model), `CLOUD_TASK_4.md`, `CLOUD_TASK_5.md` (house style and the review-mode design; if its phases are not all done yet, do not redo them, work on top of what exists and touch only what this file lists), `docs/dev/REPORT.md`, `docs/dev/DECISIONS.md`. This task does not touch tier/billing gating, speech models, or the auto-hint pacing.

## 0. Why this task exists (the owner's real call, condensed)

The owner (a systems analyst) ran a review call with a developer, with Avalet recording. Afterwards the owner judged the result. Findings, in order of harm:

1. **The unresolved part of the discussion was hidden.** The analyst asked the same question three or four times ("how does this work when a key has several columns?") and never got an answer; the developer moved on with "small issue, I will ask the product owner". The summary turned it into a neutral sentence ("we discussed whether it is harder or easier") and the section "New questions and risks" said "none". A question that was asked and not answered is the most important thing to carry out of such a call, and it was the thing lost.
2. **The decision was recorded without saying what exactly it is.** The decision was "the value becomes a map from key to an array of values". The summary did not say what the map key is (a field name, or a field value). The transcript, read literally, suggested the second; the developer's own example later showed the first. Anyone applying the decision would have applied the wrong one. A decision is only usable when its subject terms are pinned: what is the key, what is the value, what is the unit.
3. **Something the analyst asked was dropped.** The analyst asked once whether backward compatibility still holds under the new format. No answer followed. It is absent from the summary.
4. **Context of the participants was lost.** The participants field was empty. It later turned out from the transcript that the developer and the product owner are two different people (the developer said "I will ping him"), which the owner's own briefing said was one person. The summary should surface a contradiction between the briefing and the call instead of silently following one of them.
5. **The transcript was noisy.** Each line appeared twice, once under each speaker, which suggests the microphone and the system audio were both captured and the echo filter (`electron/echo-filter.ts`) did not remove it in the saved transcript; the recognizer produced garbled words and invented credit lines ("subtitle editor ...", "proofreader ...") in silent stretches; a few names appeared that nobody said. The summary was mostly right anyway, but nobody can quote from such a transcript.

Things that went well and must not regress: the accepted decision and the action item were captured correctly; "not discussed" for briefing questions nobody touched was honest; profanity and off-topic chatter stayed out of the summary.

## 1. Rules that must not regress

- The grounding rule of `electron/summary-prompt.ts`: every bullet rests on a line of the transcript; the briefing is reference only. "Agreed" only with explicit agreement, otherwise "did not object" or "was not said".
- Do not create a new meeting mode. This task changes the `review` mode and, where the change is generic (transcript hygiene), all modes. Other modes' headings and boards stay.
- Any change that raises token spend warns the user first in plain words with a rough figure, dismissible, no new paywall, same counters as `UsageCounter.tsx` and `electron/metering/` (owner rule from `CLOUD_TASK_5.md`). A second pass over the transcript (see phase 2) is such a change: decide and log whether it is worth it, and if it is on by default, warn on the End screen.
- Privacy: no new network destinations, no logging of transcript or summary content, `electron/log-hygiene.test.ts` stays green.
- Test fixtures are synthetic. Never put real company, system, client or employee names, real endpoints or real transcript text into the repo. Reproduce the situation with an invented call (for example two people discussing whether a "parcel" record stores its "items" as two parallel lists or as a map from item type to a list of quantities).

## 2. Work plan

### Phase 0: Ground truth

- Read `electron/summary-prompt.ts`, `electron/summary-format.ts`, `electron/meeting-summary.ts`, `electron/modes.ts` (`review` and the other modes' `headings` and `guidance`), `electron/echo-filter.ts` and where it is wired, how the transcript is stored in `electron/meetings-store.ts` and exported, `electron/live-tracker*.ts`.
- Write a private `docs/dev/review-fidelity-plan.md` (add to the delete-before-public list in `docs/dev/CLEANUP.md` at once): for each of the five findings, where in the code the cause most likely is, what you checked to confirm it, and the fix chosen with a reason. For finding 5, first establish by reading and by a synthetic test whether the echo filter runs on the saved transcript or only on the live path; do not assume.

### Phase 1: Unanswered questions become risks (review mode, then check the other modes)

- Add to the summary prompt for `review` an explicit rule: a question that was asked in the call and got no answer, an evasive answer, or was deferred to someone else ("I will ask ...") is **not** a neutral discussion topic. It goes to "Новые вопросы и риски" (or the mode's equivalent) as `вопрос - кто задал - кому передан или "без ответа"`, with a quote and time. The section may say "нет" only when there is no such item, and the prompt must say so.
- Same for a question the summary's own "Решения" section cannot close: status `open`, never softened into "discussed".
- Include a repeated question as one item with a count ("asked 3 times") since repetition is the signal.
- Check the other modes with a `Риски` or open-questions heading (`modes.ts`) and apply the same rule where it fits; do not change headings.
- In the structured tail (see `CLOUD_TASK_5.md` phase 2, `decisions` with status `open`): unanswered questions appear there with `status: "open"` too, so the decisions checklist shows them; they are never checked for the update by default.

### Phase 2: Decisions pin their terms

- For `review` (and only where a decision changes a data or interface shape) the summary prompt asks: when a decision defines a structure, the bullet must state the subject terms in plain words, "the key is X (a field name / a field value / an id), the value is Y, one entry per Z", using the speakers' own words and, if the speakers gave an example in the call, that example. If the call did not make the term clear, the bullet says which term is unclear and the item also goes to open questions. The model must not choose an interpretation.
- Add a `terms` field to a structured decision (optional string): the pinned terms or `не уточнено: ...`. The checklist row from `CLOUD_TASK_5.md` phase 3 shows it and highlights `не уточнено`. Parser tolerant as before.
- A cheap deterministic guard in code: an accepted decision whose text contains a structure word (list, array, map, key, field, table, column, ключ, мапа, массив, поле, таблица, колонка) but whose `terms` is empty gets a visible "terms not pinned" mark in the checklist. No extra model call for this.
- Decide and log (with a rough token figure) whether a second, small verification pass is worth it: it receives only the accepted decisions with their quotes and asks "does the quote say what the decision claims, and are all subject terms pinned"; it may only downgrade a decision or add `не уточнено`, never invent. If adopted, it is optional, off by default in Simple, and warned about before it runs. If not adopted, log why.

### Phase 3: Contradictions with the briefing and participants

- The summary prompt gets a rule: if what the call reveals contradicts a fact stated in the briefing (for example the briefing says two roles are one person, the call shows two people), the summary lists it under the mode's risks section as `Расхождение с контекстом: в контексте X, на встрече Y`, and does not silently follow either side.
- Participants: if the recognizer gave no speaker names, the summary states the roles that can be reasoned from the call itself (who asks the analyst's questions, who owns the implementation, who is mentioned as a third party) under a plain label, "по ходу встречи", separate from confirmed names. Never a name that was not said. A person mentioned as somebody to be contacted is listed as "third party, not in the call".
- Keep the participants line empty rather than invent one when the call gives nothing.

### Phase 4: Transcript hygiene

- **Duplicates.** After the check in phase 0, fix the cause so the saved and exported transcript has one line per utterance. If the echo filter only runs live, run the same comparison over the saved segments when a meeting is finished (pure function, a test with a synthetic transcript where every line is present in both channels, plus one where both really speak at once and both lines must stay). Do not delete lines that differ in meaning.
- **Invented credit lines.** Add a small, conservative filter for known recognizer hallucinations in silent stretches: a segment whose whole text matches a short list of credit-style phrases ("subtitles by ...", "editor ...", "proofreader ...", and the equivalent Russian forms) and that sits between silence or very low-energy audio is dropped from the summary input. Keep the segment in the raw transcript, marked as filtered, so nothing disappears silently; the list lives in one file with a comment saying it is a best-effort blocklist.
- **Garbled words.** Do not try to fix them. Instead, give the summary a per-segment confidence hint if the speech engine exposes one (check `python-sidecar/server.py`); when it does, the summary prompt is told that low-confidence segments cannot be quoted as evidence for an accepted decision. If the engine gives no confidence, say so in `DECISIONS.md` and skip this item.
- Reflect the cleaned transcript in the export and in `QuoteRef` locating (`locateQuote`), so quotes still find their line.

### Phase 5: Tests, docs, verification

- Unit tests (no real model calls, assert the prompt text and the parsers): the unanswered-question rule is in the `review` prompt; "нет" allowed only when nothing qualifies; `terms` parsed, malformed tolerated; the deterministic terms guard marks a structure decision with empty terms; the briefing-contradiction rule is in the prompt; echo dedup and credit-line filter on synthetic transcripts; `locateQuote` still works after dedup; log hygiene test covers any new field.
- A synthetic end-to-end fixture in `e2e/` and `server-mock/`: a scripted `review` call built from the invented "parcel" example, with (a) a decision that defines a map without saying what the key is, (b) a question asked three times and deferred, (c) a role mismatch against the briefing, (d) doubled lines and one invented credit line. The mock summary reply is a fixed JSON; the checks are about how the app parses, shows and marks it (open question visible, "terms not pinned" mark, contradiction listed), not about model quality.
- README and README.ru: one or two sentences on what a review summary now guarantees (unanswered questions are shown as risks, decisions say what their terms mean); keep the copy rules.
- `npm run check` and `npm run e2e` (Linux: `npm run e2e:xvfb`) green.

## 3. Do not do in this task

- No new mode, no changes to other modes' headings, boards or pickers.
- No tier, billing or locking changes; no new network destination.
- Do not let the model or code fill in an interpretation the speakers did not give. `не уточнено` is a valid, wanted output.
- No merging of `main`, no tags, no releases, no repo settings. Do not touch `wip/model-manager`.
- Do not claim real-model summary quality is verified. It can only be judged on a real call by the owner. Say so.

## 4. Definition of done

- The five findings each have a fix or a logged reason in `docs/dev/review-fidelity-plan.md` (private, listed in `CLEANUP.md`).
- On the synthetic fixture: the repeated unanswered question shows up as an open item with a count; the map decision shows a `terms` line or a `не уточнено` mark; the role mismatch is listed; the saved transcript has no doubled lines and no filtered credit line in the summary input.
- Tests above written and green, `npm run check` and e2e green.
- `REPORT.md` has a new dated section: what changed, verified here, what needs a real call, known gaps, decisions needing the owner (especially: whether the second verification pass is on by default, and the blocklist wording).
