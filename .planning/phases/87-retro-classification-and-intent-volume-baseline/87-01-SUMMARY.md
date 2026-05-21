---
phase: 87-retro-classification-and-intent-volume-baseline
plan: 01
subsystem: database
tags: [supabase, rls, migrations, phase-87, retro-classify]

requires:
  - phase: 86-open-set-intent-discovery-capture-and-cluster-surface
    provides: intent_proposal_clusters table (Phase 87 R-04 gate reads this)
provides:
  - stage_3_retro_runs table — per-email retro Stage 3 verdict, isolated from live pipeline
  - intent_volume_baselines table — D-05 locked schema, snapshot for V8.2/V9.0/V11.0
affects: [phase-87-plan-02, phase-87-plan-04, V8.2, V9.0, V11.0]

tech-stack:
  added: []
  patterns:
    - Side-Channel Isolation table — retro pipeline writes go to a dedicated table that production read paths don't touch
    - (run_id, email_id) UNIQUE index as Inngest replay safety net (CLAUDE.md Phase 65 pattern)
    - Partial index on diff rows for D-04 sample query

key-files:
  created:
    - supabase/migrations/20260521_phase87_stage_3_retro_runs.sql
    - supabase/migrations/20260521_phase87_intent_volume_baselines.sql

key-decisions:
  - "Applied via Supabase MCP apply_migration (operator choice), not supabase db push --linked"
  - "intent_source CHECK enforces D-05 closed enum at the DB layer, not just app layer"
  - "authenticated SELECT enabled now for both tables — V11.0 dashboard reads on this path later"

patterns-established:
  - "Replay-safe DB schema: any table written by Inngest functions where IDs are generated inside step.run must enforce UNIQUE on (run_id, key) to absorb retries idempotently"

requirements-completed: [REQ-87-02, REQ-87-03]

duration: 4min
completed: 2026-05-21
---

# Phase 87 Plan 01: Migrations Summary

**Two append-only tables (`stage_3_retro_runs`, `intent_volume_baselines`) live in production with RLS + service_role policy + authenticated SELECT — ready for Plan 04 to write to.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 3 of 3 (Tasks 1+2 auto inline; Task 3 applied via Supabase MCP per operator choice)
- **Files modified:** 2 migrations

## Accomplishments
- `stage_3_retro_runs` created with `(run_id, email_id)` UNIQUE index, partial index on diff rows, RLS on, service_role + authenticated policies
- `intent_volume_baselines` created per D-05 verbatim with `intent_source` CHECK constraint enforcing closed enum
- Both tables confirmed live in linked project via `mcp__supabase__list_tables` — `rls_enabled: true`
- Supabase security advisor: no new findings for either table; all pre-existing INFO/WARN items unrelated

## Task Commits

1. **Tasks 1 + 2: migrations written** — `ae35e51e` (feat)
2. **Task 3: applied** — via Supabase MCP `apply_migration` (operator chose this path over `npx supabase db push --linked`); equivalent result, both migrations land in the same `supabase_migrations.schema_migrations` ledger.

## Files Created
- `supabase/migrations/20260521_phase87_stage_3_retro_runs.sql` — per-email retro verdict table
- `supabase/migrations/20260521_phase87_intent_volume_baselines.sql` — D-05 snapshot table

## Verification
- ✓ Migration files exist, RLS enabled, no `TO anon`
- ✓ Both tables appear in `list_tables` with `rls_enabled: true`
- ✓ `get_advisors security` returned zero new findings on these tables
- ◯ `npm run check:supabase` not re-run since the operator skipped the `db push` CLI path (irrelevant — equivalent state in DB)

## Carry-forward to Plan 02 / Plan 04
- Insert path: `await admin.from("stage_3_retro_runs").upsert({...}, { onConflict: "run_id,email_id", ignoreDuplicates: true })` (W-3 fix from plan-checker)
- Aggregate path: per-run GROUP BY `new_top_intent`, write rows to `intent_volume_baselines` with `intent_source='closed_list'` for closed-list intents and `intent_source='proposal_cluster'` for proposal centroids
