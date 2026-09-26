# Decisions (task scaffolding, delete before going public)

One line each: decision, reason.

- IPC types live in `electron/shared/ipc-contract.ts` (types, `InvokeMap`, `EventMap`, `AvaletApi`, runtime channel list); preload, renderer and main import it. Reason: one source of truth; preload's `api: AvaletApi` and typed `invoke()` make drift a compile error (verified by deleting a method: tsc fails).
- `electron/main.ts` split into `app-core.ts` (all non-window IPC handlers, testable) and a thin Electron shell; `WINDOW_CHANNELS` lists what main.ts keeps. Reason: integration tests need the real handlers without Electron.
- Stores (`settings`, `history`, `meetings`, `log`, paths) take their backend via `init*()` instead of importing Electron. Reason: run under plain `node --test`.
- `wip/model-manager` (8aeb1ae) was ported by hand, not cherry-picked. Reason: it edits the three duplicated type files this step removes and the settings panel that changed since; the logic (local-only load, download step, Start blocked when missing) is kept.
- Model state and progress are computed in TypeScript from the Hugging Face cache folder, not by the sidecar. Reason: works when the recognizer is not running, testable with temp dirs.
- Download runs as a separate process (`server.py --download <model>`), not a thread in the sidecar. Reason: Cancel = kill; a Python thread cannot be stopped.
- Downloads set `HF_HUB_DISABLE_XET=1`. Reason: plain HTTP writes a growing `.incomplete` file, which is what progress measures.
- "Old and new HF cache layouts" = current (blobs + snapshot symlinks, `blobs/*.incomplete`) and legacy/no-symlink (real files in `snapshots/<rev>/`, `*.incomplete` next to them). Progress counts each regular file once, never following links.
- Failed download: 2 automatic retries (3 s, 10 s), partial file kept so retries and "Continue" resume. Reason: covers short network drops without user action.
- Delete model is shown only in the full settings (Advanced). Reason: fewer controls in Simple.
- Live checklist setting: stored `null` = level default (Advanced on, Simple off); an explicit choice wins. Toggle only in Advanced settings. Reason: CLOUD_TASK step 1.
- Checklist pacing now counts from the meeting start (no call in the first 30 s; 90 s ceiling applies to the first call). Reason: before, the first 80 characters triggered a call immediately because `lastRunAt` started at 0.
- API keys are refused when OS encryption is unavailable (was: stored base64 in the clear as a "dev fallback"). Reason: key handling; E2E on Linux uses `--password-store=basic`.
- Main window now `sandbox: true`, navigation and `window.open` locked (http(s) links go to the system browser). Reason: IPC/renderer hardening; preload only needs `electron`.
- Tests are collected by `scripts/run-tests.mjs` instead of a hand-written list in package.json. Reason: new test files cannot be forgotten.
- Background (checklist) model defaults: Claude `claude-haiku-4-5`, OpenAI `gpt-4.1-mini`, DeepSeek `deepseek-flash`, custom = main model. Reason: cheaper class for background work (Step 2 requirement, needed by the tracker now).
- `generate()` now returns `{text, usage}`; OpenAI-compatible streams send `stream_options.include_usage`; a server that rejects it (400 mentioning stream_options) is retried once without it. Reason: real counts from every provider that supports them, no breakage on old local servers.
- Local token estimate (3 chars per token, 1000 per image) is used only when a response has no usage, and every such call is flagged `estimated`. Reason: CLOUD_TASK "no local estimation except as a labeled fallback".
- A stream aborted after some output is recorded as an estimate; a call that failed before any output is not recorded. Reason: aborted streams are still billed by providers.
- Weight table in `electron/metering/model-weights.ts`: flash-class x1 (haiku, mini, nano, flash, lite, avalet-fast), premium x4 (opus, sonnet, gpt-4.1, gpt-5, pro, large, avalet-premium); unknown models x4. Reason: never under-count a budget.
- Ledger keeps running totals (per month and tier, trial, last 50 meetings) plus the last 100 calls, in its own store file `avalet-usage.json`. Reason: bounded size, no transcript text stored.
- Purposes are exactly suggestion / tracker / summary / screenshot; the key test and the wizard self-test count as suggestion. Reason: keep the four from the task.
- The checklist uses a non-streaming call. Reason: nothing is shown while it runs; exercises the non-streaming usage path.
- Briefing in live calls is cut at 3,500 characters with a note to the model; summary keeps the full text. Reason: CLOUD_TASK step 2.
- Overlay shows only this meeting's token count as small muted text; Settings shows this month and, in Advanced, a per-purpose breakdown. Reason: "never nag".
- Anthropic adapter accepts an optional base URL. Reason: lets the mock server and tests stand in for it; not exposed in the UI.
