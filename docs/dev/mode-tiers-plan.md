# Mode tiers: commercial plan (PRIVATE, delete before going public)

Private (CLOUD_TASK_3 phase 1), listed in `CLEANUP.md`. Research behind it:
`mode-tiers-research.md`. This is a proposal the owner reviews; the code
implements it as one table (`electron/shared/tiers.ts`) so any row can be
changed in one line.

## 0. The rule above everything

**Own key: every mode and the live checklist, always, free, no lock, no
preview, no upgrade text.** The same holds when the build has no billing
server (`builtInProviderAvailable: false`, today's real state). Both are
checked first in the gating function, before any plan logic
(`featureGate()` in `electron/shared/tiers.ts`), and a test walks every
combination of access fields to prove it.

## 1. Table: what unlocks what

| | Own key | Trial (free, 500k tokens) | Pro (990 RUB/month placeholder) |
|---|---|---|---|
| Free conversation (`free`) | yes | yes | yes |
| Interview | yes | yes | yes |
| Requirements | yes | yes | yes |
| Grooming | yes | yes | yes |
| Document review | yes | locked, preview | yes |
| Demo and acceptance | yes | locked, preview | yes |
| Live checklist (automatic marks) | yes | locked, preview | yes |
| Manual agenda and action points | yes | yes | yes |
| Mode boards (running lists per mode) | yes | with the mode | with the mode |

Avalet with no usable plan (not activated, Pro ended, `none`) uses the Trial
row for what it shows as locked; no calls work in that state anyway.

## 2. Where `free` sits

Everywhere. It is the fallback when a locked mode can no longer be used (a
meeting started in a mode that is not in the plan runs as `free`, and the
picker says so); it has no specialization, so it sells nothing; locking it
would leave a user with a plan and nothing general to use. It is also the
default mode of a fresh install.

## 3. Live checklist

Pro only; visible to Trial users as locked (in the overlay where the
checklist would be, in Settings, in the guide), with a preview and the
upgrade button. Reasons:

- It is the most visible "it works by itself" feature, good as the main Pro
  argument; the owner's instinct to gate it separately holds.
- It is the only feature that costs tokens continuously (a background call
  every 30 to 90 s), so it belongs to the plan with the larger budget.
- It is gated at a different step than its natural mode: Requirements is in
  the Trial, the checklist is not. That is intended: the user meets the lock
  exactly where they would use it (an agenda in a requirements meeting).
- Manual agenda marks and action points stay free for everyone (no model
  call, and it is the user's own data).

It is still off by default in Simple (owner decision after real meetings).
In Avalet mode Simple Settings shows one checklist row (locked with
preview on Trial, a normal switch on Pro), so a Pro user can find it without
Advanced. Own-key Simple Settings stay as they are.

## 4. Three tiers vs two plans: recommendation

The owner's proposal has three user-facing tiers (Base with Trial:
interview; Analyst: + requirements, grooming; Ultra: + review, demo). The
billing contract has two plans (`trial`, `pro`) plus `none`.

Options weighed:

- **(a) A third plan value** (`analyst` between trial and pro). Real API
  change (`plan` enum, `/v1/plans`, checkout, webhooks, budgets, old clients
  reject unknown plan values). Only worth it with evidence that a cheaper
  middle plan sells; there is none yet (no real usage data, no server).
- **(b) Map onto the two plans.** "Analyst" = what the Trial shows, "Ultra" =
  Pro. The owner's "Base" (interview only) is not a separate plan at launch.
- **(c) Server-defined features (additive).** The entitlement token may carry
  an optional `features` list; when present it replaces the client's default
  table. The server can then change which plan has which modes, or add a
  third plan later, without changing what the client gates on.

**Recommendation: (b) now, with (c) in the contract so (a) is possible later
without a client redesign.** Implemented that way:

- Trial = interview, free, requirements, grooming (the owner's "Analyst"
  set). Deviation from the owner's proposal on purpose: a Trial with interview
  only would never show an analyst the analyst modes, which is what the
  product is named for; research says trials convert best when they show the
  core value. The Trial is limited by its one-off budget anyway.
- Pro = everything (the owner's "Ultra").
- Token field `features` (optional, additive, `v` stays 1). Known values:
  `mode:free` ... `mode:interview`, `live-checklist`. `free` is always on.
  Documented in `billing-api.md`. The mock server can set it per install
  (`POST /mock/features`), and a test runs the owner's original three-tier
  table through it.

To switch to the owner's original split without any server: change the
`trial` row in `PLAN_FEATURES` (`electron/shared/tiers.ts`) to
`["free", "interview"]`. One line; the tests read the table.

This is a pricing decision and is listed first under "Decisions needing the
owner" in `REPORT.md`.

## 5. What gating can and cannot do

The client is AGPL-3.0. Mode gating is a soft gate: a rebuilt client can
remove it. The server enforces only the budget (it meters every proxy call).
The server could also refuse proxy calls whose system prompt carries a mode
marker the plan lacks; not built, and cheap to evade. So: mode tiers are
packaging and explanation, the budget is the lock. Pricing should lean on "no
keys, one bill in rubles, enough tokens for N meetings", with modes and the
checklist as the visible difference between Trial and Pro.

## 6. Upgrade copy (spec; strings live in `src/renderer/lib/i18n.ts`)

Rules: no long dashes, no arrows, straight quotes, plain words, one sentence
per idea, never "no". Always a way back and the own-key option.

Locked mode, preview screen:

| | RU | EN |
|---|---|---|
| Badge in the picker | `{mode} (Pro)` | `{mode} (Pro)` |
| Title | `{mode}: в тарифе Pro` | `{mode}: in the Pro plan` |
| What it does | the mode's help line plus the board line below | same |
| Board line, review | `По ходу встречи замечания и решения собираются в отдельный список.` | `During the call, remarks and decisions are collected in a separate list.` |
| Board line, demo | `По ходу встречи отклонения от требований и что ещё попросить показать собираются в отдельный список.` | `During the call, deviations from the requirements and what to ask to see are collected in a separate list.` |
| Plan line | `Входит в Pro вместе со всеми типами встреч и живым чек-листом.` | `Included in Pro with every meeting type and the live checklist.` |
| Trial line | `В пробном доступе есть свободный разговор, интервью, сбор требований и груминг.` | `Your trial includes free conversation, interview, requirements and grooming.` |
| Primary | `Подключить Pro, {price}` (existing) | `Get Pro, {price}` (existing) |
| Secondary | `Не сейчас` | `Not now` |
| Own key hint | `Со своим ключом всё это бесплатно.` | `With your own key all of this is free.` |
| After payment | `Готово: режим "{mode}" доступен.` + `Выбрать` | `Done: the {mode} mode is available.` + `Use it` |

Live checklist, locked:

| | RU | EN |
|---|---|---|
| Overlay row | `Живой чек-лист в Pro` + `Как это работает` | `Live checklist in Pro` + `How it works` |
| Settings row | `Живой чек-лист: в тарифе Pro` + `Как это работает` | `Live checklist: in the Pro plan` + `How it works` |
| Preview body | `Пока идёт встреча, пункты повестки отмечаются сами, а задачи с ответственным и сроком собираются в список. Отметки, которые вы поставили вручную, не меняются.` | `While the call goes on, agenda items are marked by themselves and tasks with owner and deadline are collected. Marks you set by hand stay as they are.` |

The preview shows a real screenshot of the feature in use (generated under
Xvfb by the screenshot mode, the same way as the guide images).

## 7. Out of scope here

Real prices, budgets per plan, the billing server, the gateway, top-ups,
annual plans, team plans. Simple/Advanced stays independent of the plan
(see `REPORT.md`).
