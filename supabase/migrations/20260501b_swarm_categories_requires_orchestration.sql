-- Phase 65 D-08 — column for tri-state escalation gate.
alter table public.swarm_categories
  add column if not exists requires_orchestration boolean not null default false;

-- Phase 65 RESEARCH Pitfall 1 — today's swarm_categories holds Stage 1 noise
-- buckets, not the 8-value Stage 3 INTENT enum (copy_document_request,
-- payment_dispute, ...). Without this seed, single-shot dispatch logs
-- "no swarm_dispatch registered for intent=copy_document_request" on every
-- fast-path email. Phase 68 (SWRM-02) migrates these rows to swarm_intents
-- (rename + table move only — no semantic change).
--
-- Category keys MUST match INTENT enum in
-- web/lib/automations/debtor-email/triage/types.ts:17-26 verbatim.

insert into public.swarm_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, requires_orchestration, display_order)
values
  ('debtor-email','copy_document_request','Copy document request', null, 'swarm_dispatch', 'debtor-email/copy_document_request.requested', false, 100),
  ('debtor-email','payment_dispute',      'Payment dispute',       null, 'swarm_dispatch', 'debtor-email/payment_dispute.requested',       true,  110),
  ('debtor-email','address_change',       'Address change',        null, 'swarm_dispatch', 'debtor-email/address_change.requested',        false, 120),
  ('debtor-email','peppol_request',       'Peppol request',        null, 'swarm_dispatch', 'debtor-email/peppol_request.requested',        false, 130),
  ('debtor-email','credit_request',       'Credit request',        null, 'swarm_dispatch', 'debtor-email/credit_request.requested',        true,  140),
  ('debtor-email','contract_inquiry',     'Contract inquiry',      null, 'swarm_dispatch', 'debtor-email/contract_inquiry.requested',      false, 150),
  ('debtor-email','general_inquiry',      'General inquiry',       null, 'swarm_dispatch', 'debtor-email/general_inquiry.requested',       false, 160),
  ('debtor-email','other',                'Other',                 null, 'swarm_dispatch', 'debtor-email/other.requested',                 true,  170)
on conflict (swarm_type, category_key) do update set
  display_label          = excluded.display_label,
  action                 = excluded.action,
  swarm_dispatch         = excluded.swarm_dispatch,
  requires_orchestration = excluded.requires_orchestration,
  display_order          = excluded.display_order,
  updated_at             = now();
