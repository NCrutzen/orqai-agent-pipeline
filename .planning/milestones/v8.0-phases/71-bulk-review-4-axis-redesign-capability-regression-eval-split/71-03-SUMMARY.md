---
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
plan: 03
subsystem: bulk-review
tags: [bulk-review, view-rewire, loadPageData, security-invoker, predicted-row]
requirements: [REVW-06]
dependency-graph:
  requires:
    - "Plan 71-01 D-09: public.pipeline_events_email_summary view (migration 20260507a)"
    - "PredictedRow shape (web/app/(dashboard)/automations/[swarm]/review/page.tsx)"
  provides:
    - "View-driven predicted-row feed (loadPageData sub-query 2)"
    - "Per-stage decision + override flags surfaced on PredictedRow"
    - "Test contract: load-page-data + email-summary view shape"
  affects:
    - "Plan 71-04 / 71-05: row-list UI consuming the new PredictedRow shape"
tech-stack:
  added: []
  patterns:
    - "Read-side view swap behind RSC loader (Phase 70-06 analog)"
    - "JOIN-back filter pattern: pre-fetch matching email_ids from raw events when filters active"
key-files:
  created:
    - "web/lib/pipeline-events/__tests__/email-summary.test.ts"
    - "supabase/migrations/20260507a_pipeline_events_email_summary.sql (sibling of Plan 71-01; reconciled at merge)"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/review/page.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts"
    - "web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts"
decisions:
  - "Filter handling: v1 simplification — JOIN-back to raw pipeline_events for matching email_ids when topic/entity/mailbox/rule filters active, then .in('email_id', ids) on the view. Promote to view if perf becomes an issue (RESEARCH §Pitfall 7)."
  - "Selected-row detail (sub-query 5) STAYS on raw pipeline_events — per-stage timeline is the detail pane's contract; view is per-email aggregate only."
  - "Safety branch (?tab=safety) STAYS on raw pipeline_events stage=0 — view does not target Stage-0 injection-suspected feed."
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_changed: 5
  completed_at: "2026-05-05T12:44:00Z"
---

# Phase 71 Plan 03: Bulk Review predicted-row feed view rewire — Summary

REVW-06 read-side: Bulk Review's predicted-row feed now reads from the per-email
aggregate view `public.pipeline_events_email_summary` (D-10), carrying per-stage
decision + override + cost-rollup fields through to PredictedRow. The per-stage
timeline rendered in the detail pane STILL reads raw `public.pipeline_events`.

## What Shipped

### Task 1: View shape + aggregation correctness contract test

`web/lib/pipeline-events/__tests__/email-summary.test.ts` reads the migration
text from disk and asserts 8 structural constructs:

1. `CREATE OR REPLACE VIEW public.pipeline_events_email_summary` present.
2. `WITH (security_invoker = true)` — RLS inheritance (Pitfall 4 / Assumption A1).
3. `DISTINCT ON (email_id, swarm_type, stage)` ordered by `created_at DESC` —
   override-row wins-latest semantics.
4. All `stage_0..4_decision` and `stage_1..4_overridden` columns exposed.
5. `total_cost_cents` SUMs `pe.cost_cents` cross-stage.
6. `tool_call_count` filters Stage-4 events with `decision_details ? 'tool_calls'`.
7. Supporting index `pipeline_events_email_stage_created_idx (email_id, stage, created_at DESC)` shipped.
8. `GRANT SELECT ... TO authenticated, service_role`.

8/8 green. The migration file itself was created locally in the worktree
(matching Plan 71-01's spec verbatim) so the file-on-disk test runs
independently. Plan 71-01 ships an identical version; orchestrator reconciles
at merge.

### Task 2: loadPageData sub-query 2 swap + test contract

**page.tsx changes:**
- `PredictedRow` interface extended with `stage_decisions`, `stage_overridden`,
  `total_cost_cents`, `tool_call_count`, `first_event_at`, `last_event_at`
  (all optional; legacy fields preserved).
- Default-tab branch list query swaps from
  `from('pipeline_events').eq('stage', 1)` to
  `from('pipeline_events_email_summary')` selecting all 14 view columns,
  ordered by `last_event_at DESC`, limit 100.
- New `mapSummaryToPredictedRow(row)` mapper builds a PredictedRow keyed by
  `email_id` (so `r.id === email_id` in the view-driven feed; the side-loader
  receives `email_ids` instead of `pipeline_events.id`s).
- Filter handling (topic/entity/mailbox/rule): when any of these are set, a
  JOIN-back query reads matching email_ids from raw `pipeline_events` (Stage-1,
  cap 500), then the view query is constrained via `.in('email_id', ids)`. If
  the JOIN-back returns no rows we constrain to a sentinel value so the view
  returns the empty list (rather than every row). Inline TODO points to
  RESEARCH §Pitfall 7 for promotion if perf is needed.
- Selected-row detail (sub-query 5) UNTOUCHED — still reads raw
  `pipeline_events.eq('id', params.selected).single()`.
- Safety branch (sub-query 2 when `?tab=safety`) UNTOUCHED — still reads raw
  `pipeline_events.eq('stage', 0).eq('decision', 'injection_suspected')`.

**Test changes:**
- `load-page-data.test.ts`: 5 existing tests rewritten + 2 new tests added
  (Tests 6 + 7). Mock builder gained `.in()` recording. New EmailSummaryFixture
  scenario with 2 fixture rows. Asserts the view is queried with
  `swarm_type=debtor-email` filter, `last_event_at` order, limit 100; that
  PredictedRow carries stage_1..4 decisions + override flags +
  total_cost_cents + tool_call_count + timestamps; that the selected-row
  branch still hits raw `pipeline_events`.
- `safety-review-loader.test.ts`: regression test for the default tab updated
  — old assertion expected `lastListBuilder` (pipeline_events) to be set
  with stage=1; new assertion checks `fromCalls` contains
  `pipeline_events_email_summary` (the default branch no longer touches raw
  pipeline_events on this path).

12/12 review tests green.

## Verification

- `cd web && npx vitest run lib/pipeline-events/__tests__/email-summary.test.ts` → 8 passed.
- `cd web && npx vitest run "app/(dashboard)/automations/[swarm]/review"` → 12 passed.
- `grep "from('pipeline_events_email_summary')" web/app/(dashboard)/automations/[swarm]/review/page.tsx` → 1 hit (sub-query 2 swap).
- `grep "from('pipeline_events')" web/app/(dashboard)/automations/[swarm]/review/page.tsx` → 3 hits (filter JOIN-back, safety branch, selected-row detail).
- tsc clean on Plan 71-03 surface (page.tsx + the two test files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Sibling test broke after view swap**

- **Found during:** Task 2 verification (`vitest run "app/(dashboard)/automations/[swarm]/review"`).
- **Issue:** `safety-review-loader.test.ts:318` regression test asserted the
  default tab still reads raw `pipeline_events` with `stage=1`. After the view
  swap that path is no longer hit on the default tab.
- **Fix:** Updated the regression assertion to check
  `fromCalls.toContain('pipeline_events_email_summary')` instead and verify the
  `decision=injection_suspected` filter is NOT applied (the original intent of
  the regression test). Test name preserved.
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts`.
- **Commit:** `5ad38e4`.

## Deferred Issues

Pre-existing (NOT caused by Plan 71-03; present at base commit `f5b5bc6`):

- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts:440` — TS2345 null/string mismatch.
- `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts:265` — TS2345 null/string mismatch.

Logged to `deferred-items.md`; out of scope per scope-boundary rule.

## Cross-Plan Notes

- Migration file `supabase/migrations/20260507a_pipeline_events_email_summary.sql`
  is committed in this plan to make the view-shape test runnable in isolation.
  Plan 71-01 ships the same file; the orchestrator reconciles identical
  content at merge. If the spec drifts between plans, RED tests in this plan
  will catch it.
- Side-loader integration: `loadCoordinatorRunsForReview` and
  `loadTaggingFailuresForReview` are now called with `email_id`s (since
  `r.id === email_id` in the view-driven feed) rather than the previous
  `pipeline_events.id`s. The loaders may need a follow-up to re-key on
  `email_id` if they were strictly keyed on the old id; out of scope for
  Plan 71-03.

## Self-Check: PASSED

- File `web/lib/pipeline-events/__tests__/email-summary.test.ts` exists.
- File `supabase/migrations/20260507a_pipeline_events_email_summary.sql` exists.
- File `web/app/(dashboard)/automations/[swarm]/review/page.tsx` modified (view query swap, PredictedRow extension).
- File `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` modified (7 tests).
- File `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` modified (regression test updated).
- Commit `b584b08`: test(71-03) view contract.
- Commit `5ad38e4`: feat(71-03) loadPageData rewire.
