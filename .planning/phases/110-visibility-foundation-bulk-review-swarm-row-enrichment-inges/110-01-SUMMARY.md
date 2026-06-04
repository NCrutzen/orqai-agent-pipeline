---
phase: 110-visibility-foundation-bulk-review-swarm-row-enrichment-inges
plan: 01
subsystem: stage-3-pipeline-regression-safety
tags: [test, regression, swarm-02, dry-run-gate, bulk-review-anchor, tdd-red]
requires: []
provides:
  - "SWARM-02 static grep guard extended to coordinator + dispatcher"
  - "Debtor Stage-3 coordinator swarm_type-parity baseline (Plan 03 gate)"
  - "RED contract for email_id anchor (Plan 02 must satisfy)"
  - "RED contract for per-stage dry-run gate (Plan 04 must satisfy)"
affects:
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/lib/inngest/functions/stage-3-dispatcher.ts
  - web/lib/bulk-review/hydrate.ts
  - web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts
tech-stack:
  added: []
  patterns:
    - "readFileSync static grep guard with comment-stripping (T-110-01 hygiene)"
    - "RED contract tests run (not .skip) so later plans flip them GREEN"
    - "createSupabaseAdminMock queue-based response seeding"
key-files:
  created:
    - web/lib/inngest/functions/__tests__/coordinator-swarm-branch-guard.test.ts
    - web/lib/bulk-review/__tests__/review-anchor.test.ts
    - web/lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts
  modified:
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
decisions:
  - "Anchor RED test seeds a null debtor.email_labels lookup so the hydrator early-returns null cleanly — pins the exact contract gap (no email_id anchor path) rather than a queue-ordering artifact"
  - "Dry-run preservation test splits GREEN (current effective gating via readFileSync source pins) from RED (future swarms.dry_run_config source) in one file"
  - "Grep guard includes a non-vacuous negative-control self-test (a real branch must be caught)"
metrics:
  duration: ~12m
  completed: 2026-06-03
---

# Phase 110 Plan 01: Wave-0 Stage-3 Regression Safety Net Summary

Stood up the Wave-0 regression safety net before any Phase-110 refactor touches the live debtor path: a debtor Stage-3 coordinator swarm_type-parity baseline (GREEN), the SWARM-02 static grep guard extended from the classifier to the coordinator + dispatcher (GREEN), and two intentionally-RED contract tests that the executors of Plans 02 (email_id anchor) and 04 (per-stage dry-run gate) must turn GREEN.

## What Shipped

- **Task 1 — coordinator parity baseline (GREEN).** Added a `D-07/D-09: swarm_type generalization parity (debtor unchanged)` describe block to the existing `debtor-email-coordinator.test.ts` (now 22 `it` cases, all originals preserved). Pins the exact observable outputs Plan 03 must preserve when it swaps `const SWARM_TYPE = "debtor-email"` for `event.data.swarm_type`: coordinator_runs.swarm_type, pipeline_events.swarm_type + stage=3, the literal emitted event name `debtor-email/predicted` + payload swarm_type, `TENANT_DOMAINS_BY_SWARM['debtor-email']` non-empty, and the `entity ?? "smeba"` default.
- **Task 2 — SWARM-02 grep guard (GREEN).** New `coordinator-swarm-branch-guard.test.ts` mirrors the `classifier-screen-worker.test.ts:667` readFileSync model, asserting zero `swarm_type === '<literal>'` / `swarm === 'sales-email'|'debtor-email'` branches in `debtor-email-coordinator.ts` and `stage-3-dispatcher.ts`. Comment lines are stripped before matching (T-110-01 hygiene), and a negative-control self-test proves the gate is not vacuous. Bucket-loader surface branch is documented out of scope (OQ-4 / RFC SC-3).
- **Task 3 — RED contracts.** `review-anchor.test.ts` (RED until 110-02) asserts the hydrator accepts an `email_id` anchor for `sales-email` and returns a row with null debtor-only override slots — fails today because no email_id anchor path exists (debtor.email_labels-only). `dry-run-gate-preservation.test.ts` (RED until 110-04) pins debtor's current effective gating: stage-1 iController cleanup LIVE (hardcoded production, no gate), stage-2 + invoice-copy GATED on `settingsRow.dry_run ?? true` (all GREEN today), plus RED assertions that Plan 04's per-stage gate must read `swarms.dry_run_config`.

## Verification

| Suite | Expected | Result |
|-------|----------|--------|
| `debtor-email-coordinator.test.ts` | GREEN, ≥16 it-cases | PASS (22 cases; 9 active + 13 skipped) |
| `coordinator-swarm-branch-guard.test.ts` | GREEN | PASS (4/4) |
| `review-anchor.test.ts` | RED | FAIL as expected (exit 1) |
| `dry-run-gate-preservation.test.ts` | RED (3 GREEN pins + 3 RED) | 3 pass / 3 fail as expected |

GREEN suites combined exit 0; RED suites combined exit 1 — exactly the plan's `<verification>` contract.

## Deviations from Plan

### Environment Fix (Rule 3 - blocking)

**1. [Rule 3 - Blocking] Worktree had no `node_modules`; symlinked from canonical repo**
- **Found during:** Task 1 (first `vitest run`).
- **Issue:** `npx vitest` resolved a global cache build missing `@vitejs/plugin-react`/`vitest/config`, failing to load `vitest.config.ts`. The git-worktree does not inherit the gitignored `node_modules` from the canonical checkout (known workspace-topology friction).
- **Fix:** Symlinked `web/node_modules` to the canonical repo's `web/node_modules` and ran the local `./node_modules/.bin/vitest` binary instead of `npx`. The symlink is gitignored and outside version control — no repository change, not committed.
- **Files modified:** none tracked.
- **Commit:** n/a (infra-only).

No other deviations — the three tasks were implemented as written.

## Known Stubs

None. All test files are runnable and assert real behavior; the two RED suites intentionally fail against current code (documented in-file with `RED until 110-0X` markers) and are not stubs.

## Self-Check: PASSED

- Files: all 4 present (3 created + 1 modified).
- Commits: 2aa05ca3, 878ec33d, 31769c3a all in git log.
- min_lines: review-anchor 119 ≥ 20, dry-run-gate-preservation 80 ≥ 20.
- key_links: grep guard reads coordinator + dispatcher via readFileSync (verified by passing test).
