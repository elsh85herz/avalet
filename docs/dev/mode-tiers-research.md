# Mode tiers: research (PRIVATE, delete before going public)

Private working note for the owner (CLOUD_TASK_3 phase 0). Listed in
`CLEANUP.md` under "delete before going public". Nothing here ships: no
product names from this file may go into the app, README or comments.

Date of the web look-up: 2026-09-27. Pricing pages change often; the
structure below is what matters, not the numbers.

## 1. What each mode already does (from `electron/modes.ts`)

| Mode | The prompt listens for and produces | Line markers the model already writes | What would make it visible, not only readable in the block text |
|---|---|---|---|
| requirements | actors, triggers, flows and exceptions, data, integrations, rules, non-functional constraints, out of scope, acceptance criteria; contradictions with earlier statements | `Требование:` (one candidate requirement per line, then the missing details) | A running list of the candidate requirements as they appear, plus the risks raised by the existing "Risks?" quick action. The agenda checklist (live tracker) fits this mode best: requirements meetings usually have a question list. |
| grooming | scope in/out, definition of done, dependencies, unknowns blocking an estimate, hidden work (migration, flags, monitoring, rollback, access, docs, load testing); proposes 2-4 slices with acceptance criteria; calls out scope creep | none yet for slices; scope creep phrased as `это уже отдельная задача: ...` inside a sentence | A running list of the proposed **slices** (separate from the agenda checklist: slices are the output of grooming, agenda items are its input), plus a "parking lot" of the things called out as separate tasks. In grooming the "Risks?" button asks about hidden work and size-changing risks (the prompt's own list); the label stays "Risks?" because a longer one wraps the quick-action row at 380 px. Needs two markers in the prompt: `Срез:` and `Отдельная задача:`. |
| demo | deviations from requirements, silently changed scope, unshown states (empty, errors, permissions, boundaries); sign-off list at the end | `Попросите показать:`, `Отклонение:` | A running list of **deviations** and of the checks still to ask for. Concrete, markers exist. |
| review | remarks (section, what, who), decisions on open questions, questions to answer, unconfirmed claims | `Замечание:`, `Решение:` | A running list of **remarks** and **decisions**. Concrete, markers exist. |
| interview | already customized in 0.2 (overlay only, Process now, no checklist) | `Возможный следующий вопрос:` | Nothing new; left as is. |
| free | no specialization | none | Nothing. |

Conclusion: all four specialized modes already emit (or can cheaply emit)
one-line markers. One shared "mode board" in the overlay that collects those
lines from the suggestions costs no extra model calls and gives each mode a
visible running list. The requirements mode keeps the "Risks?" quick action
(it is in the shared set of four and stays whenever the mode is available);
its answers get a `Риск:` marker so risks land on the same board.

## 2. How comparable products structure paid tiers

Two families are relevant: meeting notetakers (record, transcribe, summarize
after the call) and real-time copilots (suggestions during the call,
including interview copilots).

Observed structure (not prices):

1. **Three to four tiers is the norm**: free or trial, an individual paid tier,
   a team/business tier, then enterprise. Individual products without team
   features usually have two paid steps at most.
2. **Notetakers gate by volume first, features second.** Free tiers cap
   minutes or meetings per month; the individual paid tier removes the cap and
   adds "advanced AI" (custom prompts, templates, integrations); business adds
   admin, CRM sync, analytics. Feature gates are mostly team/admin features,
   not the core summary.
3. **Real-time copilots gate the live part.** Every credible live copilot puts
   live answer streaming behind a paid plan or a small trial (one trial
   session, a few free minutes, or a credit grant). Prep and after-call
   features are often free. Metering is in minutes or credits; higher tiers
   buy more minutes, sometimes better models.
4. **Trials are value-first.** Common practice is to let the trial see the
   product's best features (a "reverse trial": full features for a limited
   time or budget, then drop to a smaller plan), because a paywall shown after
   the user got a result converts like a renewal, while a feature gate the
   user never passed through shows them nothing.
5. **Upgrade prompts are contextual.** Good practice: the locked item is
   visible where it would be used, clicking it shows what it does (a short
   preview, a screenshot or a short animation), names the plan that unlocks
   it, and has one upgrade button plus a way back. Hard "no" dialogs and
   nagging counters reduce trust. Price shown in the prompt, not a separate
   pricing page.
6. **Russian market** (notetakers and transcription services): subscriptions
   around a few hundred to about a thousand rubles a month per user, or
   per-minute packages; free trial minutes on sign-up are standard. The
   placeholder 990 RUB/month in `billing-api.md` sits at the upper end of the
   individual tier there.

What this means for Avalet:

- Avalet's built-in provider is metered by tokens, which is the same lever as
  minutes and credits elsewhere. Budget is the hard, server-enforced gate.
- Mode gating is a packaging choice on top. In an open source client it is a
  soft gate (anyone can build a client without it); its job is to make the
  plans different and explain the value, not to protect revenue. The server
  cannot see which mode a proxy call is for, except by reading the prompt.
- Own-key users get everything for free by policy. Paid tiers therefore sell
  convenience (no keys, one bill in rubles, a model chosen for you) plus
  budget; mode gating must not be the main argument.
- The trial should show the analyst core, not only interviews: the analyst
  modes are what the product is named for. A trial with interview only would
  show analysts nothing of what they came for.

## 3. Sources (accessed 2026-09-27)

- Meeting assistant pricing overviews: https://circleback.ai/blog/best-ai-meeting-assistants , https://summarizemeeting.com/en/comparison/pricing , https://stealwhatworks.com/blogs/news/ai-meeting-assistant-pricing , https://spokenly.app/blog/otter-ai-pricing
- Interview copilots (live part gated, credits, trial session): https://interviewoslab.com/pricing , https://copilotinterview.com/pricing , https://ophyai.com/us/pricing , https://www.finalroundai.com/interview-copilot
- Trials and gating practice: https://knowledge.gtmstrategist.com/p/reverse-trials-best-practices-for-saas-companies , https://www.appcues.com/blog/free-to-paid-conversion , https://www.stigg.io/blog-posts/dynamic-pricing-tools-for-saas-how-to-use-flexible-paywalls-to-drive-revenue , https://alexdebecker.substack.com/p/a-study-in-feature-gating
- Russian services: https://voicee.ru/resources/blog/ii-assistent-dlya-vstrechyj-sravnenie-2026 , https://weeek.net/ru/blog/ai-note-taking-tools-for-meetings , https://vc.ru/ai/2797578-luchshie-ii-assistenty-dlya-zapisi-vstrech-i-sammari-obzor
