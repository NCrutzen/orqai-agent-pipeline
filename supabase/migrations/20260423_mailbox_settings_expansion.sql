-- Extend debtor.labeling_settings into a per-mailbox config hub.
--
-- Adds entity + icontroller_company (replaces hardcoded constants in the
-- ingest route) + 3 independent kill-switches:
--   ingest_enabled       -- gate Zapier webhook per mailbox
--   auto_label_enabled   -- gate whitelist auto-action (dry_run is only
--                           for the LABELER's dry-run semantics, not this
--                           classifier auto-label flow)
--   triage_shadow_mode   -- fire debtor/email.received when classifier
--                           returns 'unknown' (shadow-mode for new swarm)
--
-- Fixes TLDs for the BE mailboxes (sicli-noord/sicli-sud/smeba-fire):
-- previous seed had `.nl`, actual Zaps/mailboxes are `.be`.

-- Schema drift from prior seeds: remove stale .nl rows for BE entities.
delete from debtor.labeling_settings
 where source_mailbox in (
   'debiteuren@sicli-noord.nl',
   'debiteuren@sicli-sud.nl',
   'debiteuren@smeba-fire.nl'
 );

alter table debtor.labeling_settings
  add column if not exists entity text
    check (entity in ('smeba', 'berki', 'sicli-noord', 'sicli-sud', 'smeba-fire')),
  add column if not exists icontroller_company text,
  add column if not exists ingest_enabled boolean not null default true,
  add column if not exists auto_label_enabled boolean not null default true,
  add column if not exists triage_shadow_mode boolean not null default false;

-- Update Smeba (already seeded, live Zap) with entity + icontroller_company.
update debtor.labeling_settings
   set entity = 'smeba',
       icontroller_company = 'smebabrandbeveiliging',
       updated_at = now(),
       updated_by = 'migration:20260423_mailbox_settings_expansion'
 where source_mailbox = 'debiteuren@smeba.nl';

-- Berki (NL) — no Zap yet. entity set; icontroller_company TBD (owner fills in).
update debtor.labeling_settings
   set entity = 'berki',
       updated_at = now(),
       updated_by = 'migration:20260423_mailbox_settings_expansion'
 where source_mailbox = 'debiteuren@berki.nl';

-- Seed the 3 BE mailboxes with correct .be TLD. icontroller_company TBD.
insert into debtor.labeling_settings
  (source_mailbox, entity, dry_run, ingest_enabled, auto_label_enabled, triage_shadow_mode, updated_by)
values
  ('debiteuren@sicli-noord.be', 'sicli-noord', true, true, true, false, 'migration:20260423_mailbox_settings_expansion'),
  ('debiteuren@sicli-sud.be',   'sicli-sud',   true, true, true, false, 'migration:20260423_mailbox_settings_expansion'),
  ('debiteuren@smeba-fire.be',  'smeba-fire',  true, true, true, false, 'migration:20260423_mailbox_settings_expansion')
on conflict (source_mailbox) do update
  set entity = excluded.entity,
      updated_at = now(),
      updated_by = excluded.updated_by;

-- Sanity: every row must have an entity after this migration. If any row is
-- missing entity, the ingest route's lookup will fail — surface this early.
do $$
declare
  missing_count int;
begin
  select count(*) into missing_count
    from debtor.labeling_settings
   where entity is null;
  if missing_count > 0 then
    raise warning 'labeling_settings has % row(s) without entity — update manually before enabling triage.', missing_count;
  end if;
end$$;
