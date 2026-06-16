---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
plan: 01
subsystem: stage-1-noise-telemetry
tags: [info-routing, stage-1, noise, classifier_rules, agent_runs, telemetry]
status: complete
requires:
  - "public.agent_runs (20260428) — the cross-swarm telemetry table whose CHECK blocks info-routing"
provides:
  - "Widened agent_runs_swarm_type_check including 'info-routing' (migration written; APPLY GATED on operator Task 3)"
  - "Live-INSERT smoke proving the CHECK no longer rejects info-routing (Wave-0 acceptance anchor)"
affects:
  - "classifier-screen-worker.ts Step-3 agent_runs INSERT (info-routing writes unblocked once migration applied)"
  - "classifier_rule_telemetry view → classifier-promotion-cron (Wilson-CI gate can accumulate info-routing telemetry)"
tech-stack:
  added: []
  patterns:
    - "Drop+re-add CHECK widen mirroring Phase 113 (20260611) — same bug class: a CHECK predating a new swarm"
    - "it.skipIf(!hasCreds) live-DB integration smoke with stub-env detection + row cleanup (mirrors swarm-hard-separation.test.ts)"
key-files:
  created:
    - "supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql"
    - "web/__tests__/migrations/agent-runs-info-routing-insert.test.ts"
  modified: []
decisions:
  - "entity CHECK untouched (already nullable via 20260506_phase74); swarm_type was the SOLE blocker"
  - "Migration apply is the Task-3 blocking-human checkpoint (production DDL); NOT self-approved (autonomous:false, auto-mode off)"
metrics:
  duration: ~3m
  completed: 2026-06-16
requirements: [NOISE-02]
---

# Phase 130 Plan 01: agent_runs swarm_type CHECK widen (info-routing) Summary

One-liner: Widened `public.agent_runs_swarm_type_check` to include `'info-routing'` via an idempotent drop+re-add migration (mirroring the Phase 113 precedent), plus a live-INSERT smoke test proving the Postgres `23514` rejection is gone — unblocking Stage-1 shadow telemetry for the info-routing swarm. **The migration apply to the production remote is a blocking-human checkpoint (Task 3) and has NOT been applied.**

## What Was Built

- **Task 1 — Migration** (`20260616_phase130_agent_runs_swarm_type_check_info_routing.sql`, commit `abccc8d8`): `BEGIN; … COMMIT;`-wrapped drop-constraint-if-exists → add-constraint, widening the value list to the exact union `'debtor-email','sales-email','planning','order-entry','info-routing'`. Header comment carries root-cause (CHECK predates the info-routing swarm; classifier-screen-worker Step-3 INSERT threw 23514 on every info-routing write; telemetry never landed; Wilson-CI gate starved), the union-invariant line, and the long-term "drop the CHECK in favour of registry validation / codegen" note. Entity CHECK untouched. No data migration. Idempotent.

- **Task 2 — Smoke test** (`web/__tests__/migrations/agent-runs-info-routing-insert.test.ts`, commit `f2606cdf`): vitest integration test that INSERTs an info-routing `agent_runs` row mirroring the worker Step-3 shape (`swarm_type='info-routing'`, `entity='smeba'`, `rule_key='llm:cold_sales_outreach:high'`, `status='predicted'`, `tool_outputs`), asserts no error and specifically not code `23514` / `agent_runs_swarm_type_check`, then DELETEs the row (no telemetry pollution). `it.skipIf(!hasCreds)` with the same stub-env detection as `swarm-hard-separation.test.ts`, so CI without secrets stays green. Wave-0 acceptance anchor: RED against prod until the Task-3 apply, GREEN after.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2.

## Verification Notes

- **Task 1 automated verify: PASSED.** `grep` confirmed exactly one non-comment line referencing `info-routing`, plus `drop constraint if exists agent_runs_swarm_type_check` and `add constraint agent_runs_swarm_type_check` present.
- **Task 2 verify: NOT RUN in this environment.** `web/node_modules` is absent (deps not installed project-wide), so vitest cannot execute locally. Installing deps is out of scope (Rule 3 package-install exclusion). The test file passes `node --check` (no syntax errors). Per the plan, the test is the operator-gated Wave-0 anchor — its true PASS requires both installed deps and the applied migration, both of which happen at the Task-3 checkpoint. This is consistent with the plan's explicit "will RED until the migration is applied … mark it as the gate."

## Checkpoint (Task 3 — BLOCKING HUMAN)

Operator must, IN ORDER:
1. Apply `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql` to remote (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration` (DDL → remote; same pattern as Phase 113/117).
2. `npm run check:supabase` → expect 0 ERROR-level advisor lints (CHECK-widen has no RLS impact).
3. `cd web && npx vitest run __tests__/migrations/agent-runs-info-routing-insert.test.ts` → expect PASS (INSERT now succeeds; previously 23514). Requires `web` deps installed.
4. Optionally confirm live: a direct `agent_runs` INSERT with `swarm_type='info-routing'` returns success, then roll it back.

Resume signal: "migration applied".

## Checkpoint RESOLVED (Task 3 — 2026-06-16, orchestrator-applied)

Operator authorized "I apply it now via MCP". Executed by the execute-phase orchestrator:
1. **Applied** — `apply_migration` (name `20260616_phase130_agent_runs_swarm_type_check_info_routing`) to remote `mvqjhlxfvtqqubqgdvhz`. Pre-state confirmed the 4-value CHECK; post-state `pg_get_constraintdef` now reads the 5-value union including `'info-routing'`.
2. **Advisors** — `get_advisors(security)` returned 0 new ERROR-level lints attributable to the change (CHECK-widen has no RLS impact; only pre-existing INFO/WARN lints remain).
3. **Vitest smoke** — NOT runnable locally (`web/node_modules` absent; package install out of scope). Proven equivalently via a **live INSERT roundtrip**: an `agent_runs` row with `swarm_type='info-routing'` INSERTed with **no `23514`** (previously rejected), then DELETEd. Post-cleanup `count(*) where swarm_type='info-routing'` = 0 — no telemetry pollution.

Stage-1 shadow telemetry for the info-routing swarm is now unblocked. Wave 1 (130-02, 130-03) cleared to execute.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql`
- FOUND: `web/__tests__/migrations/agent-runs-info-routing-insert.test.ts`
- FOUND commit: `abccc8d8` (Task 1)
- FOUND commit: `f2606cdf` (Task 2)
