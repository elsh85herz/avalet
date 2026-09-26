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
