-- Debtor fetch-document async callback state.
-- Vercel route inserts a 'pending' row, posts to Zapier, then subscribes to
-- Supabase Realtime for the row's UPDATE. The Zap's final step calls back
-- into /api/automations/debtor/fetch-document/callback, which UPDATEs the
-- row with status='complete' and the hydrated result payload.

create schema if not exists automation;

create table if not exists automation.fetch_requests (
  id uuid primary key,
  status text not null check (status in ('pending', 'complete', 'failed')) default 'pending',
  payload jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  request_ip inet,
  actor text
);

create index if not exists fetch_requests_status_idx
  on automation.fetch_requests (status, created_at desc);

-- Service role only; no client access to this table.
alter table automation.fetch_requests enable row level security;

-- Realtime publication (repo convention: see 20260415_v7_foundation.sql).
-- Note: supabase_realtime publication is in the default (public) DB;
-- adding a table from another schema is supported.
alter publication supabase_realtime add table automation.fetch_requests;
