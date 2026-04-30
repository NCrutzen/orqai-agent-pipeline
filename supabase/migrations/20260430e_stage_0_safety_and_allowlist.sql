-- Phase 64. D-05/D-06/D-07: add allowed_for_intents text[] column to public.zapier_tools.
--
-- D-05: stored as a text[] array column on the existing registry table — NOT
--       a junction table. One source of truth, lightest read path, matches
--       the registry-as-data pattern from 20260429_zapier_tools_registry.sql.
-- D-06: default-deny semantics. NULL or empty array means NO intent can
--       invoke the tool. Enforcement lives in
--       web/lib/automations/debtor-email/nxt-zap-client.ts (Plan 03).
-- D-07: intent identifiers are swarm_categories.key values (no parallel
--       swarm_intents registry in this phase).
--
-- Additive migration only. No drop, no delete, no RLS change (existing
-- service-role policy from 20260429 covers the new column). Re-runnable.

alter table public.zapier_tools
  add column if not exists allowed_for_intents text[];

comment on column public.zapier_tools.allowed_for_intents is
  'Phase 64 D-06: default-deny intent allowlist. NULL or [] means no intent can invoke. Intent identifiers are swarm_categories.key values.';

-- Backfill — existing tools must be EXPLICITLY wired to current intents.
-- Per D-07 the intent identifier = swarm_categories.key.
-- The three NXT lookup tools (sender/identifier/candidate) are consumed by
-- both the unknown-bucket intent agent and the invoice-copy handler.
update public.zapier_tools
   set allowed_for_intents = array['unknown', 'invoice_copy_request']
 where tool_id in ('nxt.contact_lookup', 'nxt.identifier_lookup', 'nxt.candidate_details');

-- nxt.invoice_fetch is invoice-copy-only.
update public.zapier_tools
   set allowed_for_intents = array['invoice_copy_request']
 where tool_id = 'nxt.invoice_fetch';
