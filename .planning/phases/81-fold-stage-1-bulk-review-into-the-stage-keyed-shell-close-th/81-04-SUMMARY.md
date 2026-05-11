---
phase: 81
plan: 04
subsystem: stage-keyed-shell / Stage 1 cleanup
tags: [cleanup, dead-code, redirect-tests, mock-fixture, hygiene]
requires:
  - 81-01-SUMMARY.md (review/ moved into stage-1/)
  - 81-02-SUMMARY.md (Stage 2 placeholder)
  - 81-03-SUMMARY.md (Stage 1 shell-wrap + Pending Promotion sub-view + queue-tree.tsx deletion)
provides:
  - "queue-tree.tsx confirmed deleted; no non-test, non-comment QueueTree references in repo"
  - "Middleware redirect test coverage extended (11 → 15 cases) — `?sub=pending` round-trip locked"
  - "Stage 1 admin-mock `.schema(name)` shim + scoped safety-list builder lookup — 19 of 22 inherited test failures fixed"
affects:
  - web/__tests__/middleware-review-redirect.test.ts (+4 cases)
  - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/safety-review-loader.test.ts (+schema shim)
  - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts (+schema shim)
  - .planning/phases/81-fold-.../deferred-items.md (carry-forward note)
tech-stack:
  added: []
  patterns:
    - "Trivial-shim test mock pattern: when production code grows a chainable method (`.schema(name)`), add `methodName(_arg: T) { return this }` to the mock — the downstream `.from()` switch already discriminates on the unique key"
key-files:
  created: []
  modified:
    - web/__tests__/middleware-review-redirect.test.ts
    - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/safety-review-loader.test.ts
    - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts
    - .planning/phases/81-fold-stage-1-bulk-review-into-the-stage-keyed-shell-close-th/deferred-items.md
  deleted: []
decisions:
  - "Task 1 file deletion was already done by Plan 03's docs commit (a3bcda3) — Plan 04 confirms zero-non-comment QueueTree refs and exits early"
  - "Task 3 partial fix: trivial `.schema(name)` shim chosen over schema-keyed sub-builders (simplest viable; the .from() switch is unique-table-keyed)"
  - "Remaining 3 stage-1 loader test failures (all in load-page-data.test.ts) carried forward to Phase 82 — all are test-fixture drift, not production bugs (clear causes documented in deferred-items.md)"
metrics:
  duration: 4m
  completed: 2026-05-11
---

# Phase 81 Plan 04: Final cleanup — delete dead components + extend redirect tests Summary

Closes Phase 81's hygiene asks. queue-tree.tsx is confirmed deleted, "Bulk Review" survives only in comments + window-event-name strings (D-18/D-19 audit trail preserved), middleware redirect coverage extends to `?sub=pending` round-trip (11 → 15 cases), and a trivial `.schema(name)` shim added to stage-1 admin mocks fixes 18 of the 22 inherited test failures.

## What was built

### Task 1 — Confirm queue-tree.tsx deletion + audit "Bulk Review" survivors

- **queue-tree.tsx already deleted** by Plan 03's docs commit (a3bcda3, 440 lines removed). Plan 04 verified: file is gone from disk and git index. `git rm` from Plan 04 was a no-op.
- **`QueueTree` non-test references remaining (all intentional comments per D-18 audit trail):**
  - `selection-context.tsx:12` — "Filter changes (topic/entity/mailbox/rule via QueueTree links) STILL go..." (comment, preserved)
  - `selection-context.tsx:56` — "Resync when QueueTree (or any other URL-driven nav)..." (comment, preserved)
  - `noise-category-chip-strip.tsx:7` — "Replaces the legacy <QueueTree> sidebar." (JSDoc, preserved)
  - `__tests__/middleware-review-redirect.test.ts:77` — "this regression broke QueueTree topic-filter clicks via the redirect hop" (test comment, preserved)
- **"Bulk Review" string survivors under `stage-1/` (all preserved per D-18/D-19):**
  - `keyboard-shortcuts.tsx:33,187` — `// Phase 71-05 — 4-axis Bulk Review keyboard hooks` (comments)
  - `actions.ts:648` — `// Phase 71-07: Bulk Review rows are now keyed on...` (comment)
  - `components/TaggingFailureBadge.tsx:4` — `// CoordinatorBadge so Bulk Review reads as a single coherent surface` (comment)
  - `__tests__/page-shell.test.tsx:5,236,252` — test assertions that the string is ABSENT from rendered output (negative assertions, preserved)
- **`bulk-review:*` window-event-name strings preserved** (per D-19 spirit — backend identifiers, not user-visible): 16 hits in `keyboard-shortcuts.tsx` (event-name constants) + 32 hits in `detail-pane.tsx` (window add/removeEventListener bindings). Zero changes needed.
- **No user-visible "Bulk Review" copy survives anywhere under `stage-1/`.** Asserted in code via `page-shell.test.tsx:252` (`expect(container.textContent ?? "").not.toContain("Bulk Review")`).

### Task 2 — Extend middleware redirect tests for `?sub=pending`

Added 4 new `it(...)` cases to `web/__tests__/middleware-review-redirect.test.ts`:

| Case | Input | Expected target |
|------|-------|-----------------|
| Direct sub-view bookmark | `/review?sub=pending` | `/stage-1?sub=pending` |
| Multi-param with sub | `/review?topic=payment&sub=pending` | `/stage-1?topic=payment&sub=pending` |
| Pre-existing param regression | `/review?selected=abc123` | `/stage-1?selected=abc123` |
| Legacy + new co-existing | `/review?tab=pending&selected=abc123` | `/stage-1?sub=pending&selected=abc123` |

**Test count: 11 → 15, all passing.** `web/middleware.ts` was NOT modified (D-03 contract preserved — `resolveReviewRedirect` already preserves `?sub=pending` via the carry-non-tab-params loop).

**Stage 3 + Stage 4 regression smoke:** `derive-stage-tabs.test.ts` (the only existing test file in this surface) passes 4/4. Stage 3 + Stage 4 page-route directories have no `.test.ts` files of their own (test coverage for those surfaces lives in `web/__tests__/` and feature-level unit specs).

### Task 3 — Time-boxed `.schema(name)` shim for stage-1 admin mocks

Both `safety-review-loader.test.ts` and `load-page-data.test.ts` failed with `TypeError: admin.schema is not a function` because production loader (commit 5ad38e4) added `admin.schema("email_pipeline").from(...)` and `admin.schema("debtor").from(...)` calls. Added the trivial shim to both mock fixtures:

```ts
schema(_name: string) {
  return this;
},
```

**Failure count: 22 → 3 (19 fixed across two commits: 383f261 + b038918).** The `.from()` switch in both mocks already discriminates uniquely on table name, so ignoring the schema name is safe. A follow-up commit (b038918) additionally scoped the safety-list builder lookup to fix the `lastListBuilder` overwrite caused by the safety branch issuing TWO `pipeline_events` queries (safety-list + timeline join).

**Remaining 3 failures (carried forward to Phase 82, documented in `deferred-items.md`):**

1. `load-page-data.test.ts` Test 4 — `loadCoordinatorRunsForReview` side-loader mock never called (production flow reordering).
2. `load-page-data.test.ts` Test 5 — `pipeline_events_email_summary` view rows return `[]` (loader added a filter the mock doesn't model).
3. `load-page-data.test.ts` Test 6 — `stage_decisions` field shape drift; unrelated to schema/builder fixes.

All three are test-fixture drift, not production bugs. Production behavior is exercised by the Plan 03 `page-shell.test.tsx` (passing 4/4) + the live `/stage-1` UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Stale Next.js generated types reference deleted `/review/page.tsx`**

- **Found during:** Task 3 (post-commit `tsc --noEmit`)
- **Issue:** `.next/types/validator.ts:62` referenced `../../app/(dashboard)/automations/[swarm]/review/page.js` — an artifact of pre-81-01 generation when `/review` still existed
- **Fix:** Removed `.next/types/` directory (auto-regenerated by Next.js on next build/dev)
- **Files modified:** none committed (`.next/` is gitignored)
- **Commit:** none required

### Task 1 deletion was a no-op

The plan assumed `queue-tree.tsx` was still present and needed deletion in this plan. In fact, Plan 03's docs commit (a3bcda3) included the file deletion alongside the page.tsx rewire. Plan 04 verified and proceeded. No action needed, no rollback needed — the goal-backward check #8 ("no non-test QueueTree references") is satisfied with the existing state.

## Self-Check: PASSED

- **`queue-tree.tsx` file deletion:** confirmed absent (`ls` returns ENOENT; `git ls-files` returns empty)
- **Plan 04 commits exist:**
  - `6b2f7a1` (test 81-04: extend middleware redirect tests for ?sub=pending round-trip) — FOUND in `git log`
  - `383f261` (test 81-04: add .schema(name) shim to stage-1 admin mocks) — FOUND in `git log`
- **Middleware redirect tests:** 15/15 passing (`vitest run __tests__/middleware-review-redirect.test.ts`)
- **TSC clean:** `npx tsc --noEmit` returns 0 errors after stale `.next/types/` regenerated
- **No production code changed** (verified: `git diff main^^^ -- web/middleware.ts web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` shows no diff from Plan 03)

## TDD Gate Compliance

Plan 04 is `type: execute`, not `type: tdd`. No RED/GREEN gate sequence required. All commits are `test(81-04): …` — test-only changes, no production code modified.

## Threat Flags

None. Task 2 adds regression-test surface against `T-76-08-01` (open-redirect via legacy /review URL) without changing production behavior. Task 3 modifies only test mocks (no runtime path).
