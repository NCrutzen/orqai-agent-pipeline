-- info-routing mailbox registry — per-mailbox enablement + entity resolution.
--
-- Mirror of debtor.labeling_settings but lean: info-routing doesn't use
-- iController, NXT, brand_id, triage_shadow_mode, or auto_label_enabled.
-- Adding a new info@<brand> mailbox = one INSERT, no code/deploy.
--
-- The ingest route reads this table to:
--   1. Reject unknown mailboxes (400 unknown_mailbox)
--   2. Honor per-mailbox ingest_enabled flag (200 skipped_disabled)
--   3. Set the row's `entity` column from this table (vs. hardcoded "smeba")
--
-- Seed: 6 known smeba-family brands. info@smeba.nl is launching TODAY
-- (ingest_enabled=true). The other 5 are pre-staged with ingest_enabled=false
-- so adding them to production = one UPDATE per mailbox, no migration.
--
-- Deliberately out of scope: walker-fire, apexfire — onboard them after the
-- corporate decision lands, not pre-staged.
--
-- RLS: backend-only table (service_role writes, authenticated reads for the
-- mailbox-filter UI). Matches the RLS posture from `_template.sql`.

BEGIN;

-- 1. Table.
create table if not exists public.info_routing_mailbox_settings (
  source_mailbox   text        primary key,
  entity           text        not null,
  ingest_enabled   boolean     not null default true,
  -- Safety gate. When true, the route still ingests (Stage 0/1 run, verdicts
  -- record) but no side-effects fire downstream. Mirrors debtor.labeling_settings.dry_run.
  dry_run          boolean     not null default true,
  updated_at       timestamptz not null default now(),
  updated_by       text
);

-- 2. RLS — required on any new table per CLAUDE.md (rls_disabled_in_public).
alter table public.info_routing_mailbox_settings enable row level security;

create policy info_routing_mailbox_settings_service_all
  on public.info_routing_mailbox_settings
  for all to service_role
  using (true) with check (true);

create policy info_routing_mailbox_settings_authenticated_read
  on public.info_routing_mailbox_settings
  for select to authenticated
  using (true);

-- 3. updated_at trigger (matches swarms.swarms_set_updated_at pattern).
create or replace function public.info_routing_mailbox_settings_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists info_routing_mailbox_settings_updated_at
  on public.info_routing_mailbox_settings;
create trigger info_routing_mailbox_settings_updated_at
  before update on public.info_routing_mailbox_settings
  for each row execute function public.info_routing_mailbox_settings_set_updated_at();

-- 4. Seed — 6 smeba-family brands. Only smeba is launched today; rest are
--    pre-staged disabled. To go live: UPDATE … SET ingest_enabled=true.
insert into public.info_routing_mailbox_settings
  (source_mailbox, entity, ingest_enabled, dry_run, updated_by)
values
  ('info@smeba.nl',         'smeba',        true,  false, 'migration:20260521_info_routing_mailbox_settings'),
  ('info@smeba-fire.be',    'smeba-fire',   false, true,  'migration:20260521_info_routing_mailbox_settings'),
  ('info@berki.nl',         'berki',        false, true,  'migration:20260521_info_routing_mailbox_settings'),
  ('info@sicli-noord.be',   'sicli-noord',  false, true,  'migration:20260521_info_routing_mailbox_settings'),
  ('info@sicli-sud.be',     'sicli-sud',    false, true,  'migration:20260521_info_routing_mailbox_settings'),
  ('info@fire-control.nl',  'fire-control', false, true,  'migration:20260521_info_routing_mailbox_settings')
on conflict (source_mailbox) do update set
  entity         = excluded.entity,
  ingest_enabled = excluded.ingest_enabled,
  dry_run        = excluded.dry_run,
  updated_by     = excluded.updated_by,
  updated_at     = now();

-- 5. Widen swarms.entity_brand for info-routing to include all 6 brands.
--    Stays in alphabetical order for stable codegen diff.
update public.swarms
   set entity_brand = jsonb_build_array(
         'berki','fire-control','sicli-noord','sicli-sud','smeba','smeba-fire'
       )
 where swarm_type = 'info-routing';

COMMIT;
