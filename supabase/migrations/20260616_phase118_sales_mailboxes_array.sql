-- Phase 118 — multi-mailbox behavior-sync (step 1, code enabler).
--
-- DATA migration ONLY. NO DDL: no CREATE TABLE, no ALTER, no ENABLE ROW LEVEL
-- SECURITY, no CREATE POLICY. The public.swarms row + its RLS already exist from
-- 20260604_swarm_behavior_tracking.sql; this migration only rewrites one jsonb
-- value on the already-enabled sales-email row.
--
-- WHY: live-validate the new behavior_tracking_config.mailboxes[] read-path on the
-- already-enabled sales swarm BEFORE debtor enablement. The worker now prefers
-- cfg.mailboxes and falls back to the singular cfg.mailbox for any un-migrated row,
-- so dropping the singular key on THIS row is safe — the code fallback still
-- protects every other row.
--
-- IDEMPOTENT: the value is rebuilt FROM the existing config (so a future weights
-- key is not clobbered), the singular `mailbox` key is removed via the jsonb
-- minus-key operator (a no-op once already gone), and jsonb_set re-sets the same
-- enabled=true literal + mailboxes:['verkoop@smeba.nl'] array. Re-running yields
-- identical jsonb.
--
-- NOTE: this migration is WRITTEN here but APPLIED in the [BLOCKING] operator
-- checkpoint (Plan Task 3) — check:supabase + the live remote apply run there. Do
-- NOT apply it from the executor. Debtor's own multi-mailbox enablement is step 2
-- (a separate, post-merge operator-gated change) — OUT OF SCOPE for Phase 118.

BEGIN;

UPDATE public.swarms
   SET behavior_tracking_config =
         jsonb_set(
           jsonb_set(
             (behavior_tracking_config - 'mailbox'),
             '{enabled}',
             'true'::jsonb,
             true
           ),
           '{mailboxes}',
           jsonb_build_array('verkoop@smeba.nl'),
           true
         ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
