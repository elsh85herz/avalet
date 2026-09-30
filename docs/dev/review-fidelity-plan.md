# Review fidelity plan (CLOUD_TASK_6), private

Written 2026-09-30 on top of `aa85949`. Delete before going public (listed in `CLEANUP.md`).

The owner's call is not in the repository and must not be. Everything below is
reasoned from the code and reproduced with an invented call (a "parcel" record
whose "items" are either two parallel lists or a map from item type to a list of
quantities).

## What the summary sees today

`electron/meeting-summary.ts` sends one prompt (`buildSummaryPrompt`) plus the
transcript as `[hh:mm:ss] [Я]: ...` / `[Собеседник]: ...`. The review mode's
guidance (`MODE_SUMMARY.review`) says what goes under each heading. The JSON tail
after `@@AVALET_JSON@@` carries agenda marks and actions, and `decisions` only for
a review meeting with a document.

## Finding 1: the unanswered question disappeared

- Where: `electron/modes.ts` `MODE_SUMMARY.review.guidance` says
  "'Новые вопросы и риски' holds only what was raised in the call and is absent
  from the briefing" and the general rule in `summary-prompt.ts` says "if a
  section has nothing, write '- нет'". Nothing says that a question asked and
  not answered is a risk. The "Обсуждения" block asks for "what is still
  unclear", which invites a neutral retelling ("discussed whether it is harder
  or easier").
- Checked: read the prompt as a whole; no sentence mentions unanswered,
  evasive, or deferred questions, nor repetition. `DECISIONS_RULES` has `open`
  for "a question left without an answer", but that list exists only with a
  document, so a review call without one had no structured place for it at all.
- Fix: one rule block for review (`UNANSWERED_RULES` in
  `electron/shared/review-rules.ts`): a question asked and not answered, answered
  evasively, or deferred ("I will ask ...") goes under "Новые вопросы и риски" as
  `Вопрос без ответа: <вопрос> - задал <кто> - <передан кому / без ответа>
  (задан N раза) - «цитата» (мм:сс)`; one item per question with the repeat count;
  "- нет" only when nothing qualifies; a question the decisions section cannot
  close is `open` and never "discussed". In the `decisions` tail such a question
  is `status: "open"` with an optional `asked` count; open rows never start
  checked (they already did not, `include` is only for grounded `accepted`).
- Other modes: free, requirements, grooming and demo have "Открытые вопросы".
  They get one sentence (the same rule, pointed at that heading). Headings and
  boards do not change. Interview has no such heading and is left alone.

## Finding 2: the decision did not say what its key is

- Where: `DECISIONS_RULES.text` asks for "one line phrased as an edit", nothing
  asks for the meaning of the terms. The model compressed "map from key to an
  array of values" and never had to say what the key is. The same holds for the
  text bullets under "Решения по открытым вопросам".
- Checked: no word about structure, key, value, unit, or example in the prompt.
- Fix:
  - Prompt (review): when a decision defines a data or interface shape, the
    bullet states the subject terms in plain words ("ключ - ..., значение - ...,
    одна запись на ..."), in the speakers' own words, and repeats the speakers'
    example if one was given. If the call left a term unclear, the bullet says
    `не уточнено: <какой термин>` and the item also goes to open questions. The
    model must not choose an interpretation.
  - Data: optional `terms` on the decision (JSON and `Decision`): the pinned terms
    or `не уточнено: ...`. Parser tolerant (missing or non-string gives "").
  - Code guard (`termsCheck` in `electron/shared/decision-terms.ts`, no model
    call): an `accepted` decision whose text has a structure word (list, array,
    map, key, field, table, column, and the Russian forms) but empty `terms` is
    "terms not pinned"; `terms` starting with `не уточнено` is "unclear". Both
    show a visible mark in the checklist and make the row start unchecked (the
    same reasoning as `ungrounded`: a decision that cannot be applied without
    choosing an interpretation must not be applied by default). The analyst
    edits `terms` in the row and checks it by hand.
  - The patch call gets `terms` with each decision and a rule: a decision whose
    terms say `не уточнено` is returned in `skipped`, never guessed.
  - The decisions `.md` export gets a "Terms" line.
- Second verification pass: adopted, on request only (see DECISIONS.md). A
  button "Check against the quotes" in the decisions panel, with a confirmation
  showing the rough tokens first. It sends only the accepted decisions, each with
  its quote and the two transcript lines before and after it (without them the
  check cannot see an example given a sentence later, and would flag everything).
  It may only downgrade (`accepted` to `proposed`) or add `не уточнено`; the code
  enforces that and never touches rows the analyst edited by hand. Rough cost:
  about 300 tokens of instructions plus about 250 per decision, so 5 decisions
  cost about 1,600 tokens in and 400 out, under 10% of a 30-minute summary.

## Finding 3: the backward-compatibility question was dropped

- Where: the same gap as finding 1. A question asked once, with no answer, has
  no heading that asks for it, so it was left out as "not a topic".
- Fix: the finding 1 rule explicitly covers a question asked once: every
  question the analyst or the other side asked that got no answer is listed,
  whether asked once or several times.

## Finding 4: participants and the briefing contradiction

- Where:
  - `buildProtocolMarkdown` writes `Участники: ` with nothing after it for every
    meeting: there is no data for it at all.
  - The prompt calls the briefing "reference only" (correct) but never says what
    to do when the call contradicts it, so the model silently followed one side.
  - The transcript only has `[Я]` / `[Собеседник]`; the recognizer gives no names.
- Checked: grep for participants: only the empty label in the export and in the
  i18n strings.
- Fix (review mode; see DECISIONS.md for why not all modes):
  - Prompt rule: a fact in the briefing that the call contradicts goes under
    "Новые вопросы и риски" as `Расхождение с контекстом: в контексте X, на
    встрече Y`; the summary does not pick a side.
  - JSON tail `participants`: `[{ "who": "...", "role": "...", "kind": "named" |
    "inferred" | "third_party" }]`. `named` only for a name said in the call;
    `inferred` is a role reasoned from the call ("по ходу встречи"); a person
    mentioned as someone to contact is `third_party` ("не на встрече").
  - Code guard (`groundParticipants`): a `who` that does not occur in the
    transcript is dropped (the entry keeps its role, as `inferred` if it was
    `named`). Empty list stays empty.
  - The protocol's participants line and the meeting screen show: confirmed
    names; "по ходу встречи: ..."; "третьи лица, не на встрече: ...".

## Finding 5: noisy transcript

### Duplicates

- Checked by reading: `EchoFilter` (electron/echo-filter.ts) runs only in
  `LiveSession.ingestAudioChunk`, before a segment is committed; the saved
  transcript is what passed it. Nothing runs over the saved segments.
- Checked by a synthetic test (`echo-filter.test.ts`, "a mic copy committed
  before the matching other segment arrives is not caught live"): a mic segment
  is held for 7 s after it was transcribed. The other channel is cut at up to
  12 s (`segmenter.ts` `maxMs`) and both channels queue on the same sidecar
  process, so the clean copy of long speech can arrive after the hold expired.
  Then both copies are saved. A second cause is an echo copy garbled enough to
  fail the text comparison; nothing in code can recover that, and it is not
  attempted.
- Fix: `electron/transcript-clean.ts` `cleanTranscript` (pure) runs the same
  comparison (`looksLikeEcho`, same thresholds, same 1.5 s tolerance) over the
  whole saved transcript when a meeting ends and again before a summary (older
  meetings). Segments now keep their `end`; older ones get an estimate from the
  text length. A mic segment that repeats overlapping other-side speech is kept
  in the record with `filtered: "echo"`; the view hides it behind "show hidden
  lines", the exports and the summary input leave it out. Lines that differ in
  meaning (both talking at once) fail the comparison and stay.
- Known gap: when the system audio also carries the analyst's own voice (a
  conferencing app that plays it back), the other-side copy wins, as in the live
  filter, and the analyst's line is attributed to the other side. There is no
  reliable signal in the saved data to tell which copy is the source.

### Invented credit lines

- Fix: `electron/transcript-noise.ts`, a best-effort blocklist of credit-style
  phrases (RU and EN: subtitles by, subtitle editor, proofreader, translation by,
  "Субтитры сделал ...", "Редактор субтитров ...", "Корректор ..."), matched
  against the whole segment text only, and only when the segment is in a quiet
  stretch: the engine said "no speech" (see below) or the same channel has no
  other speech within 2 s before and after. Kept in the record with
  `filtered: "noise"`, left out of the summary input and the exports, shown under
  "show hidden lines". No real names in the list (patterns, not strings).

### Garbled words

- Checked: `python-sidecar/server.py` returns only the joined text, but
  faster-whisper's segments carry `avg_logprob` and `no_speech_prob`.
- Fix: the sidecar returns `avg_logprob` (duration-weighted over the chunk's
  segments) and `no_speech_prob` (the highest). The main process marks a saved
  segment `lowConfidence` below -1.0 (faster-whisper's own default
  `log_prob_threshold`) and `quiet` above 0.6 (its `no_speech_threshold`). The
  summary transcript tags low-confidence lines `(неразборчиво)` and the prompt
  says they cannot be quoted as evidence for an accepted decision; in code, an
  accepted decision whose quote lands on such a line is marked "weak quote" and
  starts unchecked. Older records have no value and are treated as normal.
- Not attempted: fixing the words.

### Quotes after cleaning

`locateQuote` and the summary's grounding get the cleaned list (hidden lines
left out), so a quote no longer lands on the echo copy with the wrong speaker.
The "jump to transcript" keeps working because the view keeps the original
index of every line.

## Token cost (owner rule: warn first)

- Review summary rules (unanswered, terms, contradictions, participants): about
  3,000 characters of instructions and about 150 tokens more in the answer, so
  about 1,100 tokens more per review summary. The End screen note for review
  meetings says so before Summarize, with or without a document.
- Other modes: one sentence (about 80 tokens) in the summary prompt; below any
  useful notice threshold (under 1% of a 30-minute summary); logged, and listed
  as an owner decision.
- Verification pass: only on request, with its own confirmation and figure.
- Patch call: `terms` adds a few dozen characters per decision; the existing
  confirmation figure counts it automatically.
