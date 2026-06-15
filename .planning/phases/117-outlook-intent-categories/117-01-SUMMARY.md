---
phase: 117-outlook-intent-categories
plan: 01
subsystem: api
tags: [outlook, microsoft-graph, dry-run-gate, supabase, rls, intent, vitest]

# Dependency graph
requires:
  - phase: 113-stage-3-sales-intent-agent-greenfield
    provides: "Stage-3 ranked-intent verdict (top-1 intent_key) + swarm_intents vocabulary the mapper labels"
  - phase: 112-outlook-cleanup-backfill-gated-production-writes
    provides: "dry_run_config gated-write infra (isStageBlocked) + categorizeEmail Graph PATCH boundary"
provides:
  - "buildIntentCategory/mergeIntentCategory — pure AI: intent→category mapper (D-1)"
  - "stage_3_intent_label fail-closed dry-run gate key (D-3)"
  - "recordWrittenCategory/readWrittenCategory store helper (D-4)"
  - "public.swarm_written_categories RLS table + stage_3_intent_label seed migration (written, not applied)"
affects: [117-02-worker, 112.5-outlook-behavior-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure derived mapper (no per-swarm table) — intent→category is AI: ${intent_key}"
    - "Strip-stale-AI merge replaces categorizeEmail additive merge (full desired set, not append)"
    - "Dedicated fail-closed gate key per side-effect (stage_3_intent_label ⊥ stage_3_labeling ⊥ stage_3_routing)"
    - "email_id-keyed written-category store as 112.5 baseline join point"

key-files:
  created:
    - web/lib/outlook/intent-category.ts
    - web/lib/outlook/__tests__/intent-category.test.ts
    - web/lib/outlook/written-category-store.ts
    - web/lib/outlook/__tests__/written-category-store.test.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts
    - supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql
  modified:
    - web/lib/pipeline-gating/dry-run-gate/index.ts

key-decisions:
  - "Mapper is a pure derived function (AI: ${intent_key}), no per-swarm category table, no confidence suffix v1 (D-1)"
  - "stage_3_intent_label is a DEDICATED gate key, distinct from stage_3_labeling/stage_3_routing — reuse would regress those side effects (D-3)"
  - "Store keyed by email_id (PK + upsert conflict target) so 112.5 can join source_id→email_id→baseline (D-4/D-5)"
  - "Both debtor-email and sales-email seeded GATED (true); migration written but NOT applied (Plan 02 [BLOCKING] applies)"

patterns-established:
  - "Pure swarm-agnostic mapper: buildIntentCategory + mergeIntentCategory strip ALL stale AI: entries before appending one"
  - "Store helper mirrors folder-map.ts (admin: SupabaseClient param, null-on-missing read, no swarm literal)"

requirements-completed: [OUTLOOK-CAT-01, OUTLOOK-CAT-02, OUTLOOK-CAT-05]

# Metrics
duration: 6min
completed: 2026-06-15
---

# Phase 117 Plan 01: Intent-Category Primitives Summary

**Three swarm-agnostic primitives the Phase 117 worker composes: a pure `AI: <intent_key>` intent→category mapper (strip-stale-AI merge), a fail-closed `stage_3_intent_label` dry-run gate key, and an `email_id`-keyed written-category store with its RLS-enabled migration (written, not applied).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-15T12:16:00Z
- **Completed:** 2026-06-15T12:22:00Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- **D-1 mapper:** `intent-category.ts` exporting `AI_CATEGORY_PREFIX`, `buildIntentCategory`, `mergeIntentCategory` — pure, no DB/swarm import. `mergeIntentCategory` strips every stale `AI:` entry, preserves user categories' order, appends the single new label (anti-churn for D-4).
- **D-3 gate key:** `stage_3_intent_label` added to `DryRunConfig` + both stage unions (`isStageBlocked`, `resolveStageDryRun`); fail-closed `?? true` body unchanged. No regression to existing keys (preservation test green); tsc clean.
- **D-4/D-5 store:** `written-category-store.ts` (`recordWrittenCategory` upsert-on-conflict(email_id), `readWrittenCategory` null-on-missing) + migration creating `public.swarm_written_categories` (RLS: service_role FOR ALL + authenticated FOR SELECT, NO anon) and seeding `stage_3_intent_label=true` GATED for both swarms via jsonb `||` merge.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure intent→category mapper** - `c3baae1e` (feat)
2. **Task 2: stage_3_intent_label dry-run gate key** - `be18115e` (feat)
3. **Task 3: written-category store + RLS migration** - `05c1b2ab` (feat)

_TDD note: each task's RED (test-first) and GREEN steps were verified in sequence (resolve/type failure before implementation) and committed together as one atomic feat per task._

## Files Created/Modified
- `web/lib/outlook/intent-category.ts` - Pure D-1 mapper (build label + strip-stale-AI merge)
- `web/lib/outlook/__tests__/intent-category.test.ts` - 7 cases (strip-stale, idempotent, order-stable)
- `web/lib/pipeline-gating/dry-run-gate/index.ts` - `stage_3_intent_label` interface field + 2 union members
- `web/lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts` - 5 cases incl. no-regression
- `web/lib/outlook/written-category-store.ts` - record/read helper (email_id keyed, null-on-missing)
- `web/lib/outlook/__tests__/written-category-store.test.ts` - 3 cases (upsert onConflict + null-on-missing)
- `supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql` - RLS table + dry-run seed (NOT applied)

## Decisions Made
- Followed plan exactly. The plan's snippet of `isStageBlocked`'s union (4 members) was already 5 in the live file (`stage_2_resolution` present from Phase 114) — widening simply added `stage_3_intent_label` as a 5th→6th member; no existing call sites broke (tsc 0).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED gates behaved as expected: Task 1/3 RED was a module-resolve failure; Task 2 RED was a type-level failure (`tsc` rejected the unknown key) since vitest is permissive about `undefined` config values.

## Verification
- `npx vitest run` over all 4 plan test files → 23 passed (4 files).
- `npx tsc --noEmit` → exit 0 (gate union widening type-checks at every call site).
- Migration grep gate: exactly one `CREATE TABLE swarm_written_categories`, one `ENABLE ROW LEVEL SECURITY`, service_role FOR ALL + authenticated FOR SELECT, `TO anon`=0, `TO public`=0; `stage_3_intent_label` seeded for both debtor-email + sales-email via jsonb `||`.
- Migration NOT applied (no remote DB call in this plan — Plan 02 has the [BLOCKING] apply that runs `check:supabase`).

## User Setup Required
None - no external service configuration required in this plan. The migration apply + `check:supabase` gate is Plan 02's [BLOCKING] checkpoint.

## Next Phase Readiness
- Plan 02's worker receives all three contracts as ready interfaces: the mapper (compute desired category set), the gate key (fail-closed write decision), and the store (idempotency + 112.5 baseline). Pure composition — no inline reinvention.
- **Blocker carried to Plan 02:** the migration `20260615_phase117_intent_label_store_and_gate.sql` must be applied to remote (`mvqjhlxfvtqqubqgdvhz`) + `check:supabase` run as the Plan 02 [BLOCKING] task before the worker's store writes/reads will function live.

## Self-Check: PASSED
- FOUND: web/lib/outlook/intent-category.ts
- FOUND: web/lib/outlook/written-category-store.ts
- FOUND: web/lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts
- FOUND: supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql
- FOUND commits: c3baae1e, be18115e, 05c1b2ab

---
*Phase: 117-outlook-intent-categories*
*Completed: 2026-06-15*
