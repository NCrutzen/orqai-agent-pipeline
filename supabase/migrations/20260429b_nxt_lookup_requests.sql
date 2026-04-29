-- Phase 56-02: NXT generic-lookup async-callback state.
-- Vercel inserts a 'pending' row, POSTs the Zap with requestId+callback_url+secret,
-- subscribes to Realtime UPDATE on this row. The Zap's terminal POST step calls
-- /api/automations/debtor/nxt-lookup/callback which UPDATEs status='complete'
-- with the SQL `matches` array as the result.
--
-- Mirrors debtor.fetch_requests (production schema for invoice-fetch).

create schema if not exists debtor;

create table if not exists debtor.nxt_lookup_requests (
  id uuid primary key,
  tool_id text not null check (tool_id in (
    'nxt.contact_lookup',
    'nxt.identifier_lookup',
    'nxt.candidate_details'
  )),
  lookup_kind text not null check (lookup_kind in (
    'sender_to_account',
    'identifier_to_account',
    'candidate_details'
  )),
  nxt_database text not null check (nxt_database in (
    'nxt_benelux_prod',
    'nxt_ireland_prod',
    'nxt_uk_prod'
  )),
  payload jsonb not null,
  status text not null check (status in ('pending', 'complete', 'failed')) default 'pending',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists nxt_lookup_requests_status_idx
  on debtor.nxt_lookup_requests (status, created_at desc);

create index if not exists nxt_lookup_requests_tool_idx
  on debtor.nxt_lookup_requests (tool_id, created_at desc);

alter table debtor.nxt_lookup_requests enable row level security;

-- Service role only (no policies) — same convention as debtor.fetch_requests.

alter publication supabase_realtime add table debtor.nxt_lookup_requests;
