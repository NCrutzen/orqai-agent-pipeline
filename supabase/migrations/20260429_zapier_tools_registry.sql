-- Phase 56-01b. Zapier-tool registry.
--
-- Replaces the per-Zap env-var pattern. Each Zapier-bound tool (sync lookup,
-- async fetch, etc.) is one row with target_url + auth handling metadata.
-- Adding a new automation = INSERT one row. No Vercel env-var change.
-- No code change. No deploy.
--
-- Auth secrets stay in env vars (referenced by name). The registry holds the
-- env-var NAME, not the secret value. Multiple tools sharing one backend
-- typically share one secret env var (e.g. all NXT tools use
-- DEBTOR_FETCH_WEBHOOK_SECRET).
--
-- Future (out of scope this phase): a generic /api/zapier-tools/[tool_id]
-- bridge route that reads this table, validates input_schema, forwards to
-- target_url, returns. Phase 56 keeps the resolver-direct call but reads the
-- URL from this table instead of an env var. Bridge route becomes a follow-up.

create table if not exists public.zapier_tools (
  tool_id          text primary key,
  description      text,
  backend          text not null,                                                   -- 'nxt' | 'icontroller' | 'crm' | future
  pattern          text not null check (pattern in ('sync', 'async_callback')),
  target_url       text not null,                                                   -- the catch-hook URL
  auth_method      text not null default 'body_field' check (auth_method in ('body_field', 'header_bearer')),
  auth_secret_env  text not null,                                                   -- name of env var holding secret (NOT the value)
  auth_field_name  text not null default 'auth',                                    -- when auth_method='body_field', which field; when 'header_bearer', use 'Authorization'
  input_schema     jsonb,                                                           -- self-documenting; consumable by Orq.ai agents
  output_schema    jsonb,
  callback_route   text,                                                            -- for async_callback: where Zapier calls back into Vercel
  enabled          boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists zapier_tools_backend_idx on public.zapier_tools (backend) where enabled;
create index if not exists zapier_tools_pattern_idx on public.zapier_tools (pattern) where enabled;

alter table public.zapier_tools enable row level security;

drop policy if exists "service_role manages zapier_tools" on public.zapier_tools;
create policy "service_role manages zapier_tools"
  on public.zapier_tools
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "authenticated reads zapier_tools" on public.zapier_tools;
create policy "authenticated reads zapier_tools"
  on public.zapier_tools
  for select
  to authenticated
  using (true);

-- updated_at trigger (optional; if a generic one exists in this DB use it; else inline)
create or replace function public.zapier_tools_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists zapier_tools_updated_at on public.zapier_tools;
create trigger zapier_tools_updated_at
  before update on public.zapier_tools
  for each row execute function public.zapier_tools_set_updated_at();

-- Seed: three tools backing the new NXT generic-lookup Zap.
-- All three point at the same Zapier catch-hook URL; the lookup_kind body
-- field discriminates them inside the Zap. They share auth via
-- DEBTOR_FETCH_WEBHOOK_SECRET (the existing shared NXT-Zap secret).
insert into public.zapier_tools
  (tool_id, description, backend, pattern, target_url, auth_method, auth_secret_env, auth_field_name, input_schema, output_schema, enabled, notes)
values
  (
    'nxt.contact_lookup',
    'Resolve a sender email to the top-level NXT customer via contact_person + customer.parent_id chain.',
    'nxt',
    'sync',
    'https://hooks.zapier.com/hooks/catch/15380147/uv5ju6h/',
    'body_field',
    'DEBTOR_FETCH_WEBHOOK_SECRET',
    'auth',
    jsonb_build_object(
      'type', 'object',
      'required', array['nxt_database', 'sender_email'],
      'properties', jsonb_build_object(
        'nxt_database', jsonb_build_object('type', 'string', 'enum', array['nxt_benelux_prod','nxt_ireland_prod','nxt_uk_prod']),
        'sender_email', jsonb_build_object('type', 'string', 'format', 'email')
      )
    ),
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'matches', jsonb_build_object(
          'type', 'array',
          'items', jsonb_build_object(
            'type', 'object',
            'properties', jsonb_build_object(
              'contact_id', jsonb_build_object('type','string'),
              'top_level_customer_id', jsonb_build_object('type','string'),
              'top_level_customer_name', jsonb_build_object('type','string'),
              'brand_id', jsonb_build_object('type','string'),
              'status', jsonb_build_object('type','string'),
              'firstname', jsonb_build_object('type',array['string','null']),
              'lastname', jsonb_build_object('type',array['string','null']),
              'type', jsonb_build_object('type',array['string','null']),
              'job_title', jsonb_build_object('type',array['string','null']),
              'depth', jsonb_build_object('type','integer')
            )
          )
        )
      )
    ),
    true,
    'Sends lookup_kind=sender_to_account in body.'
  ),
  (
    'nxt.identifier_lookup',
    'Resolve invoice-number identifiers parsed from an email body to the paying customer.',
    'nxt',
    'sync',
    'https://hooks.zapier.com/hooks/catch/15380147/uv5ju6h/',
    'body_field',
    'DEBTOR_FETCH_WEBHOOK_SECRET',
    'auth',
    jsonb_build_object(
      'type', 'object',
      'required', array['nxt_database', 'invoice_numbers'],
      'properties', jsonb_build_object(
        'nxt_database', jsonb_build_object('type','string','enum',array['nxt_benelux_prod','nxt_ireland_prod','nxt_uk_prod']),
        'invoice_numbers', jsonb_build_object('type','array','items', jsonb_build_object('type','string'))
      )
    ),
    jsonb_build_object(
      'type','object',
      'properties', jsonb_build_object(
        'matches', jsonb_build_object('type','array','items', jsonb_build_object(
          'type','object','properties', jsonb_build_object(
            'invoice_id', jsonb_build_object('type','string'),
            'invoice_number', jsonb_build_object('type','string'),
            'customer_id', jsonb_build_object('type','string'),
            'top_level_customer_id', jsonb_build_object('type','string'),
            'site_id', jsonb_build_object('type',array['string','null']),
            'job_id', jsonb_build_object('type',array['string','null']),
            'invoice_date', jsonb_build_object('type','string'),
            'status', jsonb_build_object('type','string')
          )
        ))
      )
    ),
    true,
    'Sends lookup_kind=identifier_to_account in body. paying_customer_id renamed to top_level_customer_id in SELECT.'
  ),
  (
    'nxt.candidate_details',
    'Fetch full customer details for ambiguous-candidate disambiguation (LLM tiebreaker context).',
    'nxt',
    'sync',
    'https://hooks.zapier.com/hooks/catch/15380147/uv5ju6h/',
    'body_field',
    'DEBTOR_FETCH_WEBHOOK_SECRET',
    'auth',
    jsonb_build_object(
      'type','object',
      'required', array['nxt_database','customer_ids'],
      'properties', jsonb_build_object(
        'nxt_database', jsonb_build_object('type','string','enum',array['nxt_benelux_prod','nxt_ireland_prod','nxt_uk_prod']),
        'customer_ids', jsonb_build_object('type','array','items', jsonb_build_object('type','string'))
      )
    ),
    jsonb_build_object(
      'type','object',
      'properties', jsonb_build_object(
        'matches', jsonb_build_object('type','array','items', jsonb_build_object(
          'type','object','properties', jsonb_build_object(
            'id', jsonb_build_object('type','string'),
            'name', jsonb_build_object('type','string'),
            'status', jsonb_build_object('type','string'),
            'brand_id', jsonb_build_object('type','string'),
            'country_id', jsonb_build_object('type','string'),
            'city', jsonb_build_object('type',array['string','null']),
            'classification', jsonb_build_object('type',array['string','null']),
            'email', jsonb_build_object('type',array['string','null']),
            'modified_on', jsonb_build_object('type','string')
          )
        ))
      )
    ),
    true,
    'Sends lookup_kind=candidate_details in body. Used only when contact-lookup returns 2+ candidates.'
  )
on conflict (tool_id) do update set
  target_url      = excluded.target_url,
  auth_method     = excluded.auth_method,
  auth_secret_env = excluded.auth_secret_env,
  auth_field_name = excluded.auth_field_name,
  input_schema    = excluded.input_schema,
  output_schema   = excluded.output_schema,
  description     = excluded.description,
  notes           = excluded.notes,
  updated_at      = now();

-- Existing async-callback Zap (invoice-fetch). Cataloged here so the
-- registry is the canonical inventory of all Zapier-bound tools — even
-- though the live route still reads URL/secret from env vars. Phase 56.5
-- migrates the route to consume this row directly.
insert into public.zapier_tools (
  tool_id, description, backend, pattern, target_url,
  auth_method, auth_secret_env, auth_field_name,
  callback_route, enabled, notes,
  input_schema, output_schema
) values (
  'nxt.invoice_fetch',
  'Async-fetch a copy of an invoice PDF from NXT. Zap looks up the invoice via NXT SQL, downloads the PDF from S3, then POSTs back to callback_route with the signed URL.',
  'nxt',
  'async_callback',
  'https://hooks.zapier.com/hooks/catch/15380147/ujxgvtf/',
  'body_field',
  'DEBTOR_FETCH_WEBHOOK_SECRET',
  'secret',
  '/api/automations/debtor/fetch-document/callback',
  true,
  'Live via web/app/api/automations/debtor/fetch-document/route.ts. Body envelope: {docType, reference, entity, requestId, callback_url, secret}. Phase 56.5 migrates this route to consume the registry directly via the generic /api/zapier-tools/[tool_id] bridge.',
  jsonb_build_object(
    'type','object',
    'required', array['docType','reference','entity','requestId','callback_url'],
    'properties', jsonb_build_object(
      'docType',     jsonb_build_object('type','string','enum',array['invoice']),
      'reference',   jsonb_build_object('type','string','description','invoice_number'),
      'entity',      jsonb_build_object('type','string','description','smeba|smeba-fire|sicli-noord|sicli-sud|berki'),
      'requestId',   jsonb_build_object('type','string','format','uuid'),
      'callback_url',jsonb_build_object('type','string','format','uri')
    )
  ),
  jsonb_build_object(
    'type','object',
    'description','Async — Zap acks 200 immediately; the actual response arrives via POST to callback_url with this shape.',
    'properties', jsonb_build_object(
      'request_id', jsonb_build_object('type','string'),
      'pdf_url',    jsonb_build_object('type',array['string','null']),
      'status',     jsonb_build_object('type','string','enum',array['fetched','not_found','upstream_error']),
      'reason',     jsonb_build_object('type',array['string','null'])
    )
  )
)
on conflict (tool_id) do update set
  target_url      = excluded.target_url,
  auth_method     = excluded.auth_method,
  auth_secret_env = excluded.auth_secret_env,
  auth_field_name = excluded.auth_field_name,
  callback_route  = excluded.callback_route,
  input_schema    = excluded.input_schema,
  output_schema   = excluded.output_schema,
  description     = excluded.description,
  notes           = excluded.notes,
  updated_at      = now();
