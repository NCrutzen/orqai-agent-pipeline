---
phase: 65-stage-3-ranked-multi-intent-coordinator
plan: 01
subsystem: database
tags: [agentic-pipeline, debtor-email, supabase-migration, coordinator, zod, vitest]

requires:
  - phase: 64
    provides: Stage 0 safety worker test patterns (mock-step shell mirrored into Wave 0 Inngest-fn scaffolds)
provides:
  - coordinator_runs table (D-11) with synthesis_dispatched_at race-guard, cost_cents_total, tokens_total
  - swarm_categories.requires_orchestration column (D-08) + 8-row Stage 3 INTENT vocabulary seed (Pitfall 1)
  - coordinator_complete_handler RPC (D-04) — atomic completed_handlers increment + atomic synthesis claim
  - HandlerOutput cross-swarm canonical type (D-06) at web/lib/agentic-pipeline/types.ts
  - intentAgentOutputSchemaV2 + INTENT_VERSION_V2 ('2026-05-01.v2') alongside v1 (D-12)
  - 8 Wave 0 vitest scaffolds covering CORD-01..04
affects: [65-02, 65-03, 65-04, 65-05, 66, 71]

tech-stack:
  added: []
  patterns:
    - "Atomic RPC fan-in counter + single-claim synthesis dispatch via UPDATE ... WHERE synthesis_dispatched_at IS NULL"
    - "Versioned zod schemas (v1 + v2 coexist) keyed off INTENT_VERSION literal for cache invalidation"
    - "Wave 0 it.todo scaffolds — file exists, vitest counts it, real assertions land in later waves"

key-files:
  created:
    - supabase/migrations/20260501a_coordinator_runs.sql
    - supabase/migrations/20260501b_swarm_categories_requires_orchestration.sql
    - supabase/migrations/20260501c_coordinator_complete_handler_rpc.sql
    - web/lib/agentic-pipeline/types.ts
    - web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts
    - web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts
    - web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts
  modified:
    - web/lib/automations/debtor-email/triage/types.ts

key-decisions:
  - "v1 zod schema kept alongside v2 — Plan 65-05 backfill comparator needs it; Phase 66 deletes v1"
  - "INTENT_VERSION_V2 literal must equal exactly '2026-05-01.v2' — Plan 02 uses the same literal in the Orq agent's output_schema.intent_version.const (Pitfall 4 guard)"
  - "Synthesis dispatch claimed via app-side emit gated on RPC's claim_synthesis=true return (OQ2 — keeps Inngest concurrency + replay safety in app code, not pg_net)"
  - "RPC is SECURITY DEFINER with set search_path = public, revoke from public, grant execute to service_role only (T-65-01)"
  - "Wave 0 test files use it.todo + vi.mock to avoid top-level imports of yet-to-be-implemented modules — vitest counts them green"

patterns-established:
  - "Versioned intent schemas (V1/V2 coexist) for cache-key invalidation"
  - "RPC race-guard pattern: WHERE column IS NULL + RETURNING true INTO v_claimed for single-winner"
  - "Wave 0 scaffold pattern: it.todo + mock-step shell, real assertions arrive in later plans"

requirements-completed: []  # CORD-01 + CORD-02 foundations laid; full completion requires Plans 03/04/05

duration: ~2min (Wave 0 + types + migrations); manual SQL apply ~separate operator session
completed: 2026-05-01
---

# Phase 65 Plan 01: Schema + Types + Wave 0 Scaffolds Summary

**Coordinator schema foundation: coordinator_runs table with race-guard column, swarm_categories ALTER + 8-row INTENT vocabulary seed, fan-in RPC with atomic synthesis-claim, plus HandlerOutput canonical type, ranked-intent zod V2 schema, and 8 Wave 0 vitest scaffolds — live database manually applied.**

## Performance

- **Duration:** ~2 min agent execution (Tasks 1-3) + operator SQL apply (manual)
- **Started:** 2026-05-01T16:36:51Z (Task 1 commit)
- **Completed:** 2026-05-01T16:38:58Z (Task 3 commit) + manual schema apply by operator
- **Tasks:** 4 (all complete; Task 4 satisfied via manual SQL editor instead of `supabase db push`)
- **Files modified:** 13 (12 created, 1 modified)

## Accomplishments

- **coordinator_runs table** live with all 17 D-11 columns including `synthesis_dispatched_at` (race-guard), `cost_cents_total`, `tokens_total`. Indexes on (swarm_type, created_at desc), automation_run_id, email_id. RLS + Realtime publication mirror swarm_registry pattern.
- **swarm_categories** extended with `requires_orchestration` boolean; 8 INTENT-vocabulary rows seeded (`copy_document_request`, `payment_dispute`, `address_change`, `peppol_request`, `credit_request`, `contract_inquiry`, `general_inquiry`, `other`) — `payment_dispute`, `credit_request`, `other` flagged `requires_orchestration=true`. Without this seed Pitfall 1 silently kills every fast-path single-shot dispatch.
- **coordinator_complete_handler RPC** live: SECURITY DEFINER, atomic `completed_handlers + 1`, atomic single-claim of synthesis dispatch via `UPDATE ... WHERE synthesis_dispatched_at IS NULL AND completed_handlers >= expected_handlers RETURNING true INTO v_claimed`. Returns `(completed_handlers, expected_handlers, claim_synthesis)` — exactly one simultaneous caller wins.
- **HandlerOutput** canonical type exported from `@/lib/agentic-pipeline/types` (cross-swarm, output-only — Phase 69 canonicalises input shape).
- **intentAgentOutputSchemaV2** + `INTENT_VERSION_V2 = '2026-05-01.v2'` codified alongside v1; ranked array bounded `min(1).max(5)` per OQ6.
- **8 Wave 0 vitest scaffolds** locked in (CORD-01..04 coverage); 4 real assertions in `types-v2.test.ts` validate v1 rejection / v2 accept / empty-rejection / 6-entry-rejection / literal mismatch.

## Task Commits

1. **Task 1: Wave 0 — scaffold all test files (failing stubs)** — `d6badd6` (test)
2. **Task 2: Codify HandlerOutput type + intentAgentOutputSchemaV2** — `17ee6a5` (feat)
3. **Task 3: Write 3 Supabase migrations** — `755127f` (feat)
4. **Task 4: [BLOCKING] supabase db push** — satisfied via manual operator SQL apply (see Deviations)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `supabase/migrations/20260501a_coordinator_runs.sql` — coordinator_runs table + indexes + RLS + Realtime publication
- `supabase/migrations/20260501b_swarm_categories_requires_orchestration.sql` — ALTER + 8-row INTENT vocabulary seed
- `supabase/migrations/20260501c_coordinator_complete_handler_rpc.sql` — fan-in counter + synthesis-claim RPC
- `web/lib/agentic-pipeline/types.ts` — cross-swarm HandlerOutput interface (new file)
- `web/lib/automations/debtor-email/triage/types.ts` — appended INTENT_VERSION_V2, rankedIntentEntrySchema, intentAgentOutputSchemaV2 (v1 retained)
- `web/lib/automations/debtor-email/triage/__tests__/types-v2.test.ts` — 4 real assertions on V2 schema
- `web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts` — it.todo (CORD-01)
- `web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts` — it.todo (CORD-04)
- `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` — it.todo (CORD-02)
- `web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` — it.todo (CORD-03)
- `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` — mock-step shell + it.todo (CORD-02 + CORD-04)
- `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` — mock-step shell + it.todo (CORD-03)
- `web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` — mock-step shell + it.todo (CORD-03)

## Decisions Made

- **v1 retained alongside v2.** Phase 66 deletes v1; Plan 65-05 backfill regression comparator still requires it.
- **App-side synthesis emit, not pg_net.** RPC returns `claim_synthesis` boolean; the Inngest worker emits `debtor-email/synthesis.requested` only when claim_synthesis=true. Keeps Inngest concurrency + replay safety in application code (OQ2).
- **`requires_orchestration=true` for `payment_dispute`, `credit_request`, `other`.** These intents inherently span multiple stage-4 handlers or require human judgment by default; the column makes the escalation gate registry-driven.
- **`it.todo` over real assertions in Wave 0.** Modules-under-test (e.g., `invokeIntentAgent` v2, escalation gate) don't exist yet on Plan 01. `it.todo` keeps vitest green and locks the contract names; Plans 03/04/05 convert each todo into a real assertion.

## Deviations from Plan

### Operator-applied SQL instead of `supabase db push`

**1. [Rule 3 - Blocking adjacent] Migrations applied via Supabase SQL editor**
- **Found during:** Task 4 (BLOCKING checkpoint)
- **Issue:** Agent environment did not have a current `SUPABASE_ACCESS_TOKEN` set (STATE.md flagged the Phase 50 token as expired). `supabase db push` could not run from the agent's shell.
- **Fix:** Operator copy-pasted the three migration files into the Supabase SQL editor in the production project and ran them manually. Operator confirmed via direct verification:
  - `coordinator_runs` exists with all 17 expected columns including `synthesis_dispatched_at`, `cost_cents_total`, `tokens_total` (data types and defaults correct)
  - `swarm_categories` row count for the 8 INTENT vocabulary keys = 8 (Pitfall 1 seed live)
  - `coordinator_complete_handler(p_run_id uuid, p_failed boolean default false)` exists with `security_definer = true` and the expected return signature
- **Files modified:** none in repo (live DB only); migration files in `supabase/migrations/` are committed in commit `755127f`
- **Verification:** Operator signal "schema applied" + the three direct schema queries above
- **Committed in:** N/A (no repo change for the manual apply itself)

**Future-maintainer caveat:** the remote `supabase_migrations.schema_migrations` table will NOT show these three migrations as applied via the CLI, because the operator bypassed `supabase db push`. A future maintainer running `supabase db push` against this project will see the CLI try to re-apply them — the migrations are idempotent (`if not exists`, `on conflict do update`) so re-application is safe, but the CLI history will look out of sync until the next migration is applied normally and Supabase reconciles. If this becomes a blocker, run `supabase migration repair --status applied 20260501a 20260501b 20260501c` on a session with a valid `SUPABASE_ACCESS_TOKEN`.

---

**Total deviations:** 1 process deviation (no auto-fixes to code/SQL).
**Impact on plan:** None — live schema is correct and matches migration files verbatim. Only side-effect is the CLI migration history is one-step out of date until next normal push.

## Issues Encountered

- `SUPABASE_ACCESS_TOKEN` not present in agent shell. Resolved by operator running the SQL manually (see Deviations).

## must_haves verification

| Truth | Status |
|-------|--------|
| coordinator_runs table with all D-11 columns + synthesis_dispatched_at + cost_cents_total + tokens_total | Confirmed live (operator) + grep on migration file |
| swarm_categories.requires_orchestration boolean NOT NULL DEFAULT false | Confirmed live (operator) + grep on migration file |
| 8 INTENT-vocabulary rows with action='swarm_dispatch' and swarm_dispatch='debtor-email/<intent>.requested' | Confirmed live, count=8 (operator) |
| coordinator_complete_handler atomic increment + atomic synthesis claim via synthesis_dispatched_at IS NULL | Confirmed live, security_definer=true (operator) |
| intentAgentOutputSchemaV2 + INTENT_VERSION_V2='2026-05-01.v2' codified alongside v1 | Confirmed via grep on web/lib/automations/debtor-email/triage/types.ts |
| HandlerOutput interface in web/lib/agentic-pipeline/types.ts | Confirmed via grep |
| Wave 0 test files exist as stubs/scaffolds covering CORD-01..04 | Confirmed: 8 files exist, vitest run exits 0 (1 passed, 7 skipped, 4 real assertions + 17 todo) |
| supabase db push applied — live database matches migration files | Satisfied via manual operator SQL editor apply (see Deviations) |

| Artifact | Status |
|----------|--------|
| supabase/migrations/20260501a_coordinator_runs.sql | Created, committed in 755127f |
| supabase/migrations/20260501b_swarm_categories_requires_orchestration.sql | Created, committed in 755127f |
| supabase/migrations/20260501c_coordinator_complete_handler_rpc.sql | Created, committed in 755127f |
| web/lib/agentic-pipeline/types.ts | Created, committed in 17ee6a5; exports HandlerOutput, HandlerContentKind, HandlerLanguage, HandlerTone, HandlerConfidence |
| web/lib/automations/debtor-email/triage/types.ts | Modified, committed in 17ee6a5; both INTENT_VERSION (v1) and INTENT_VERSION_V2 present |

| Key link | Status |
|----------|--------|
| swarm_categories.category_key (intent rows) ↔ INTENT enum in triage/types.ts (verbatim string match) | Confirmed: 8 rows, 8 enum values, exact match |
| intentAgentOutputSchemaV2.intent_version literal '2026-05-01.v2' ↔ Plan 02 Orq agent output_schema.intent_version.const | Locked via INTENT_VERSION_V2 constant; Plan 02 will reference the same literal |

## Verification Results

- `cd web && npx vitest run <8 Wave 0 files>` → **1 passed, 7 skipped, 4 tests passed + 17 todo, exit 0**
- `cd web && npx tsc --noEmit` → **clean (no errors)**
- Operator-confirmed live schema queries → **all match expected**

## Threat Flags

None — all new surface (RPC, table, RLS, Realtime publication) is documented in the plan's `<threat_model>` and dispositions are mitigated/accepted there.

## Requirements Addressed

- **CORD-01** (Stage 3 coordinator emits ordered ranked intents) — **foundation in-progress**: ranked schema codified (`intentAgentOutputSchemaV2`); Plans 02/03 wire it to the actual coordinator agent + Inngest function.
- **CORD-02** (Coordinator escalates on confidence/intent_count/requires_orchestration flag) — **foundation in-progress**: `requires_orchestration` column live + 8 vocabulary rows seeded with the correct flags; Plan 03 implements the gate function itself.

## Next Phase Readiness

- Plans 65-02..05 unblocked. Plan 02 builds the v2 Orq agent referencing `INTENT_VERSION_V2`; Plan 03 builds the escalation gate against `requires_orchestration`; Plan 04 wires the RPC + orchestrator-worker; Plan 05 backfill regression compares v1 vs v2 outputs.
- **Caveat for Plan 04:** when first `supabase db push` runs in a future session, expect CLI migration history reconciliation noise (see Deviations). Run `supabase migration repair --status applied 20260501a 20260501b 20260501c` if needed.

## Self-Check: PASSED

- All 13 files exist on disk (verified via git show stat for d6badd6, 17ee6a5, 755127f)
- All 3 commits exist in git log: d6badd6, 17ee6a5, 755127f
- Vitest exits 0 on the 8 Wave 0 files
- tsc --noEmit exits 0
- Live schema applied (operator-confirmed)

---
*Phase: 65-stage-3-ranked-multi-intent-coordinator*
*Plan: 01*
*Completed: 2026-05-01*
