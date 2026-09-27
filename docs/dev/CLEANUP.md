# Cleanup before going public

Everything that exists only because of the autonomous session lives in
`docs/dev/`, `CLOUD_TASK.md`, `CLOUD_TASK_2.md`, `CLOUD_TASK_3.md` and `CLOUD_TASK_3_PROMPT.md`. Product files that stay: `docs/screens/`,
README updates, `CHANGELOG.md`, `.github/workflows/`, tests (`electron/**/*.test.ts`,
`electron/testing/`, `test/`, `e2e/`, `playwright.config.ts`), `server-mock/`
(the tests and E2E need it).

## (a) Delete before going public

- `CLOUD_TASK.md` (the task text for the autonomous session; contains market strategy)
- `CLOUD_TASK_2.md` (the task text for the 0.2.0-rc.2 session; mentions the payment gateway choice)
- `CLOUD_TASK_3.md` (the task text for the mode tiers session; pricing and tier strategy)
- `CLOUD_TASK_3_PROMPT.md` (the launch prompt for that session)
- `docs/dev/mode-tiers-research.md` (private: market research, names other products)
- `docs/dev/mode-tiers-plan.md` (private: the commercial plan and tier proposal)
- `docs/dev/PROGRESS.md`
- `docs/dev/DECISIONS.md`
- `docs/dev/REPORT.md`
- `docs/dev/CLEANUP.md` (this file, last)

## (b) Keep, move if wanted

- `docs/dev/MAC_VERIFY.md`: the manual Mac checklist; could move to `docs/`.
- `docs/dev/billing-api.md`: the server contract; could move to `docs/`. If it moves, update the links in `README.md`, `README.ru.md`, `server-mock/README.md`, `server-mock/server.mjs` and `electron/billing/config.ts`.
- `docs/dev/market-check.md`: removed from the repo, the copy is kept privately outside it.

## (c) Commands

```bash
git rm CLOUD_TASK.md CLOUD_TASK_2.md CLOUD_TASK_3.md CLOUD_TASK_3_PROMPT.md docs/dev/mode-tiers-research.md docs/dev/mode-tiers-plan.md docs/dev/PROGRESS.md docs/dev/DECISIONS.md docs/dev/REPORT.md docs/dev/CLEANUP.md
git commit -m "Remove autonomous-session scaffolding"

# after the squash merge of release/v0.2-autopilot into main:
git push origin --delete release/v0.2-autopilot
git push origin --delete wip/model-manager
```

## Sensitive, check before publishing

Scanned on 2026-09-26 (`git ls-files | xargs grep` for private keys, provider
key patterns, emails, bank and employer names): no secrets, no emails, no
employer names found. Remaining items for a human decision:

- `docs/dev/market-check.md`: removed from the repo, the copy is kept privately outside it.
- `CLOUD_TASK.md`: market and pricing strategy ("Russian market first", tier budgets). Deleted by the commands above.
- `CLOUD_TASK_3.md`, `docs/dev/mode-tiers-research.md`, `docs/dev/mode-tiers-plan.md`: tier strategy, the owner's tier proposal, product names in the research sources. Deleted by the commands above; never link them from README or the app. Rescanned on 2026-09-27 for the mode-tiers diff (`git diff 76459cd | grep` for emails, key patterns, private keys, bank and employer names, banned wording): nothing found. The in-app lock copy names only "Pro" and the placeholder price, no plan table.
- `CLOUD_TASK_2.md`: names the planned payment gateway and the owner's test findings. Deleted by the commands above. Rescanned on 2026-09-26 for the rc.2 diff (`git diff aeba8a1 | grep` for key patterns, emails, bank and employer names): only the test canaries `sk-canary-...`/`sk-test-...` in tests, which are not keys.
- Pricing and budgets in code and docs: 990 RUB/month placeholder, 500,000 trial and 5,000,000 Pro weighted tokens (`electron/billing/config.ts`, `server-mock/server.mjs`, `docs/dev/billing-api.md`, READMEs, CHANGELOG). Public by design once the plan is announced; check they are final.
- `electron/billing/config.ts` `PRODUCTION_PUBLIC_KEY`: a placeholder public key (its private key never existed on disk). Not a secret, but it must be replaced by the real server key before the built-in provider can work.
- Commit messages on this branch end with a `Claude-Session:` link to the session transcript. A squash merge with a new message drops them from `main`; the branch itself is deleted by the commands above.
- Pre-existing and intentional: the author's name in `LICENSE`, `package.json` and READMEs, and the VPN link `ast-net.ru` in the READMEs and the app (the owner's own recommendation, required by the task).
