-- Phase 56: iController auto-labeling van accounts aan emails
-- D-08: extend classifier_rules.kind CHECK to include 'label_resolver'
-- D-27: additive columns on debtor.email_labels (KEEP existing debtor_id for back-compat)
-- D-31: seed one label_resolver row pointing at extract-invoices.ts
-- D-22: label_dashboard_counts RPC mirroring classifier_queue_counts pattern

-- D-08: Postgres requires drop+add to extend a CHECK constraint
alter table public.classifier_rules drop constraint classifier_rules_kind_check;
alter table public.classifier_rules add constraint classifier_rules_kind_check
  check (kind in ('regex', 'agent_intent', 'label_resolver'));

-- D-06: nxt_database column on labeling_settings
alter table debtor.labeling_settings add column if not exists nxt_database text;

-- D-27: additive columns on email_labels (KEEP existing debtor_id for back-compat)
alter table debtor.email_labels add column if not exists nxt_database text;
alter table debtor.email_labels add column if not exists customer_account_id text;
alter table debtor.email_labels add column if not exists reviewed_by text;
alter table debtor.email_labels add column if not exists reviewed_at timestamptz;
alter table debtor.email_labels add column if not exists screenshot_before_url text;
alter table debtor.email_labels add column if not exists screenshot_after_url text;

create index if not exists email_labels_nxt_db_status_idx
  on debtor.email_labels (nxt_database, status, created_at desc);
create index if not exists email_labels_method_idx
  on debtor.email_labels (method, created_at desc);
create index if not exists email_labels_reviewed_at_idx
  on debtor.email_labels (reviewed_at) where reviewed_at is not null;

-- D-31 step 2: seed one label_resolver rule pointing at extract-invoices.ts
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values (
  'debtor-email-labeling',
  'resolver:invoice_legacy_regex',
  'label_resolver',
  'candidate',
  'Maps to web/lib/automations/debtor-email/extract-invoices.ts INVOICE_PATTERN /\b(17|25|30|32|33)\d{6}\b/g'
)
on conflict (swarm_type, rule_key) do nothing;

-- D-22: label_dashboard_counts RPC (mirror of classifier_queue_counts pattern)
create or replace function public.label_dashboard_counts(p_nxt_database text default null)
returns table (
  nxt_database text,
  source_mailbox text,
  method text,
  status text,
  confidence text,
  total bigint
)
language sql security definer set search_path = public, debtor
as $$
  select
    coalesce(el.nxt_database, '') as nxt_database,
    coalesce(el.source_mailbox, '') as source_mailbox,
    coalesce(el.method, '') as method,
    coalesce(el.status, '') as status,
    coalesce(el.confidence, '') as confidence,
    count(*) as total
  from debtor.email_labels el
  where (p_nxt_database is null or el.nxt_database = p_nxt_database)
    and el.created_at > now() - interval '30 days'
  group by 1, 2, 3, 4, 5;
$$;

grant execute on function public.label_dashboard_counts(text) to service_role;
