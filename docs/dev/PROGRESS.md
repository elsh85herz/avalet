# Progress (task scaffolding, delete before going public)

Resume rule: read `CLOUD_TASK.md`, then this file, then `DECISIONS.md`. Work continues from "Next".

## Environment facts (cloud container, 2026-09-26)

- Node 22.22.2, npm 10.9.7, Python 3.11.15, Linux x64.
- `npm ci` works (npm registry reachable). Electron 33 binary downloads fine.
- Electron runs under Xvfb (`xvfb-run -a electron . --no-sandbox`); the existing
  `AVALET_SCREENSHOT_DIR` mode produced all 10 PNGs.
- `origin/wip/model-manager` exists (8aeb1ae), diverged from main at 69d1cf5.

## Baseline (before any change)

- `npm ci`: ok (16 audit warnings from transitive dev deps, not addressed).
- `npm run typecheck`: ok.
- `npm test`: 45 tests, 45 pass.

## Done

- Step 1 (baseline and hygiene):
  - Shared IPC contract `electron/shared/ipc-contract.ts`; preload/renderer/main use it; drift fails `tsc` (checked).
  - `electron/app-core.ts` holds all non-window IPC handlers; `main.ts` is a thin shell; a test asserts every channel has exactly one handler.
  - Stores injectable (MemoryKV + fake keychain in tests); settings schema v1 with migration (existing key => Advanced, no wizard).
  - Speech model manager (ported from `wip/model-manager` by hand): states absent/downloading/ready/error, progress, cancel, delete, auto-retry with resume; sidecar never downloads on Start (`model_not_downloaded`), Start returns `{ok:false, reason:"model-missing"}`.
  - Live checklist behind a setting (Advanced on, Simple off), background model, tests for all trigger rules.
  - Fixtures: `test/fixtures/fake-sidecar.mjs`, `test/fixtures/fake-model-download.mjs` (sparse files).
  - Verified: `npm run typecheck` ok, `npm test` 81/81, `npm run build` ok, app runs under Xvfb (screenshot mode).

## In progress

- Step 2: token metering.

## Next

- Steps 3..7 in order.

## Blockers

(none)
