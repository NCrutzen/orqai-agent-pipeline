-- Sales multi-brand onboarding — verkoop@fire-control.nl, verkoop@berki.nl,
-- sales.products@berki.nl alongside the existing verkoop@smeba.nl.
--
-- DATA migration ONLY. No DDL, no RLS changes — rewrites two jsonb values on the
-- already-existing public.swarms 'sales-email' row.
--
-- WHY: the sales swarm was brand-locked to smeba (entity_brand=['smeba'],
-- resolution_config.scope.brand_scope=['SB'], no per-mailbox map). The three new
-- sales mailboxes are different brands. This migration:
--   (1) adds resolution_config.scope.brand_scope_by_mailbox so Stage 2 resolves
--       each mailbox against the correct NXT brand (FI / BB / IN), mirroring the
--       debtor pattern. Stage 2 stays DRY (dry_run_config.stage_2_resolution=true)
--       so this changes NO live behavior today — it makes the registry correct
--       BEFORE resolution is ever flipped live.
--   (2) enables behavior tracking on the three new mailboxes (the Zaps are live).
--
-- Brand codes verified live against debtor.labeling_settings (2026-06-23):
--   berki = BB, fire-control = FI; sales.products@berki.nl = IN (operator-confirmed,
--   the second scope code on debtor's debiteuren@berki.nl → ['BB','IN']).
--
-- IDEMPOTENT: jsonb_set rebuilds from the existing config; re-running yields
-- identical jsonb. brand_scope (default ['SB']) is left intact as the fallback
-- for any unmapped mailbox.

BEGIN;

UPDATE public.swarms
   SET resolution_config =
         jsonb_set(
           resolution_config,
           '{scope,brand_scope_by_mailbox}',
           jsonb_build_object(
             'verkoop@smeba.nl',        jsonb_build_array('SB'),
             'verkoop@fire-control.nl', jsonb_build_array('FI'),
             'verkoop@berki.nl',        jsonb_build_array('BB'),
             'sales.products@berki.nl', jsonb_build_array('IN')
           ),
           true
         ),
       behavior_tracking_config =
         jsonb_set(
           behavior_tracking_config,
           '{mailboxes}',
           jsonb_build_array(
             'verkoop@smeba.nl',
             'verkoop@fire-control.nl',
             'verkoop@berki.nl',
             'sales.products@berki.nl'
           ),
           true
         ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
