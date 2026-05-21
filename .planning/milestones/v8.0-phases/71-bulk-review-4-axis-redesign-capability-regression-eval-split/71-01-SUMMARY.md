---
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
plan: 01
subsystem: pipeline-events / ui-primitives
tags: [view, types, shadcn-vendor, fixtures, brand-color]
provides:
  - "public.pipeline_events_email_summary VIEW (security_invoker=true)"
  - "OverrideAxis literal-union + OverrideJson interface"
  - "Switch + RadioGroup shadcn primitives"
  - "brandColorToken(brand) helper"
  - "Override-event fixtures (8 canonical payloads)"
  - "Stage-2 customer-search source decision (locked: source=b NXT-via-Zapier)"
requires:
  - "public.pipeline_events table (Phase 70)"
  - "swarms.entity_brand jsonb registry (Phase 69)"
  - "radix-ui unified package (already in web/package.json)"
affects:
  - "Plan 71-02 override route (consumes OverrideAxis + OverrideJson)"
  - "Plan 71-03 override handler (consumes OverrideJson + view)"
  - "Plan 71-04 Bulk Review UI (consumes Switch, RadioGroup, brandColorToken, view)"
tech-stack:
  added: []
  patterns:
    - "security_invoker=true on read-side views to inherit RLS from base table"
    - "DISTINCT ON (email_id, swarm_type, stage) ORDER BY created_at DESC for latest-per-stage"
key-files:
  created:
    - "supabase/migrations/20260507a_pipeline_events_email_summary.sql"
    - "web/components/ui/switch.tsx"
    - "web/components/ui/radio-group.tsx"
    - "web/lib/swarms/brand-color.ts"
    - "web/lib/pipeline-events/__tests__/fixtures/override-events.ts"
  modified:
    - "web/lib/pipeline-events/types.ts"
decisions:
  - "Stage-2 customer-search source = (b) Live NXT-via-Zapier with 250ms client debounce — sources (a) and (c) infeasible due to missing columns"
metrics:
  duration: "≈ 25 minutes (single executor pass)"
  completed: 2026-05-05
requirements: [REVW-05, REVW-06]
---

# Phase 71 Plan 01: Wave 0 Foundation Summary

**One-liner:** Wave 0 lays the typed and structural foundation for Phase 71 — per-email aggregate view (security_invoker), 4-axis override types, vendored Switch/RadioGroup primitives, brand-color token helper, override-event fixtures, and a locked Stage-2 customer-search decision (NXT-via-Zapier).

## Tasks Completed

| # | Task                                            | Commit    | Key Files                                                                    |
|---|-------------------------------------------------|-----------|------------------------------------------------------------------------------|
| 1 | per-email aggregate view migration              | `60349cf` | `supabase/migrations/20260507a_pipeline_events_email_summary.sql`            |
| 2 | OverrideAxis + OverrideJson types               | `ce89ac2` | `web/lib/pipeline-events/types.ts`                                           |
| 3 | shadcn Switch + RadioGroup primitives vendored  | `76bf476` | `web/components/ui/switch.tsx`, `web/components/ui/radio-group.tsx`          |
| 4 | brandColorToken helper                          | `d7877ba` | `web/lib/swarms/brand-color.ts`                                              |
| 5 | override-event fixtures (8 canonical payloads)  | `2c0f9bd` | `web/lib/pipeline-events/__tests__/fixtures/override-events.ts`              |
| 6 | Stage-2 customer-search source spike (auto)     | (no code) | (decision recorded in this SUMMARY)                                          |

## Verification

- `cd web && tsc --noEmit` — 0 errors in changed files. (2 pre-existing test errors in `debtor-email-coordinator.test.ts:440` and `debtor-email-orchestrator.test.ts:265` confirmed present on the base commit `f5b5bc6`; out of scope per Plan 71-01.)
- Migration file contains all 4 required literal strings (`CREATE OR REPLACE VIEW public.pipeline_events_email_summary`, `WITH (security_invoker = true)`, `GRANT SELECT ON public.pipeline_events_email_summary TO authenticated, service_role`, `CREATE INDEX IF NOT EXISTS pipeline_events_email_stage_created_idx`).
- types.ts has `export type OverrideAxis` + `export interface OverrideJson` + all 4 axis literals.
- 8 override fixtures exported.
- No raw hex literals in any new TS file (Switch, RadioGroup, brand-color all use Tailwind class tokens that resolve to `--v7-*` via `globals.css`).

## EXPLAIN ANALYZE — DEFERRED

The plan's Task 1 directs applying the migration to acceptance via the Supabase MCP and capturing `EXPLAIN ANALYZE` output for the view's first 100-row scan. **This worktree executor does not have the Supabase MCP available and cannot apply DDL to a remote project.** The migration file is committed and verified syntactically; applying it (and capturing the EXPLAIN ANALYZE) is **deferred to the orchestrator / operator** before Plan 71-03 begins (which depends on the view existing in acceptance for its email-summary tests).

Action item for the operator: run via Supabase MCP `apply_migration` with the file `supabase/migrations/20260507a_pipeline_events_email_summary.sql`, then `EXPLAIN ANALYZE SELECT * FROM pipeline_events_email_summary WHERE swarm_type='debtor-email' ORDER BY last_event_at DESC LIMIT 100;` and append the plan to this file under "Perf Baseline".

## Stage-2 Customer-Search Source Decision (Task 6)

**Auto-approved (auto mode active): source = (b) Live NXT-via-Zapier with 250ms client debounce.**

### Spike findings

1. `email_pipeline.customer_index` — **does NOT exist as a table.** No `CREATE TABLE` for it in `supabase/migrations/`; UI-SPEC reference is aspirational.
2. Existing customer-search code path: `web/lib/automations/debtor-email/resolve-debtor.ts` (lines 47-204) resolves customer identity via `web/lib/automations/debtor-email/nxt-zap-client.ts` (NXT-via-Zapier). Returns `{customer_account_id, customer_name}`.
3. `debtor.email_labels` (Phase 56 migration `20260428_debtor_email_labeling_phase56.sql`) has columns `customer_account_id` and `corrected_customer_account_id` (text) but **no** `customer_name` column. Insufficient for a combobox that needs to render names.
4. `coordinator_runs` insert at `web/lib/inngest/functions/debtor-email-coordinator.ts:109-118` does not write `customer_account_id` or `customer_name`. Source (a) is infeasible.

### Why (b) wins

- (a) coordinator_runs DISTINCT — **infeasible**, columns absent.
- (c) email_labels denormalised — **insufficient**, only has the id, no display name.
- (b) NXT-via-Zapier — **viable today**, reuses the same authoritative resolver Stage 2 already calls, no fresh migration required, fits the ≤250ms debounce target with the existing Zapier round-trip.
- Reachable from RSC loader / API route via existing `DEBTOR_FETCH_WEBHOOK_SECRET` env var (no new env vars in Phase 71).

### Plan 71-04 implementation note

`stage-2-widget.tsx` will call a thin Next.js route handler that proxies to `nxt-zap-client.ts` with debounce on the client side. The route handler MUST stamp `operator_id` from `auth.uid()` server-side per D-13 even on the search path (so search audit-trails attach to the right operator).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] brand-color.ts import path**
- **Found during:** Task 4 read of plan.
- **Issue:** Plan instructed importing `Entity` from `web/lib/swarms/entity.generated.ts`, but that file does not exist. The codegen script `web/scripts/gen-entity-types.ts` writes its output to `web/lib/automations/debtor-email/coordinator/entity.generated.ts`.
- **Fix:** Changed import in `web/lib/swarms/brand-color.ts` to `../automations/debtor-email/coordinator/entity.generated`. Verified `Entity` literal-union is exported there (`smeba | smeba-fire | berki | sicli-noord | sicli-sud`).
- **Files modified:** `web/lib/swarms/brand-color.ts`
- **Commit:** `d7877ba`

**2. [Rule 3 — Convention mismatch] shadcn primitives use unified `radix-ui` package, not per-component `@radix-ui/react-*`**
- **Found during:** Task 3.
- **Issue:** Plan acceptance criteria asked to verify `@radix-ui/react-switch` + `@radix-ui/react-radio-group` in `package.json`. The project actually uses the unified `radix-ui` v1.4.3 package (matches `select.tsx` and `dropdown-menu.tsx` style); per-component packages are not installed and adding them would diverge from existing primitives.
- **Fix:** Wrote both new primitives importing `Switch as SwitchPrimitive` and `RadioGroup as RadioGroupPrimitive` from `radix-ui`, identical to existing `select.tsx` style. Verified `radix-ui/dist/index.d.ts` exports both.
- **Files modified:** `web/components/ui/switch.tsx`, `web/components/ui/radio-group.tsx`
- **Commit:** `76bf476`

### Auth gates

None.

## Threat Surface Scan

No new trust-boundary surface beyond what the plan's `<threat_model>` already covers (T-71-01-01 view RLS via security_invoker; T-71-01-04 axis runtime validation deferred to Plan 02 Zod). No threat flags.

## Self-Check: PASSED

Verified files exist:
- `supabase/migrations/20260507a_pipeline_events_email_summary.sql` — FOUND
- `web/lib/pipeline-events/types.ts` (modified) — FOUND with OverrideAxis + OverrideJson
- `web/components/ui/switch.tsx` — FOUND
- `web/components/ui/radio-group.tsx` — FOUND
- `web/lib/swarms/brand-color.ts` — FOUND
- `web/lib/pipeline-events/__tests__/fixtures/override-events.ts` — FOUND

Verified commits exist:
- `60349cf` — FOUND
- `ce89ac2` — FOUND
- `76bf476` — FOUND
- `d7877ba` — FOUND
- `2c0f9bd` — FOUND
