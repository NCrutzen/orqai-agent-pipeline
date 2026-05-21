---
phase: 70-telemetry-consolidation-pipeline-events
plan: 02
subsystem: telemetry-write-side
tags: [migration, supabase, pipeline_events, emit-helper, wave-1, TELE-01]
requires:
  - "70-01 (vitest scaffolds — emit.test.ts target)"
provides:
  - "public.pipeline_events table (live in Supabase project mvqjhlxfvtqqubqgdvhz) with RLS + realtime + 3 indexes"
  - "web/lib/pipeline-events/types.ts: Stage const, StageValue, PipelineEventInput, numericConfidence helper"
  - "web/lib/pipeline-events/emit.ts: emitPipelineEvent(admin, payload) helper"
affects:
  - "Wave 2-3 emit-site plans (03..06) can now insert against the live table"
  - "Plan 07 (read side / Bulk Review) can query pipeline_events via authenticated session"
tech-stack:
  added: []
  patterns:
    - "Migration via Supabase MCP apply_migration (operator-gated, no supabase db push)"
    - "Service-role-all + authenticated-select RLS pair (matches coordinator_runs template)"
    - "supabaseInserts:any[] mock pattern for emit-helper unit tests"
key-files:
  created:
    - supabase/migrations/20260506a_pipeline_events.sql
    - web/lib/pipeline-events/types.ts
    - web/lib/pipeline-events/emit.ts
  modified:
    - web/lib/pipeline-events/__tests__/emit.test.ts
decisions:
  - "Stage enum is static/closed (Stage 0..4 from docs/agentic-pipeline/README.md) — not registry-derived, no codegen. Documented in types.ts header comment per CLAUDE.md §Build-time codegen guidance."
  - "Migration applied via Supabase MCP at the operator-gated checkpoint (Phase 67/68/69 pattern), not via supabase db push."
  - "No FK constraints (D-05) and no CHECK on swarm_type/stage/eval_type (D-12, deferred)."
  - "numericConfidence mapping: high->0.9, medium->0.7, low->0.4, none|null|undefined->null (RESEARCH §Pitfall 1)."
metrics:
  duration: ~25m
  completed: 2026-05-05
---

# Phase 70 Plan 02: Wave 1 — pipeline_events Table + Emit Helper Summary

Landed the foundational write-side telemetry surface for Phase 70: a single canonical `public.pipeline_events` table with RLS + realtime + 3 indexes, plus a typed `emitPipelineEvent(admin, payload)` helper. All three Plan 01 scaffolds in `emit.test.ts` are unskipped and green; Wave 2-3 emit-site plans (03..06) now have a live INSERT target.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author migration `20260506a_pipeline_events.sql` | e8d2830 | supabase/migrations/20260506a_pipeline_events.sql |
| 2 | Implement `types.ts` + `emit.ts` and unskip `emit.test.ts` | 2bea146 | web/lib/pipeline-events/{types,emit}.ts, web/lib/pipeline-events/__tests__/emit.test.ts |
| 3 | [BLOCKING checkpoint] Operator applies migration via Supabase MCP | n/a (MCP apply) | supabase/migrations/20260506a_pipeline_events.sql (applied to live DB) |

## Verification

### Task 1 — Migration file (acceptance-criteria greps)

- `grep -c "CREATE TABLE IF NOT EXISTS public.pipeline_events" supabase/migrations/20260506a_pipeline_events.sql` → 1
- `grep -c "ENABLE ROW LEVEL SECURITY" …` → 1
- `grep -c "supabase_realtime" …` → 1
- `grep -c "pgcrypto" …` → 1
- `grep -c "CREATE INDEX IF NOT EXISTS pipeline_events_" …` → 3
- `grep -c "REFERENCES" …` → 0 (no FK per D-05)
- `grep -c "CHECK (swarm_type" …` → 0 (deferred per D-12)
- All 16 D-03 columns present.

### Task 2 — Helper + tests

- `cd web && npx vitest run lib/pipeline-events/__tests__/emit.test.ts` → **8 passed, 0 skipped, exit 0**
  - 3 emitPipelineEvent tests (insert success, insert error, null pass-through)
  - 5 numericConfidence tests (high, medium, low, none, undefined)
- `grep -c "it.skip" web/lib/pipeline-events/__tests__/emit.test.ts` → 0
- `grep -c "^export" web/lib/pipeline-events/types.ts` → ≥4 (Stage, StageValue, PipelineEventInput, numericConfidence)
- `grep -c "export async function emitPipelineEvent" web/lib/pipeline-events/emit.ts` → 1
- `grep -c "pipeline_events insert failed" web/lib/pipeline-events/emit.ts` → 1
- TypeScript compiles cleanly for the new module (no pipeline-events errors).

### Task 3 — Live DB verification (Supabase MCP, project `mvqjhlxfvtqqubqgdvhz`)

Migration applied via `mcp__supabase__apply_migration` with name `20260506a_pipeline_events`. Result: `{"success": true}`.

Operator verification output (verbatim):

```
exists=true, rows=0, rls=true, realtime_wired=1
indexes={pipeline_events_email_id_idx, pipeline_events_override_partial_idx, pipeline_events_pkey, pipeline_events_swarm_stage_created_idx}
policies={pipeline_events_auth_select, pipeline_events_service_all}
```

Confirms:
- Table exists in live DB, 0 rows (as expected — no emit sites land until Wave 2).
- RLS enabled (`rls=true`).
- Realtime publication wired (`realtime_wired=1`).
- All 3 expected indexes present plus implicit pkey.
- Both RLS policies present: `pipeline_events_service_all` (FOR ALL TO service_role) and `pipeline_events_auth_select` (FOR SELECT TO authenticated).

## Deviations from Plan

None — plan executed exactly as written. Migration content, types/emit signatures, and test assertions all match the PLAN.md interfaces verbatim.

## Threat Mitigations Verified

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-70-02-01 (PII in decision_details) | Mitigated — RLS service_role-all + authenticated-select active in live DB; no client-side raw exposure path exists yet (read side lands in Plan 07). |
| T-70-02-02 (Tampering) | Mitigated — RLS denies anon/authenticated INSERT/UPDATE/DELETE; only service_role policy permits writes. |
| T-70-02-03 (Repudiation forward-compat) | Accepted as documented — Phase 70 leaves override NULL; Phase 71 will add operator_id validation. |
| T-70-02-04 (Missing RLS) | Mitigated — `relrowsecurity=true` confirmed in live DB verification. |

## Known Stubs

None.

## Downstream Notes (for Plan 07 / phase close)

- ROADMAP.md and REQUIREMENTS.md TELE-* check-off is **owned by Plan 07**, not this plan. Per resume context, this SUMMARY does not modify those files.
- Wave 2-3 plans (03..06) can now `import { emitPipelineEvent, Stage, numericConfidence } from "@/lib/pipeline-events"` and INSERT against the live table.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260506a_pipeline_events.sql
- FOUND: web/lib/pipeline-events/types.ts
- FOUND: web/lib/pipeline-events/emit.ts
- FOUND: web/lib/pipeline-events/__tests__/emit.test.ts
- FOUND commit: e8d2830 (Task 1 — migration authored)
- FOUND commit: 2bea146 (Task 2 — types/emit/test wired)
- LIVE DB: public.pipeline_events confirmed via Supabase MCP (exists=true, rls=true, realtime_wired=1, 4 indexes incl. pkey, 2 RLS policies)
