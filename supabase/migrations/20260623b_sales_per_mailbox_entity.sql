-- Sales per-mailbox entity tag. Follow-up to 20260623_sales_multi_brand_scope.
--
-- DATA migration ONLY. No DDL/RLS. Rewrites two jsonb values on the existing
-- public.swarms 'sales-email' row.
--
-- WHY: the Stage 3 coordinator wrote entity='smeba' for EVERY sales mail
-- (debtor-email-coordinator.ts: `email.entity ?? "smeba"`, and sales ingest
-- writes entity=null). Live check showed Fire-Control / Berki / Inprevo mail all
-- tagged "smeba" in the operator queue. This adds a per-mailbox entity map the
-- coordinator reads as the fallback (still entity-null for debtor → unchanged).
--
--   * entity_brand: expand from ['smeba'] to the brands the sales mailboxes
--     serve, so `npm run codegen` emits 'inprevo' into the Entity union (smeba
--     kept first → stage-2 firstBrand[0] unchanged). Inprevo (IN) is a Berki
--     sub-brand; it gets its own entity tag per operator request.
--   * resolution_config.scope.entity_by_mailbox: the mailbox→entity map.
--
-- IDEMPOTENT: jsonb_set rebuilds from the existing config; re-running is a no-op.

BEGIN;

UPDATE public.swarms
   SET entity_brand = jsonb_build_array('smeba', 'berki', 'fire-control', 'inprevo'),
       resolution_config =
         jsonb_set(
           resolution_config,
           '{scope,entity_by_mailbox}',
           jsonb_build_object(
             'verkoop@smeba.nl',        'smeba',
             'verkoop@fire-control.nl', 'fire-control',
             'verkoop@berki.nl',        'berki',
             'sales.products@berki.nl', 'inprevo'
           ),
           true
         ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
