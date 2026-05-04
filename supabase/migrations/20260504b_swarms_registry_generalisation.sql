-- Phase 68. swarm_registry generalisation + canonical context shape.
-- Lifts hardcoded swarm-specific bindings into data: stage1/2 module paths,
-- stage3 coordinator agent_key, side_effects[], canonical context shape, +
-- per-swarm intent→handler mapping. After this migration, onboarding a new
-- swarm = registry INSERTs only; zero code edits in verdict-worker /
-- label-resolver / coordinator-orchestrator.

-- ---- 1. Extend public.swarms -----------------------------------------------

alter table public.swarms
  add column if not exists stage1_regex_module        text,
  add column if not exists stage2_entity_resolver     text,
  add column if not exists stage3_coordinator_agent_key text,
  add column if not exists canonical_context_shape    jsonb,
  add column if not exists entity_brand               jsonb;

-- ---- 2. Create public.swarm_intents ----------------------------------------

create table if not exists public.swarm_intents (
  swarm_type              text        not null references public.swarms(swarm_type) on delete cascade,
  intent_key              text        not null,
  handler_agent_key       text,                                         -- D-09: nullable for intents without a handler yet
  handler_event           text        not null,
  requires_orchestration  boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (swarm_type, intent_key)
);

create index if not exists swarm_intents_handler_event_idx
  on public.swarm_intents (handler_event);

create or replace function public.swarm_intents_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists swarm_intents_updated_at on public.swarm_intents;
create trigger swarm_intents_updated_at
  before update on public.swarm_intents
  for each row execute function public.swarm_intents_set_updated_at();

-- ---- 3. Backfill debtor-email swarm row ------------------------------------

update public.swarms
   set stage1_regex_module        = '@/lib/debtor-email/classify',
       stage2_entity_resolver     = '@/lib/automations/debtor-email/resolve-debtor',
       stage3_coordinator_agent_key = 'debtor-intent-agent',
       canonical_context_shape    = jsonb_build_object(
         'version', '2026-05-04.v1',
         'fields', jsonb_build_object(
           'customer_account_id', jsonb_build_object('type','string','nullable',true,'description','Stage 2 entity-resolution output'),
           'customer_name',       jsonb_build_object('type','string','nullable',true),
           'language',            jsonb_build_object('type','string','enum', jsonb_build_array('nl','en','de','fr'), 'default','nl'),
           'entity_brand',        jsonb_build_object('type','string','description','Brand suffix used by handler agents (R-04 / Phase 69)'),
           'recent_documents',    jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array())
         )
       ),
       entity_brand = jsonb_build_array('smeba','smeba-fire','sicli-noord','sicli-sud','berki'),
       side_effects = jsonb_build_array(
         jsonb_build_object(
           'event',        'debtor-email/icontroller-tag.requested',
           'kind',         'inngest_event',
           'trigger',      'stage2_match_live',
           'gate',         jsonb_build_object(
             'dry_run',                       false,
             'customer_account_id_present',   true,
             'icontroller_company_present',   true
           ),
           'phase_origin', '67'
         ),
         jsonb_build_object(
           'kind',         'automation_run_insert',
           'automation',   'debtor-email-cleanup',
           'trigger',      'stage1_categorize_archive',
           'gate',         jsonb_build_object(
             'category_action', 'categorize_archive'
           ),
           'result_template', jsonb_build_object(
             'stage',        'icontroller_delete',
             'icontroller',  'pending'
           ),
           'phase_origin', '56.7'
         )
       )
 where swarm_type = 'debtor-email';

-- ---- 4. Backfill swarm_intents for debtor-email V2 INTENT enum -------------
-- Source: web/lib/automations/debtor-email/coordinator/types.ts INTENT (8 values).
-- handler_event = "debtor-email/<intent>.requested" (matches events.ts entries).
-- handler_agent_key = real key when a handler agent exists, null otherwise.
-- requires_orchestration = false for all V1 intents (orchestration gate is
-- evaluated at coordinator runtime, not by the registry).

insert into public.swarm_intents (swarm_type, intent_key, handler_agent_key, handler_event, requires_orchestration) values
  ('debtor-email', 'copy_document_request', 'debtor-copy-document-body-agent', 'debtor-email/copy_document_request.requested', false),
  ('debtor-email', 'payment_dispute',       null,                              'debtor-email/payment_dispute.requested',       false),
  ('debtor-email', 'address_change',        null,                              'debtor-email/address_change.requested',        false),
  ('debtor-email', 'peppol_request',        null,                              'debtor-email/peppol_request.requested',        false),
  ('debtor-email', 'credit_request',        null,                              'debtor-email/credit_request.requested',        false),
  ('debtor-email', 'contract_inquiry',      null,                              'debtor-email/contract_inquiry.requested',      false),
  ('debtor-email', 'general_inquiry',       null,                              'debtor-email/general_inquiry.requested',       false),
  ('debtor-email', 'other',                 null,                              'debtor-email/other.requested',                 false)
on conflict (swarm_type, intent_key) do nothing;
