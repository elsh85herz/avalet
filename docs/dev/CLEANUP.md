# Cleanup before going public

## (a) Delete before going public

- `CLOUD_TASK.md` (task description for the autonomous session)
- `docs/dev/PROGRESS.md`
- `docs/dev/DECISIONS.md`
- `docs/dev/REPORT.md`
- `docs/dev/CLEANUP.md` (this file, last)

## (b) Keep, move if wanted

- `docs/dev/MAC_VERIFY.md` (manual Mac checklist; could live in `docs/`)
- `docs/dev/billing-api.md` (server contract; could live in `docs/`)
- `docs/dev/market-check.md` (internal comparison; consider keeping private)
- `server-mock/` (test-only billing and LLM mock; used by tests and E2E, keep while tests use it)

## (c) Commands

```bash
git rm CLOUD_TASK.md docs/dev/PROGRESS.md docs/dev/DECISIONS.md docs/dev/REPORT.md docs/dev/CLEANUP.md
git commit -m "Remove autonomous-session scaffolding"
# after the squash merge of release/v0.2-autopilot into main:
git push origin --delete release/v0.2-autopilot
git push origin --delete wip/model-manager
```

## Sensitive, check before publishing

(filled in at the end of the session)
