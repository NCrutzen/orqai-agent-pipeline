-- Phase 90 (P0 resolver substrate) — RESL-01 transport registration + RESL-16 config-drift fix.
--
-- Two changes:
--   1. Register ONE zapier_tools row for nxt.resolve_candidates — the single
--      transport for the per-email read of zapier.dbo.resolve_candidates (the
--      materialized indexed resolver, RESL-01/02). Mirrors the 3 existing NXT
--      tool rows (20260429_zapier_tools_registry.sql:73-117) + on-conflict-do-update.
--      Reuses DEBTOR_FETCH_WEBHOOK_SECRET (auth) and the existing nxt-lookup
--      callback route. target_url is a PLACEHOLDER until the operator builds the
--      resolver-read Zap and UPDATEs the row with its catch-hook URL (Assumption
--      A3 / runbook step 4; threat T-90-06: the placeholder fails closed — no
--      mis-routed lookup can fire until the real URL lands).
--
--   2. RESL-16 config-drift remediation. The 3 legacy NXT tool rows hard-code
--      input_schema.nxt_database enum = ['nxt_benelux_prod','nxt_ireland_prod',
--      'nxt_uk_prod'] (20260429:89,132,169). The consolidated nxt model
--      (NXT-ADDENDUM) forbids per-region DB names — the resolver scopes by
--      environment_id='BX' via proc params, not a per-region database. Replace the
--      stale per-region nxt_database enum with an environment_id field on each
--      legacy row's input_schema. (zapier_tools.input_schema is self-documenting
--      metadata, not an Orq.ai json_schema, so the anyOf-nullable CLAUDE.md rule
--      does not bind here — match the existing input_schema JSON style.)
--
-- RLS: no change — the existing service-role policy from 20260429 covers writes.

BEGIN;

-- ── 1. Register nxt.resolve_candidates (one row) ───────────────────────────
INSERT INTO public.zapier_tools (
  tool_id, description, backend, pattern, target_url,
  auth_method, auth_secret_env, auth_field_name,
  callback_route, allowed_for_intents, enabled, notes,
  input_schema, output_schema
) VALUES (
  'nxt.resolve_candidates',
  'Per-email entity-resolution read over the materialized zapier.dbo.resolve_candidates index (RESL-01/02). Returns the whole brand-scoped candidate set + is_unique_in_scope in one indexed call; env=BX hard filter, brand as tiebreaker. The TS engine still owns precedence/gates (the proc returns candidates, not a verdict).',
  'nxt',
  'async_callback',
  'PENDING_OPERATOR_ZAP_URL',                                  -- A3: operator UPDATEs after building the resolver-read Zap (runbook step 4). Fails closed until then (T-90-06).
  'body_field',
  'DEBTOR_FETCH_WEBHOOK_SECRET',                               -- REUSE the shared NXT-Zap secret.
  'auth',
  '/api/automations/debtor/nxt-lookup/callback',              -- REUSE the existing nxt-lookup callback route.
  array['unknown','invoice_copy_request'],                    -- same allowance as the 3 sibling NXT lookup tools (Phase 64 D-06).
  true,
  'Phase 90 RESL-01. Sends {identifiers, environment_id, brand_scope} in body. target_url is a placeholder until the operator lands the resolver-read catch-hook URL — fails closed (T-90-06). Scopes by environment_id (NOT a per-region nxt_database — RESL-16).',
  jsonb_build_object(
    'type','object',
    'required', array['identifiers','environment_id'],
    'properties', jsonb_build_object(
      'identifiers', jsonb_build_object(
        'type','array',
        'description','Extracted identifiers to resolve, each {kind, value_norm}.',
        'items', jsonb_build_object(
          'type','object',
          'properties', jsonb_build_object(
            'kind',       jsonb_build_object('type','string','description','invoice_no | customer_no | site_no | email_domain | email_address'),
            'value_norm', jsonb_build_object('type','string')
          )
        )
      ),
      'environment_id', jsonb_build_object('type','string','enum', array['BX'], 'description','HARD region scope (RESL-06). Debtor swarm is entirely BX.'),
      'brand_scope',    jsonb_build_object('type','array','items', jsonb_build_object('type','string'),'description','Allowed brands for the tiebreaker (e.g. [BB,IN] for Berki). Tiebreaker only — NEVER a hard pre-filter.')
    )
  ),
  jsonb_build_object(
    'type','object',
    'description','Async — Zap acks 200; the candidate set arrives via POST to the callback route.',
    'properties', jsonb_build_object(
      'candidates', jsonb_build_object(
        'type','array',
        'items', jsonb_build_object(
          'type','object',
          'properties', jsonb_build_object(
            'identifier_kind',       jsonb_build_object('type','string'),
            'identifier_value_norm', jsonb_build_object('type','string'),
            'party_id',              jsonb_build_object('type','string','description','composite customer.id e.g. BX594313 — the LOCKED customer_account_id'),
            'party_name',            jsonb_build_object('type','string'),
            'brand_id',              jsonb_build_object('type','string'),
            'parent_party_id',       jsonb_build_object('type',array['string','null']),
            'is_unique_in_scope',    jsonb_build_object('type','boolean'),
            'precedence',            jsonb_build_object('type','integer'),
            'status',                jsonb_build_object('type','string')
          )
        )
      )
    )
  )
)
ON CONFLICT (tool_id) DO UPDATE SET
  description         = excluded.description,
  backend             = excluded.backend,
  pattern             = excluded.pattern,
  auth_method         = excluded.auth_method,
  auth_secret_env     = excluded.auth_secret_env,
  auth_field_name     = excluded.auth_field_name,
  callback_route      = excluded.callback_route,
  allowed_for_intents = excluded.allowed_for_intents,
  input_schema        = excluded.input_schema,
  output_schema       = excluded.output_schema,
  notes               = excluded.notes,
  updated_at          = now();
  -- NB: target_url is deliberately NOT overwritten on conflict — once the
  -- operator sets the real resolver Zap URL, a re-apply must not clobber it
  -- back to the placeholder.

-- ── 2. RESL-16: migrate the 3 legacy NXT rows off the per-region nxt_database enum ──
-- The consolidated nxt model (NXT-ADDENDUM) forbids per-region DB names; the
-- resolver scopes by environment_id='BX'. Replace input_schema.nxt_database
-- (enum ['nxt_benelux_prod','nxt_ireland_prod','nxt_uk_prod']) with an
-- environment_id field (enum ['BX']) on each legacy row, preserving the rest of
-- each input_schema. jsonb #- removes the stale path; || merges the new field.
UPDATE public.zapier_tools
   SET input_schema =
         (input_schema #- '{required}')
         || jsonb_build_object(
              -- environment_id replaces nxt_database in required
              'required',
              (
                SELECT coalesce(
                  jsonb_agg(CASE WHEN elem = '"nxt_database"'::jsonb THEN '"environment_id"'::jsonb ELSE elem END),
                  '[]'::jsonb
                )
                FROM jsonb_array_elements(input_schema->'required') AS elem
              )
            )
         || jsonb_build_object(
              'properties',
              ((input_schema->'properties') - 'nxt_database')
              || jsonb_build_object(
                   'environment_id',
                   jsonb_build_object(
                     'type','string',
                     'enum', jsonb_build_array('BX'),
                     'description','HARD region scope (RESL-16: replaces the forbidden per-region nxt_database enum). Debtor swarm is entirely BX.'
                   )
                 )
            ),
       notes = coalesce(notes,'') || ' [RESL-16: per-region nxt_database enum replaced by environment_id=BX.]',
       updated_at = now()
 WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup','nxt.candidate_details')
   AND input_schema->'properties' ? 'nxt_database';

COMMIT;
