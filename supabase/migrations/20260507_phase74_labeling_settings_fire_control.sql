-- Phase 74 follow-up — two changes in one migration:
--
-- 1. INSERT missing debtor.labeling_settings row for administratie@fire-control.nl
--    (Phase 74 added the mailbox to the TS ICONTROLLER_MAILBOXES lookup but
--    never seeded the DB row, so ingest returned `unknown_mailbox`).
--
-- 2. UPDATE existing rows to fill icontroller_company on all 5 brands so the
--    iController-tag side-effect gate (classifier-label-resolver.ts:147)
--    fires for every brand, not just smeba. The field is a presence-gate —
--    any non-null string flips it. We use the brand-code slug to match
--    swarms.entity_brand[].icontroller_company. smeba's existing legacy value
--    'smebabrandbeveiliging' is left intact (downstream code may string-match
--    on it; flipping the gate doesn't require changing it).
insert into debtor.labeling_settings (
  source_mailbox,
  entity,
  icontroller_company,
  ingest_enabled,
  auto_label_enabled,
  triage_shadow_mode,
  dry_run,
  nxt_database,
  brand_id,
  updated_by
) values (
  'administratie@fire-control.nl',
  'fire-control',
  'fire-control',
  true,
  false,
  true,
  true,
  'nxt_benelux_prod',
  'FI',
  'migration:20260507_phase74_labeling_settings_fire_control'
)
on conflict (source_mailbox) do nothing;

update debtor.labeling_settings
   set icontroller_company = 'smeba-fire',
       updated_at = now(),
       updated_by = 'migration:20260507_phase74_labeling_settings_fire_control'
 where source_mailbox = 'debiteuren@smeba-fire.be'
   and icontroller_company is null;

update debtor.labeling_settings
   set icontroller_company = 'berki',
       updated_at = now(),
       updated_by = 'migration:20260507_phase74_labeling_settings_fire_control'
 where source_mailbox = 'debiteuren@berki.nl'
   and icontroller_company is null;

update debtor.labeling_settings
   set icontroller_company = 'sicli-noord',
       updated_at = now(),
       updated_by = 'migration:20260507_phase74_labeling_settings_fire_control'
 where source_mailbox = 'debiteuren@sicli-noord.be'
   and icontroller_company is null;

update debtor.labeling_settings
   set icontroller_company = 'sicli-sud',
       updated_at = now(),
       updated_by = 'migration:20260507_phase74_labeling_settings_fire_control'
 where source_mailbox = 'debiteuren@sicli-sud.be'
   and icontroller_company is null;
