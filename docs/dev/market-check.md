# Market check: meeting assistants (2026-09-26)

Internal note, not user-facing. Compiled from web search on 2026-09-26 in the
cloud session. Direct page fetches were blocked by the session's network
proxy, so the figures come from search results, several of them review and
pricing aggregators rather than the vendors' own pages.
Treat prices as "as reported on that date" and re-check on the vendor pages
before quoting them anywhere.

## Who was compared

- **Notetakers** (summary after the call): Otter, Fireflies, Fathom, Granola,
  Krisp; Russian platform features: Yandex Telemost, SaluteJazz, Kontur.Talk.
- **Real-time copilots** (suggestions during the call): Cluely as the most
  visible one in this category.
- **Avalet 0.2.0-rc.1** (this repo).

## Comparison

| Criterion | Avalet | Otter | Fireflies | Fathom | Granola | Krisp | Telemost / SaluteJazz / Kontur.Talk | Cluely |
|---|---|---|---|---|---|---|---|---|
| 1. Help **during** the call | Yes: streamed suggestions, drafts, screenshot read, manual ask | Live transcript and live notes (bot) | After the call (plus in-meeting assistant) | After the call | Notes during, enhanced after | Notes after | After the call | Yes, overlay answers during the call |
| 2. Joins as a visible bot | No (system audio on the Mac) | Yes, OtterPilot joins meetings | Bot | Bot | No, system audio [G] | No bot [K] | Built into the platform (no extra bot, but only on that platform) | No |
| 3. Where speech is recognized | On the Mac (faster-whisper) | Cloud | Cloud | Cloud | Transcribed in real time, audio deleted [G] | On-device audio processing [K] | Vendor cloud (Yandex SpeechKit/YandexGPT, GigaChat) | Cloud |
| 4. Model choice / own key | Own key for Claude, OpenAI, DeepSeek, local; or built-in plan | No | No | No | No | No | Vendor model only | Vendor models |
| 5. Russian | First language (UI, prompts, protocol) | Not among listed languages (EN, ES, FR, DE, JA, ZH) [O] | 100+ languages incl. auto-detect [F] | Multi-language | Multi-language | 16+ languages [K] | Native Russian | Multi-language |
| 6. Analyst-specific output | Modes (requirements, grooming, demo, review, interview), testable requirements, agenda checklist with closed/open, action table | General summary, action items | General summary, AI credits | General summary (advanced summaries capped on free) [Fa] | Notes templates | Summary, action items | Summary; Kontur.Talk: protocol with owners and deadlines, project context (2026-09) [KT] | General answers |
| 7. Price entry point | Own key: free. Built-in: trial 500k tokens, Pro placeholder 990 RUB/month | Free 300 min; Pro 16.99 USD/month monthly [O] | Free; Pro 18 USD/month monthly [F] | Free; Premium 20 USD/month monthly [Fa] | Free (history limited); Business 14 USD/user/month [G] | From 8 USD/seat/month annual [K] | Included in business licences of the platform [T][S] | Free starter; Pro 19.99 USD/month; overlay-hiding tier far higher [C] |
| 8. Works with any call app | Yes (system audio) | Zoom/Meet/Teams via bot | Via bot | Via bot | Yes | Yes | Only its own platform | Yes |
| 9. Data leaves the machine | Own key: model call only (no audio). Built-in: model call through Avalet proxy, no transcript stored | Audio and transcript in vendor cloud | Vendor cloud | Vendor cloud | Transcript and notes in vendor cloud | Transcripts in vendor cloud | Vendor cloud (Russian jurisdiction) | Vendor cloud |
| 10. Platform | macOS only, unsigned | Web, desktop, mobile | Web, apps | Web, apps | Mac, Windows, iOS [G] | Mac, Windows | Web, desktop, mobile | Mac, Windows, iOS |

Sources (all read 2026-09-26):
- [O] Otter pricing and languages: https://sonix.ai/resources/otter-ai-pricing/ , https://www.claap.io/blog/otter-pricing , https://tldv.io/blog/otter-pricing/
- [F] Fireflies pricing and languages: https://sonix.ai/resources/fireflies-ai-pricing/ , https://fireflies.ai/blog/fireflies-pricing-which-plan-is-right-for-you
- [Fa] Fathom pricing and free-plan summary cap: https://www.fathom.ai/pricing , https://get-alfred.ai/blog/fathom-pricing
- [G] Granola pricing, no bot, platforms: https://www.granola.ai/blog/ai-meeting-notes-pricing-granola-costs-less-alternatives , https://tldv.io/blog/granola-review/
- [K] Krisp pricing, on-device processing, languages: https://krisp.ai/pricing/ , https://krisp.ai/ai-meeting-assistant/
- [T] Yandex Telemost AI summaries: https://www.computerra.ru/312847/yandeks-360-dobavil-ii-konspekty-vstrech-v-telemost-dlya-biznesa/ , https://360.yandex.ru/blog/news/telemost-stanovitsya-universalnym-instrumentom-dlya-obsheniya-s-iskusstvennym-intellektom-videozvonkami-i-chatami/
- [S] SaluteJazz meeting summaries (GigaChat): https://developers.sber.ru/help/jazz/guide/meeting-summarizer
- [KT] Kontur.Talk AI protocol and project context: https://kontur.ru/press/news/81149-avtomaticheskiy_ii_protokol_onlayn_vstrech , https://kontur.ru/talk
- [C] Cluely pricing: https://cluely.com/pricing , https://www.finalroundai.com/blog/cluely-pricing

## What is different about Avalet

- **Analyst-specific, during the call.** Meeting modes with their own prompts
  and protocol headings, requirements phrased as testable lines, an agenda
  checklist that marks questions closed or open, an action table with owner
  and due date. The notetakers produce a general summary after the call; the
  real-time copilots give general answers.
- **Local-first.** Speech is recognized on the Mac; with an own key only the
  text of the model call leaves the machine, straight to the chosen provider.
- **Own key, free.** No other product in the table lets the user bring a
  provider key (or a local model) for the in-call help.
- **Russian first.** UI, prompts and protocol are written for Russian calls,
  with English terms kept as they are spoken.
- **Any call app, no bot.** Works over Telemost, SaluteJazz, Kontur.Talk,
  Zoom or anything else, which the platform-built summaries cannot.

## Where Avalet is weaker

- **Platform:** macOS only, unsigned, no auto-update; everyone else has
  Windows and mobile.
- **Setup weight:** a 0.5 GB speech model download (often needs a VPN from
  Russia) and a Python runtime inside the app; the cloud tools need nothing.
- **Unverified pieces:** the live checklist has not run on a real meeting;
  the built-in paid provider has no server yet.
- **No team features:** no sharing, no CRM or task tracker export, no
  search across meetings; the platform tools and the US notetakers have these.
- **Recognition quality** depends on the local model and the Mac; cloud
  recognizers (and the platforms' own Russian ASR) are likely stronger on
  noisy or accented speech. Not measured here.

## Three things most worth improving next

1. **Verify and tune on real meetings** (the checklist, suggestion timing,
   Russian recognition with small vs turbo), then make the checklist default
   in Simple. This is the core promise and the least verified part.
2. **Remove setup friction:** ship the recommended speech model inside the
   `.dmg` (or a mirror that works from Russia without a VPN), sign and
   notarize the app, add auto-update.
3. **Export where analysts work:** the protocol and action table into
   Confluence/Jira-style Markdown or a tracker (and Telemost/Kontur-friendly
   copy), since the Russian platforms already produce summaries and the
   difference has to be visible in the artefact the team receives.
