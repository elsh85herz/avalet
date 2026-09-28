# Automatic suggestions: quieter defaults (private, delete before going public)

CLOUD_TASK_4 phase 3, 2026-09-28. Code: `electron/live-session.ts`
(`AUTO_PACING`, `shouldAutoSuggest`), tests:
`electron/live-session-triggers.test.ts`.

## 1. What fired before

One pace for every mode (tuned twice in live use in 0.1): a suggestion on
any pause of the other side, on a question or change cue, or after 45 s and
260 characters of plain speech; never closer than 6 s. In a normal call the
other side pauses after nearly every phrase, so in practice this was "one
call every 6 to 10 seconds of talk". Each call resends the system prompt
(2.5 to 4 thousand characters), the briefing (up to 3,500), the last 2,200
characters of transcript and the previous answer.

## 2. Options weighed

- **(a) Lower frequency by default.** Keeps the product behaviour (things
  appear on their own), cuts cost in proportion.
- **(b) Auto off by default in modes with quick actions.** The biggest
  saving, but it breaks the CLOUD_TASK_3 running boards (requirements,
  grooming, demo, review): they are filled from the marker lines of the
  automatic suggestions. With auto off they stay empty unless the analyst
  keeps clicking. That is a drop in the value of modes that tested well,
  which CLOUD_TASK_4 section 1 forbids.
- **(c) Both.** Inherits the problem of (b).

**Chosen: (a), per mode.** The toggle stays on by default everywhere; the
manual paths (typed question, quick actions including "Explain", Screenshot,
Process now when auto is off) ignore the pace entirely and are unchanged.

## 3. The paces

| Profile | Modes | Min gap | Pause fires after | Safety net (no cue, no pause) |
|---|---|---|---|---|
| live | interview | 6 s | any pause | 45 s and 260 chars |
| balanced | free | 15 s | 120 new chars | 60 s and 400 chars |
| quiet | requirements, grooming, demo, review | 25 s | 300 new chars | 90 s and 600 chars |

A question or change cue fires in every profile once the minimum gap has
passed. Reasons:

- **Interview keeps the old pace.** Answering the question that was just
  asked is the whole point, and it already has no quick actions (a permanent
  Process now instead).
- **Free is calmer but still active.** It has no mode prompt structure and no
  board, so automatic suggestions stay its main help; it is also the default
  mode, so most users feel this change first.
- **Quiet for modes with a board and quick actions.** 300 characters is
  about 20 s of speech: a substantial statement (a wish to restate as a
  requirement, a remark on the document) still produces a suggestion with
  its marker line, so the boards keep filling, just not after every phrase.

## 4. Token cost before and after (rough)

Simulated 10-minute call (`simulateCall` in the test file: phrases of 3-9 s
at about 14 characters a second, turns between the other side and the
analyst, a question in 10-40% of phrases, every phrase ending on a pause,
3 s per generation). Automatic calls per 10 minutes:

| Questions in phrases | Old pace (every mode) | Balanced (free) | Quiet (board modes) |
|---|---|---|---|
| 10% | 57 | 33 | 20 |
| 25% | 61 | 33 | 21 |
| 40% | 65 | 33 | 22 |

So about **6 calls a minute before, about 3.3 in free, about 2.1 in the
board modes**, interview unchanged.

Per call, estimated from the prompt sizes (`buildSystemPrompt()`: free 2,485
characters, requirements 3,984, English at about 4 characters a token; a
half-filled briefing and the full 2,200-character transcript in Russian at
about 3 characters a token; a short previous answer): about **2,500 input and
150 output tokens**. Per hour of talk:

| | Calls per hour | Tokens per hour (approx.) | Change |
|---|---|---|---|
| Old pace | ~360 | ~950,000 | |
| Free (balanced) | ~200 | ~530,000 | about -45% |
| Board modes (quiet) | ~125 | ~330,000 | about -65% |
| Interview (live) | ~360 | ~950,000 | unchanged |

These are estimates from a synthetic call and prompt sizes, not measured on
real meetings. The ledger (`avalet-usage.json`, purpose `suggestion`) gives
the real numbers after a week of use; that is the check.

## 5. What was not changed

- The Auto toggle, Process now, quick actions and "Explain" (untouched).
- Where Process now appears (only with auto off, and always in interview).
  Showing it always would add a fifth button to the free mode's row at 380 px.
- The live checklist pacing (30/90 s, 80 chars), a separate background call
  on the cheaper model.
