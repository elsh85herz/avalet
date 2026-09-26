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

(nothing yet)

## In progress

- Step 1: baseline and hygiene.

## Next

- Step 1 remainder, then Steps 2..7 in order.

## Blockers

(none)
