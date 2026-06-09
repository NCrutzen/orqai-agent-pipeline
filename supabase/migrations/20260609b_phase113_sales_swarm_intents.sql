-- Phase 113 Plan 04 (D-04) — seed the operator-promoted sales-email Stage 3
-- vocabulary into public.swarm_intents.
--
-- SOURCE: the operator-promoted `promoted_intents:` yaml block recorded in
-- .planning/phases/113-stage-3-sales-intent-agent-greenfield/113-03-SUMMARY.md
-- ("Bootstrap Discovery Run + Promoted Vocabulary", operator checkpoint
-- resolved 2026-06-09 by Nick). These 12 intents map ~80% of the 215-mail
-- bootstrap corpus (coverage threshold D-02). NONE were hand-curated — they
-- emerged from the bootstrap retro cluster surface + operator promotion
-- (STAGE3-02). The yaml hand-off was non-empty, so this seed uses it directly
-- (the Plan 04 DB-fallback path was not needed).
--
-- The mandatory `other` residual is ALWAYS seeded (STAGE3-03 / Assumption A4 /
-- Pitfall 1): without it the Stage 3.5 dispatcher throws "no swarm_intents row"
-- on the catch-all instead of routing to the Kanban human-lane.
--
-- HARD-SEPARATION LOCK (docs/agentic-pipeline/stage-3-coordinator.md): a row
-- exists in EXACTLY ONE of swarm_noise_categories (Stage 1) or swarm_intents
-- (Stage 3) — never both. None of these intent_keys collide with the 13 sales
-- swarm_noise_categories keys (verified at promotion time + guarded by the
-- sales-hard-separation.test.ts unit test).
--
-- No new table → no RLS block needed (public.swarm_intents already
-- RLS-enabled, migration 20260504b + 20260520). Idempotent via
-- `on conflict (swarm_type, intent_key) do nothing`. handler_agent_key=null /
-- handler_status='placeholder' for ALL sales intents — no Stage 4 handlers
-- exist until V11.0, so every intent routes to the Kanban human-lane.

BEGIN;

-- Seed the promoted vocabulary + mandatory `other` residual.
-- handler_event = "sales-email/<intent>.requested" (the dispatcher's registered
-- branch would emit this once a Stage 4 handler is registered; inert while
-- handler_status='placeholder'). requires_orchestration=false for all V1.
insert into public.swarm_intents
  (swarm_type, intent_key, handler_agent_key, handler_event, requires_orchestration)
values
  ('sales-email', 'quote_request',          null, 'sales-email/quote_request.requested',          false),
  ('sales-email', 'quote_acceptance',       null, 'sales-email/quote_acceptance.requested',       false),
  ('sales-email', 'quote_rejection',        null, 'sales-email/quote_rejection.requested',        false),
  ('sales-email', 'purchase_order',         null, 'sales-email/purchase_order.requested',         false),
  ('sales-email', 'order_status',           null, 'sales-email/order_status.requested',           false),
  ('sales-email', 'service_request',        null, 'sales-email/service_request.requested',        false),
  ('sales-email', 'billing_dispute',        null, 'sales-email/billing_dispute.requested',        false),
  ('sales-email', 'documentation_request',  null, 'sales-email/documentation_request.requested',  false),
  ('sales-email', 'complaint',              null, 'sales-email/complaint.requested',              false),
  ('sales-email', 'contract',               null, 'sales-email/contract.requested',               false),
  ('sales-email', 'portal_access',          null, 'sales-email/portal_access.requested',          false),
  ('sales-email', 'product_question',       null, 'sales-email/product_question.requested',       false),
  -- Mandatory residual — STAGE3-03 dead-letter guard.
  ('sales-email', 'other',                  null, 'sales-email/other.requested',                  false)
on conflict (swarm_type, intent_key) do nothing;

-- No Stage 4 handlers until V11.0 → every sales intent is handler-less and
-- routes to the Kanban human-lane (the dispatcher placeholder branch).
update public.swarm_intents
   set handler_status = 'placeholder'
 where swarm_type = 'sales-email';

COMMIT;
