-- Phase 131 Plan 01 Task 2 (ROUTE-07 / Discretion 1) — wire info-routing's
-- swarms row for the Stage-3 router.
--
-- Three changes to the existing public.swarms info-routing row (RLS-enabled
-- table; no new table, no new policy, no anon grant — ALTERs values only):
--
--   1. stage3_coordinator_agent_key = 'info-routing-coordinator'
--      The generic Stage-3 coordinator resolves this key per-swarm to invoke the
--      routing classifier (the Orq agent is registered in a later wave/phase).
--
--   2. dry_run_config || {'stage_3_routing': true}  (HELD — the ROUTE-07
--      no-forward guarantee). TRUE = gated/held: the coordinator persists the
--      routing verdict (coordinator_runs + pipeline_events, visible in Bulk
--      Review) but WITHHOLDS the `<swarm>/predicted` emit → the Stage-3.5
--      dispatcher never fires → no Stage 4 forward. Reuses the existing
--      isStage3RoutingGated held path (Phase 113 — 20260609c). jsonb `||` merge
--      preserves every other per-stage flag; never overwrite the whole jsonb.
--
--   3. resolution_config || {'routing_unrouted_threshold': 0.6}  (Discretion 1,
--      A1). Single swarm-level knob (NOT per-bucket) for the unrouted floor on a
--      low/medium/high → {0.33,0.66,1.0} mapping (require ≥ medium). The value
--      0.6 is ASSUMED — the operator confirms/adjusts it at the Task 3
--      checkpoint; the mechanism is locked.
--
-- stage2_entity_resolver stays NULL (info-routing has no Stage 2 — do not touch).
--
-- Idempotent: re-running re-sets the same keys via the merge. Scoped to
-- WHERE swarm_type = 'info-routing'.

BEGIN;

UPDATE public.swarms
   SET stage3_coordinator_agent_key = 'info-routing-coordinator',
       dry_run_config    = dry_run_config    || jsonb_build_object('stage_3_routing', true),
       resolution_config = COALESCE(resolution_config, '{}'::jsonb)
                           || jsonb_build_object('routing_unrouted_threshold', 0.6),
       updated_at = now()
 WHERE swarm_type = 'info-routing';

COMMIT;
