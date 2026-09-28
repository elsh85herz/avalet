# Live checklist: plan (private, delete before going public)

CLOUD_TASK_4 phase 1. Findings: `checklist-ux-research.md`. Tier gating
(`featureGate`, the locked row and preview) is not touched.

## 1. Data shape

`AgendaStatusItem` and `ActionItem` (`electron/shared/ipc-contract.ts`) gain
three optional fields:

| Field | Meaning | Source |
|---|---|---|
| `quote` | the exact words that closed or raised the item, up to about 30 words | model, then checked locally |
| `speaker` | `"me"` or `"other"`, who said the quote | the matched transcript segment |
| `at` | epoch ms of the matched segment (same clock as `TranscriptSegment.at`) | the matched transcript segment |

All optional: meetings saved before this change, manual items and items the
model gave no quote for simply have none. `note` stays the short verdict
(12 words). Nothing is renamed, so old meeting files load unchanged.

## 2. Prompt and parser

- `buildTrackerSystemPrompt(mode)` asks for `"quote"` on each agenda change
  and each new action: "copy the exact words from the excerpt, do not
  paraphrase or translate, at most 30 words; empty string if no single
  sentence says it". `note` stays the verdict in at most 12 words.
- One line per mode says which sentence counts as the evidence (requirements:
  the stakeholder's sentence with the value or rule; grooming: the agreement
  or the assumption behind an estimate; demo: what was said when it was shown
  or found missing; review: the remark or question as said, and the decision;
  free: the answer). Interview is still excluded from the tracker.
- `parseTrackerReply` reads `quote` when it is a string and tolerates it
  missing, empty or of another type (then no quote). Everything else parses
  as before.

## 3. Grounding (no invented quotes)

`locateQuote(quote, segments)`: word stems (the same 5-letter stems as
`sameTask`) of the quote against every run of 1 to 3 consecutive segments of
the excerpt that was sent. Best run wins if it shares at least 60% of the
quote's stems; `at` is the first segment of that run, `speaker` the segment
with the most shared stems. Below the threshold the quote is dropped (and so
are `at`/`speaker`): a quote the transcript does not back is worse than none.
Pure function, tested.

## 4. Folding a reply in (`applyTrackerReply`)

Unchanged rules: forward only (open, active, closed), a closed item is never
changed again by the model, manual items are never touched, new tasks only
when `sameTask` finds no match. Added: a closing or activating change that
carries a grounded quote sets `quote/speaker/at` on the item; a new action
gets them too. A change without a grounded quote keeps what the item had.

`mergeSummaryAnalysis` (after the summary): an item or action that already
has a quote keeps it, whatever the summary says, because the summary does not
produce quotes.

## 5. Rendering

Principle: the live suggestion is the primary element: largest text (15 px
vs 12 px for the checklist), full contrast (the checklist uses muted text for
detail), and it always keeps most of the height. The checklist is a glance,
opened on purpose.

Overlay (380 px wide):

1. **Folded row stays where it is** (under the controls, no layout jump),
   collapsed by default, with counts: `1/3`, actions, "N new".
2. **Bounded tray.** Opened, the list scrolls inside at most about a third of
   the overlay height (`max-height: 32vh`, was a fixed 240 px, which is 43% of
   the default 560 px).
3. **Folds itself when a new suggestion starts**, unless the pointer is
   over the tray or someone is typing in its fields (a button that merely
   kept focus after a click does not count). Same for
   the mode board. So a new answer is never hidden behind a list the analyst
   opened a minute ago.
4. **One line per item**; a tap on the text opens that item's detail: the
   verdict (note), the quote in quotes, who said it and the time from the
   meeting start (`Собеседник, 12:04`). One item open at a time.
5. **Rare controls behind one link**: the kind select + input + Add row and
   "Refresh now" are shown only after "Add" in the tray's footer ("Add item"
   and "Refresh" as two small links, the form appears on demand).

Main window (`MeetingView`, has room): each agenda item and action shows its
note and quote with speaker, and a time button; the button scrolls the
transcript to that segment and highlights it for a moment. This is the
"jump to transcript" for reading the context after or during the call.

Protocol export: under an item or action with a quote, one quoted line
`> «...» (Собеседник, 00:12:04)`. The raw transcript export is unchanged.

Guide (`HowItWorks.tsx`): the checklist page screenshot is regenerated from
the screenshot mode with the new tray and one item opened; the text mentions
tapping an item to see what was said.

## 6. What is deliberately not done

- No third "decisions" list: decisions close agenda items (verdict + quote);
  review mode's board already lists `Решение:` lines. More lists = more weight.
- No topic grouping: short, analyst-ordered agendas; would need another model
  decision per item.
- No change to pacing (30/90 s, 80 chars) or to the interview exclusion.
- No quote in the summary JSON: the live pass has the fresh excerpt, the
  summary sees a long transcript and would need a bigger output budget.
