-- Revert the info-routing `unknown` noise row from premature Stage-3 dispatch
-- back to manual_review (Bulk Review).
--
-- Root cause (debug session `coordinator-createrun-null-email-id`, 2026-06-23):
-- the (info-routing, 'unknown') row was changed live via the Management API on
-- 2026-06-17T06:38 from the safe seed (`action='manual_review',
-- swarm_dispatch=NULL`, migration 20260521b) to
-- `action='swarm_dispatch', swarm_dispatch='pipeline/coordinator.requested'` —
-- with NO migration file (undocumented drift). That points the verdict-worker
-- DIRECTLY at the Stage-3 coordinator, skipping Stage 2. But info-routing has
-- `stage2_entity_resolver = NULL` (by V9.7 design: "no Stage 2"), so the
-- verdict-worker dispatch payload carries a Graph `message_id` but NO resolved
-- DB `email_id`. The coordinator's first step (`createRun`) then INSERTs
-- `agent_runs.email_id = NULL` → NOT NULL violation. Result: every info@
-- `unknown` verdict crashes Stage 3 before any agent_runs row exists
-- (24 failures in the 24h sampled; first failure 2026-06-17T06:52, 14 min after
-- the edit).
--
-- This restores the bleeding-stop state. info@ `unknown` verdicts go back to
-- Bulk Review. The proper V9.7 wiring (an `info-routing-coordinator` that
-- resolves `email_id` from `message_id` since there is no Stage 2, plus an
-- `INTENT_SCHEMA_BY_SWARM['info-routing']` output-schema entry) is V9.7
-- scope-item-2 work and is tracked there, not here.
--
-- The agent key `swarms.stage3_coordinator_agent_key='info-routing-coordinator'`
-- is left as-is: it is harmless while no verdict dispatches to the coordinator,
-- and it is part of the intended V9.7 end state.

BEGIN;

UPDATE public.swarm_noise_categories
SET action         = 'manual_review',
    swarm_dispatch = NULL,
    updated_at     = now()
WHERE swarm_type = 'info-routing'
  AND category_key = 'unknown';

COMMIT;
