-- Phase 131 Plan 01 Task 2 (the LOAD-BEARING wiring) — flip info-routing's
-- Stage-1 `unknown` fall-through from a dead-end manual_review to a Stage-3
-- dispatch.
--
-- Before (20260521b_info_routing_unknown_noise_row.sql): the (info-routing,
-- 'unknown') row has action='manual_review', swarm_dispatch=NULL — the
-- actionable `unknown` pool dead-ends in Bulk Review with nothing dispatching
-- it onward (info-routing has no Stage 2: stage2_entity_resolver=NULL).
--
-- After: action='swarm_dispatch', swarm_dispatch='pipeline/coordinator.requested'
-- — the canonical fan-in event the generic Stage-3 coordinator subscribes to
-- (debtor-email-coordinator.ts trigger). This BYPASSES the absent Stage 2 and
-- emits the event directly from the Stage-1 verdict-worker. WITHOUT this flip the
-- coordinator never fires for info-routing — this is the wiring that makes the
-- whole router reachable.
--
-- Hard-separation invariant honored: the `unknown` row STAYS a
-- swarm_noise_categories (Stage 1) row; destinations live in the new
-- routing_destinations table, NEVER in swarm_intents (Stage 3 intents).
--
-- Idempotent + scoped to WHERE swarm_type='info-routing' AND category_key='unknown'.

BEGIN;

UPDATE public.swarm_noise_categories
   SET action = 'swarm_dispatch',
       swarm_dispatch = 'pipeline/coordinator.requested',
       updated_at = now()
 WHERE swarm_type = 'info-routing'
   AND category_key = 'unknown';

COMMIT;
