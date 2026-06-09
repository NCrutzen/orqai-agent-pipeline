-- Phase 113 Plan 05 (D-08 / D-09). Add the per-stage Stage-3 ROUTING gate key.
--
-- A dedicated swarm-agnostic `stage_3_routing` flag inside swarms.dry_run_config
-- governs whether the SHARED Stage 3 coordinator emits `<swarm>/predicted`
-- (→ the Stage 3.5 dispatcher → Kanban routing). When GATED the verdict is still
-- persisted (coordinator_runs + pipeline_events — visible in Bulk Review for
-- D-08 dry-run observation), but the predicted-emit is WITHHELD so the
-- dispatcher never fires. Flipping this key to false (OPEN) after the operator
-- green-light re-enables routing — reversible by re-gating (D-09).
--
-- WHY A NEW KEY, NOT stage_3_labeling (debtor-neutrality — T-113-10):
--   stage_3_labeling = the downstream Stage-2/3 iController labeling write
--                      (debtor: GATED today, matches labeling_settings.dry_run).
--   stage_3_routing  = the predicted-EMIT that drives dispatch/routing
--                      (debtor: LIVE today — debtor's coordinator emits
--                      `debtor-email/predicted` every run).
--   These are DIFFERENT side effects. Reusing stage_3_labeling for the routing
--   gate would make the coordinator START holding debtor's predicted emit
--   (stage_3_labeling=true for debtor) — a silent regression of live debtor
--   routing. So this is a distinct key, seeded:
--     debtor-email: stage_3_routing = false  → OPEN. Re-encodes today's live
--                   predicted-emit EXACTLY (no behavior change).
--     sales-email:  stage_3_routing = true   → GATED. Dry-run observation
--                   first; flipped to false on the operator go-live green-light.
--
-- Convention (matches the rest of dry_run_config): TRUE = gated/held,
-- FALSE = open/live, MISSING = fail-closed (gated) by the helper.
--
-- Only ALTERs values on an existing RLS-enabled table (public.swarms) via a
-- jsonb merge (`||`) that preserves the existing per-stage flags. No new table,
-- no new policy, no anon grant. Idempotent (re-running re-sets the same keys).

BEGIN;

-- debtor-email: OPEN (false) — preserve the live predicted-emit byte-for-byte.
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_3_routing', false),
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

-- sales-email: GATED (true) — Stage-3 routing held for dry-run observation
-- until the operator go-live green-light flips it to false.
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_3_routing', true),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
