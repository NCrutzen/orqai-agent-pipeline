-- Phase 131 gap-closure — `algemeen` becomes a CLASSIFIED-BUT-NOT-FORWARDED
-- ("stays in info@") destination, in a SWARM-AGNOSTIC way (registry data only —
-- the verdict logic reads a matched row with a NULL target_mailbox; no bucket
-- name is hardcoded in pipeline code).
--
-- Operator decision (2026-06-17): the algemeen@smeba.nl mailbox does NOT exist.
-- Algemeen / contactformulier mail must STAY in info@ (no forward), but it IS a
-- valid classification — it must NOT be mislabeled `unrouted` ("don't know").
-- Nulling the target_mailbox makes resolveRoutingDestination return
-- {matched:true, target_mailbox:null}; buildRoutingVerdict then records
-- bucket='algemeen', target_mailbox=null, unrouted=false. The Phase-132
-- forwarder simply does not forward when target_mailbox is null.
--
-- Idempotent UPDATE, scoped to the info-routing algemeen row. The `unrouted`
-- sentinel row is left as-is (the verdict short-circuits on UNROUTED_BUCKET
-- before resolving, so the sentinel row is never consulted — harmless).
-- DESTINATION_KEYS_BY_SWARM (codegen) is bucket-KEYS only, so this target change
-- does NOT affect codegen — no regeneration needed.

BEGIN;

UPDATE public.routing_destinations
SET
  target_mailbox = NULL,           -- algemeen = stays in info@, no forward
                                   -- (mailbox algemeen@smeba.nl does not exist;
                                   -- operator-confirmed 2026-06-17)
  updated_at = now()
WHERE swarm_type = 'info-routing'
  AND destination_key = 'algemeen'
  AND target_mailbox IS DISTINCT FROM NULL;  -- idempotent: no-op once nulled

COMMIT;
