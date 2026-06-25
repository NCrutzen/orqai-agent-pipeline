-- Phase 130 (info-routing Stage-1 noise recalibration, 2026-06-16): widen
-- agent_runs_swarm_type_check to include 'info-routing'.
--
-- ROOT CAUSE: the constraint predates the info-routing swarm. It was created in
-- 20260428_public_agent_runs.sql listing only 4 swarm_type values
-- ('debtor-email','sales-email','planning','order-entry'). The LLM Pass-2 in
-- classifier-screen-worker.ts Step 3 (the agent_runs INSERT, rule_key
-- 'llm:{cat}:{conf}') throws Postgres 23514 on EVERY info-routing write — so
-- Stage-1 shadow verdicts never persist, classifier_rule_telemetry stays empty,
-- and the Wilson-CI promotion gate (classifier-promotion-cron) is starved with
-- nothing to evaluate. Every other Phase 130 task is INERT until this lands.
-- This is the same bug class as Phase 113 (20260611_phase113_agent_runs_intent_check_sales.sql):
-- a CHECK predating a new swarm.
--
-- This list MUST stay the union of all swarm_type values — drop+re-add keeps
-- the CHECK in force (it does NOT remove integrity), it only ADDS the
-- legitimate 'info-routing' value; no existing value is dropped.
-- Long-term: drop the CHECK in favour of registry validation (the swarms
-- registry already enumerates valid swarm_type values) or codegen it — per
-- RESEARCH A3 / the Phase 113 checkpoint addendum.
--
-- The `entity` column / its former CHECK is UNTOUCHED here — it was already made
-- nullable in 20260506_phase74_agent_runs_entity_nullable.sql (66 fire-control
-- entity rows live). swarm_type is the SOLE blocker. No data migration.
-- Idempotent via `drop constraint if exists`.

BEGIN;

alter table public.agent_runs
  drop constraint if exists agent_runs_swarm_type_check;

alter table public.agent_runs
  add constraint agent_runs_swarm_type_check
  check (swarm_type in ('debtor-email','sales-email','planning','order-entry','info-routing'));

COMMIT;
