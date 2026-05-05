---
phase: 70-telemetry-consolidation-pipeline-events
plan: 06
subsystem: web/bulk-review
tags: [bulk-review, pipeline-events, telemetry, read-side]
requires: [70-02, 70-03, 70-04, 70-05]
provides:
  - "Bulk Review predicted-row feed reads from public.pipeline_events"
  - "Bulk Review selected-row detail reads from public.pipeline_events"
  - "Loader regression test guarding pipeline_events read + side-loader parity"
affects:
  - "web/app/(dashboard)/automations/[swarm]/review/page.tsx"
  - "web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts"
tech-stack:
  added: []
  patterns:
    - "decision_details (jsonb) → PredictedRow.result mapping at the loader boundary"
    - "Cost-outlier RPC keyed by event.automation_run_id (legacy table preserved in v1)"
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/review/page.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts"
decisions:
  - "Atomic replacement per D-16 — old automation_runs SELECTs at sub-queries (2) and (6) removed, not commented-out"
  - "Cost-outlier RPC (sub-query 3) stays on automation_runs in v1 per RESEARCH Pitfall 5; Phase 72 may move"
  - "decision_details mapped to PredictedRow.result (with email_id stamped at top level) so RowList / DetailPane / tagging-failure side-loader keep working without consumer-side edits"
  - "Safety branch (?tab=safety) maps to stage=0 + decision='injection_suspected' on pipeline_events"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  completed_date: 2026-05-05
---

# Phase 70 Plan 06: Wave 3 — Bulk Review loadPageData rewire Summary

Rewired the Bulk Review `loadPageData` predicted-row feed and selected-row detail to read from `public.pipeline_events`, leaving the cost-outlier RPC and the 5 out-of-scope queries untouched per RESEARCH Pitfall 5.

## What Shipped

- **Predicted-row feed (sub-query 2)** at `web/app/(dashboard)/automations/[swarm]/review/page.tsx` now selects `id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, automation_run_id, agent_run_id` from `public.pipeline_events` filtered by `swarm_type` + `stage=1` (default branch) or `stage=0` + `decision='injection_suspected'` (safety branch). Cursor pagination preserved via `.lt("created_at", before)` and `.limit(100)`. Topic / entity / mailbox / rule URL filters now hit `decision_details->>...` jsonb selectors.
- **Selected-row detail (sub-query 6)** rewired to `pipeline_events` filtered by id; the row id passed via `?selected=...` is now a `pipeline_events.id`.
- **Outcome mapper** `mapEventToPredictedRow` translates the pipeline_events row shape into `PredictedRow` so downstream `RowList`, `DetailPane`, and the two debtor-email side-loaders see the same fields they saw under `automation_runs`. `email_id` is stamped at `result.email_id` to keep the tagging-failure side-loader (`loadTaggingFailuresForReview`) working without touching its code.
- **Cost-outlier RPC (sub-query 3)** stays on `automation_runs` in v1 with a code comment forward-referencing Phase 72. The outlier map join now keys on `event.automation_run_id` (the canonical id under which the legacy RPC stores its rows) so the per-row outlier flag still lights up the correct row.
- **Top-of-function scope-block comment** added enumerating all 8 sub-queries with IN-SCOPE / OUT-OF-SCOPE labels, matching RESEARCH Pitfall 5.
- **Test scaffold** at `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` with 5 tests covering pipeline_events read, swarm_type+stage filter, RPC regression, side-loader regression, row-count parity. Side-loaders mocked at canonical `@/app/(dashboard)/automations/debtor-email/_lib/...` paths.
- **Safety-review-loader test updated** to assert the new pipeline_events read pattern (stage=0 + decision='injection_suspected' instead of `topic='safety_review'` on automation_runs). Same scenario shape, same five tests, same coverage — only the underlying read shape changed.

## What Did NOT Change (Visible Contract)

- Operator-facing UI is unchanged: `RowList` and `DetailPane` see the same `PredictedRow` shape (id, automation, status, swarm_type, topic, entity, mailbox_id, result, created_at) and render the same fields.
- 5 out-of-scope queries untouched per the plan-checker's scope-creep guardrail:
  - RPC `classifier_queue_counts` (sub-query 1)
  - `classifier_rules` promoted-today (sub-query 4)
  - `classifier_rules` candidate (sub-query 5)
  - `loadCoordinatorRunsForReview` (sub-query 7, side-loader)
  - `loadTaggingFailuresForReview` (sub-query 8, side-loader)

## Verification Results

- `cd web && npx vitest run "app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts"` → 5/5 passed
- `cd web && npx vitest run "app/(dashboard)/automations/[swarm]/review/__tests__/"` → 10/10 passed (5 new + 5 updated safety-review-loader)
- `cd web && npx tsc --noEmit` → clean for `review/page.tsx`
- `grep -c "pipeline_events" page.tsx` → 12 (≥2 required)
- `grep -c "Phase 70 TELE-03 scope" page.tsx` → 1 (≥1 required)
- `grep -c "OUT-OF-SCOPE" page.tsx` → 5 (≥1 required)
- `grep -E "from\(.automation_runs.\)" page.tsx | wc -l` → 0 (≤1 required)
- Out-of-scope queries untouched: `loadCoordinatorRunsForReview` (3), `classifier_queue_counts` (2), `classifier_rules` (6) — all ≥1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated safety-review-loader.test.ts to match the pipeline_events read pattern**

- **Found during:** Task 1 verification
- **Issue:** The existing `safety-review-loader.test.ts` asserted `from("automation_runs")` and `topic=safety_review`, which broke immediately after the Task 1 rewire. It also broke on side-loader stubs (`admin.schema is not a function`, `.in is not a function`) once the new fixture stamped `email_id` into `result.email_id`, which triggered `loadTaggingFailuresForReview` to attempt a real admin-client call.
- **Fix:** Updated fixture rows to the pipeline_events shape (`id`, `decision`, `decision_details`, `automation_run_id`, etc.), updated the four assertions to check `stage=0` + `decision='injection_suspected'`, added an `.in()` stub to `MockBuilder`, and added `vi.mock` stubs for both side-loaders so the loader does not reach their real implementations during tests.
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts`
- **Commit:** `08d3546` (folded into Task 1 commit per D-16 atomic rollout — the test-data shape is part of the same migration unit)

## Commits

- `08d3546` — `feat(70-06): rewire Bulk Review loadPageData feed to pipeline_events`
- `b7ee2ba` — `test(70-06): add load-page-data.test.ts asserting pipeline_events read`

## Self-Check

**Files:**
- FOUND: `web/app/(dashboard)/automations/[swarm]/review/page.tsx`
- FOUND: `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts`
- FOUND: `web/app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts`

**Commits:**
- FOUND: `08d3546`
- FOUND: `b7ee2ba`

## Self-Check: PASSED
