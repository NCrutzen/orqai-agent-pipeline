-- Phase 56.7. Swarm registry: drives the generic /automations/[swarm]/review
-- surface and the verdict-worker switch. Mirrors the zapier_tools registry
-- pattern (20260429_zapier_tools_registry.sql) and the classifier_rules RLS
-- posture (20260428_classifier_rules.sql).
--
-- Adding a new swarm = INSERT swarms + INSERT swarm_categories. No code
-- change for routing; one-line code change in the verdict-worker IF the new
-- swarm uses action='swarm_dispatch' (then a new Inngest worker listens on
-- the dispatch event).

create table if not exists public.swarms (
  swarm_type    text primary key,
  display_name  text not null,
  description   text,
  review_route  text not null default '/automations/[swarm]/review',
  source_table  text not null default 'automation_runs',
  enabled       boolean not null default true,
  ui_config     jsonb not null default jsonb_build_object(
    'tree_levels', jsonb_build_array('topic','entity','mailbox_id'),
    'row_columns', jsonb_build_array(),
    'drawer_fields', jsonb_build_array(),
    'default_sort', 'created_at desc'
  ),
  side_effects  jsonb,                   -- D-12: reserved for Phase 56.8+
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.swarm_categories (
  swarm_type      text not null,
  category_key    text not null,
  display_label   text not null,
  outlook_label   text,                  -- D-11: nullable
  action          text not null check (action in (
    'categorize_archive','reject','manual_review','swarm_dispatch'
  )),
  swarm_dispatch  text,                  -- D-02: Inngest event name when action='swarm_dispatch'
  display_order   int  not null default 0,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (swarm_type, category_key)
);

create index if not exists swarm_categories_swarm_idx
  on public.swarm_categories (swarm_type) where enabled;

-- updated_at triggers
create or replace function public.swarms_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists swarms_updated_at on public.swarms;
create trigger swarms_updated_at
  before update on public.swarms
  for each row execute function public.swarms_set_updated_at();

create or replace function public.swarm_categories_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists swarm_categories_updated_at on public.swarm_categories;
create trigger swarm_categories_updated_at
  before update on public.swarm_categories
  for each row execute function public.swarm_categories_set_updated_at();

-- RLS (D-04)
alter table public.swarms enable row level security;
alter table public.swarm_categories enable row level security;

drop policy if exists "service_role manages swarms" on public.swarms;
create policy "service_role manages swarms"
  on public.swarms for all to service_role using (true) with check (true);
drop policy if exists "authenticated reads swarms" on public.swarms;
create policy "authenticated reads swarms"
  on public.swarms for select to authenticated using (true);

drop policy if exists "service_role manages swarm_categories" on public.swarm_categories;
create policy "service_role manages swarm_categories"
  on public.swarm_categories for all to service_role using (true) with check (true);
drop policy if exists "authenticated reads swarm_categories" on public.swarm_categories;
create policy "authenticated reads swarm_categories"
  on public.swarm_categories for select to authenticated using (true);

-- Seed (D-05) — debtor-email swarm + 7 categories matching today's
-- OVERRIDE_CATEGORIES (web/app/(dashboard)/automations/debtor-email-review/categories.ts)
-- and CATEGORY_LABEL (web/lib/inngest/functions/classifier-verdict-worker.ts).
-- Includes payment_admittance alias (Q4 recommendation in RESEARCH.md) so the
-- registry lookup is branch-free for both predicted_category values.
insert into public.swarms (swarm_type, display_name, description, review_route, source_table, enabled, ui_config)
values (
  'debtor-email',
  'Debtor Email',
  'Outlook-sourced classifier queue for AR debtor-email triage (Phase 60).',
  '/automations/[swarm]/review',
  'automation_runs',
  true,
  jsonb_build_object(
    'tree_levels',  jsonb_build_array('topic','entity','mailbox_id'),
    'row_columns',  jsonb_build_array(
      jsonb_build_object('key','received_at','label','Received','width',140),
      jsonb_build_object('key','sender',     'label','Sender',  'width',220),
      jsonb_build_object('key','subject',    'label','Subject', 'width',420),
      jsonb_build_object('key','rule',       'label','Rule',    'width',180)
    ),
    'drawer_fields', jsonb_build_array('subject','sender','received_at','rule','predicted_category','body_html'),
    'default_sort',  'created_at desc'
  )
)
on conflict (swarm_type) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  ui_config    = excluded.ui_config,
  updated_at   = now();

-- 7 categories (6 today + payment_admittance alias per Q4). Order matches today's
-- UI dropdown order in detail-pane.tsx; payment_admittance sits adjacent to
-- payment at display_order=15. `unknown` is the label-only-skip path
-- (action='reject' per actions.ts:67-78).
insert into public.swarm_categories (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email','payment',              'Payment',              'Payment Admittance',  'categorize_archive', null, 10),
  ('debtor-email','payment_admittance',   'Payment Admittance',   'Payment Admittance',  'categorize_archive', null, 15),
  ('debtor-email','auto_reply',           'Auto-reply',           'Auto-Reply',          'categorize_archive', null, 20),
  ('debtor-email','ooo_temporary',        'OOO (temporary)',      'OoO — Temporary',     'categorize_archive', null, 30),
  ('debtor-email','ooo_permanent',        'OOO (permanent)',      'OoO — Permanent',     'categorize_archive', null, 40),
  ('debtor-email','invoice_copy_request', 'Invoice copy request', 'Invoice Copy Request','categorize_archive', null, 50),
  ('debtor-email','unknown',              'Skip (label-only)',    null,                  'reject',             null, 60)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- Realtime publication so the future cross-swarm admin UI updates live.
-- Optional but matches classifier_rules pattern (20260428_classifier_rules.sql).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='swarms'
  ) then
    alter publication supabase_realtime add table public.swarms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='swarm_categories'
  ) then
    alter publication supabase_realtime add table public.swarm_categories;
  end if;
end$$;
