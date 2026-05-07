
## 76-06 Pre-existing test failures (out of scope)

Discovered 2026-05-07 during 76-06 vitest run. Pre-existing on the branch baseline (verified via `git stash` + clean run); NOT introduced by 76-06 work. Out of scope per executor scope-boundary rule (only auto-fix issues caused by current task changes).

- `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` — Tests 4/5/6 failing
- `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` — 4 tests failing

Likely related to Phase 71-08 view-driven feed evolution; should be revisited in the next dedicated plan touching the review surface.

## Plan 76-08 — pre-existing vitest failures (out of scope)

Discovered while running `npx vitest run` to verify Task 2:

- `app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` — 22 failures, all `TypeError: admin.schema is not a function` at `app/(dashboard)/automations/[swarm]/review/page.tsx:659:8`. The mocked admin client in the test fixture lacks the `email_pipeline` schema accessor that loadPageData added in Phase 71-08 (commit 5ad38e4).

These failures pre-date Plan 76-08 (file last touched in 71-03; no Plan 76-08 change touches the loader or the test). Out of scope per deviation Rule 1 SCOPE BOUNDARY.

Recommended owner: whoever ships the next pipeline_events test infra refresh.
