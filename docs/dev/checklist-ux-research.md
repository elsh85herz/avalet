# Live checklist: research (private, delete before going public)

Written 2026-09-28 for CLOUD_TASK_4 phase 0. Structure only; no product names
in anything that ships. Plan that follows from it: `checklist-ux-plan.md`.

## 1. What the tracker does today (code read)

- `electron/live-tracker.ts` schedules a non-streaming background call
  (`purpose: tracker`, the cheaper background model) on a pause of the other
  side, at most every 30 s, at least every 90 s while speech goes on, only with
  80+ new characters. Only exclusion: `meeting.mode === "interview"`.
- Input (`buildTrackerUserPrompt`): agenda with states, the known action
  tasks, the newest 4,500 characters of transcript (`[Я]` / `[Собеседник]`).
- Output (`parseTrackerReply`): `agenda[{index,state,note}]`,
  `actions[{task,owner,due}]`. `note` is "the answer in at most 12 words when
  closed, or what is still missing when active".
- `applyTrackerReply`: marks only move forward, manual marks never change,
  a task is new only if `sameTask` finds no match.
- `mergeSummaryAnalysis` (after the summary): the summary's agenda wins over
  the live marks except manual ones; confirmed/dismissed actions stay.
- Stored on the meeting (`agendaStatus`, `actions`), shown in the overlay
  panel, in the main window (`MeetingView`, agenda block) and in the protocol
  export (`- [x] question (note)`, action table).

## 2. The problem class behind "the note drops what was said"

The dogfooding case (review mode): a colleague asks a question about section
3; the tracker closes the agenda item with a note like "принято, уточнить
формулировку". The words that were actually said (the question, the remark,
who said it) are gone. The analyst has to scroll the transcript to find them.

This is not one field being too short. The tracker has a single text slot per
item, and three different things compete for it:

1. **Verdict**: closed / still open and in a few words why. Glanced at live.
2. **Evidence**: the exact words that closed it or raised it, and who said
   them. Needed after the call (protocol, follow-up letters, disputes: "you
   said X").
3. **Location**: where in the call it happened, to read the surrounding
   context without re-reading everything.

A 12-word cap is right for (1) and destroys (2) and (3). Widening the cap
makes (1) worse (a long note in a 380 px overlay) and still loses (3), and a
paraphrase is not evidence: the model rewrites the question in its own words.
So the fix is a separate verbatim slot plus a location, not a longer note.

Two more cases of the same class found while reading:

- **Action points** keep `task/owner/due` only. "Я пришлю описание до
  пятницы" becomes `Прислать описание / Я / до пятницы`; the actual promise
  (and whether it was a promise or a maybe) is lost. Same fix.
- **The summary merge** replaces live notes by the summary's notes. If the
  live pass kept evidence, the merge must not throw it away.

Risk of the fix: a model asked for a "quote" may paraphrase or invent one.
The transcript is on the client, so a quote can be checked locally against
the excerpt that was sent (word-stem overlap) and dropped when it does not
match. That check also gives the location for free: the matched segment's
`at` time and speaker. No extra call, no timestamps in the prompt.

## 3. Per mode: what helps navigate back through "what was asked / said"

From `MODE_INSTRUCTIONS` (`electron/modes.ts`):

| Mode | What an agenda item usually is | What closes it | Evidence worth keeping | Location worth keeping |
|---|---|---|---|---|
| requirements | a question to the stakeholder (threshold, who confirms, what on failure) | the stakeholder's answer | the stakeholder's sentence with the value or rule (testable wording comes from the exact words) | yes: context around a rule |
| grooming | a question about scope, dependencies, done criteria | the team's agreement or an estimate assumption | the sentence with the agreement or the assumption | yes |
| demo | a check to see (empty state, permissions, error) | it was shown, or a deviation was stated | what was said when shown ("это пока не сделано") | yes: disputes at sign-off |
| review | an open question on the document | a decision (accepted / rejected / to check) | the remark or question as said, and who said it | yes |
| free | whatever the agenda says | an answer | the answer sentence | yes |
| interview | no agenda tracking (excluded today) | n/a | n/a | n/a |

Conclusions:

- The same two added slots (verbatim quote with speaker, and a time) serve
  every mode; what differs is *which* sentence counts as evidence. That is a
  one-line hint per mode in the tracker prompt, not a different data shape.
- "Decisions" do not need a third list in the tracker: in every mode a
  decision is what closes an agenda item (verdict = note, evidence = quote).
  Decisions without an agenda item already land on the mode board in review
  (`Решение:` lines from suggestions). A third list would add weight to the
  overlay, which is the other half of the problem.
- Interview stays excluded: there is no agenda to track and the live answer
  is the whole point of that mode.
- Grouping by topic was considered and rejected for now: agendas are short
  (3-10 questions) and already ordered by the analyst; grouping needs another
  model decision per item and more UI.

## 4. Visual weight in the overlay today

Screenshot `docs/screens/overlay-advanced-checklist-dark.png` (380x560):
with the panel open, the panel takes about 260 px (agenda, actions, the
kind select + input + Add row, "Refresh now"); the suggestion text is left
with three lines above the quick actions. The panel sits *above* the
suggestion, so opening it pushes the main text down. It is collapsed by
default, but once opened it stays open for the rest of the call, even when a
new suggestion arrives. The mode board (CLOUD_TASK_3) uses the same panel
style and has the same issue when open.

What takes the space: the add row and the refresh button are always present
in the open panel (two rows used a few times per meeting at most), and each
item always shows its note line.

## 5. How comparable live-notes / copilot UIs separate the two

Structure seen across current meeting-assistant products and their docs
(names kept out on purpose, sources at the end):

1. **One primary stream, structured state secondary.** The live answer or
   transcript is the main surface; action items, decisions and bookmarks are
   a separate, smaller surface (side rail, tab, or a panel folded by
   default). Structured state rarely expands on its own.
2. **Counts and badges instead of auto-expanding.** New items announce
   themselves with a count ("2 new"), the user opens the list when ready.
3. **Progressive disclosure per item.** Lists show one line per item; detail
   (quote, owner, time) opens on a tap. Nobody shows every detail of every
   item in a live view.
4. **Timestamp back-links.** Extracted items (action items, highlights,
   chapters) carry the time they were said and link back into the
   transcript/recording at that point; the item text is a pointer, the
   transcript is the evidence. Diarized transcripts give "who said it".
5. **Owner and due on every action item**, marked as not named when absent.
6. **Rare edits behind a small affordance** ("+ add"), not a permanent form.
7. **Bounded height.** Side panels scroll inside themselves; the primary
   stream keeps a guaranteed share of the window.

Applied to a 380 px floating overlay (no room for a side rail): a folded row
with counts (already there), a bounded tray that folds itself when a new
suggestion arrives, one line per item with detail on tap, rare controls
behind "+", and the full evidence with a jump-to-transcript in the main
window, which has the room.

## Sources (checked 2026-09-28)

- Action item best practice (owner and due on every item, consistent timestamps): https://smithery.ai/skills/github/meeting-minutes
- Timestamped sections and extracted action items as separate entities, diarized transcripts: https://www.assemblyai.com/solutions/voice-agents-meeting-intelligence-ai-notetakers
- Live bookmarks and timestamped manual notes during a call: https://www.meetjamie.ai/blog/ai-meeting-assistant
- Meeting notes with action items (owner, due, status): https://otter.ai/blog/meeting-notes-template-with-action-items , https://www.wrike.com/blog/action-items-with-meeting-notes-template/
- Progressive disclosure as a general pattern: Nielsen Norman Group, "Progressive Disclosure" (nngroup.com/articles/progressive-disclosure), known reference, not re-fetched here.
