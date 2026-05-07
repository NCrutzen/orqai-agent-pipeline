-- Phase 75 — clean noise-vs-intent registry split, data-only step.
-- Schema rename ships in a follow-up migration paired with code refactor.
--
-- Goals:
--   1. Migrate 1 stray operator-override that used decision='payment'
--      (which is being consolidated into payment_admittance) so we don't
--      lose the row when we drop 'payment' from swarm_categories.
--   2. Insert invoice_copy_request into swarm_intents (was Stage-1-only).
--   3. Delete intent-level rows from swarm_categories — they belong in
--      swarm_intents (Stage 3), not swarm_categories (Stage 1 noise).
--   4. Delete the duplicate 'payment' row from swarm_categories.
--
-- After this migration:
--   swarm_categories has 5 rows (auto_reply, ooo_permanent, ooo_temporary,
--                                payment_admittance, unknown).
--   swarm_intents has 9 rows (8 existing + invoice_copy_request).

-- 1. Migrate the one stray pipeline_events row using decision='payment'.
UPDATE public.pipeline_events
SET decision = 'payment_admittance'
WHERE swarm_type = 'debtor-email'
  AND stage = 1
  AND decision = 'payment';

-- 2. Insert invoice_copy_request into swarm_intents (was only in
--    swarm_categories with action=swarm_dispatch). Idempotent INSERT.
INSERT INTO public.swarm_intents (swarm_type, intent_key, handler_event)
VALUES ('debtor-email', 'invoice_copy_request', 'debtor-email/invoice-copy.requested')
ON CONFLICT (swarm_type, intent_key) DO NOTHING;

-- 3. Delete intent-level rows from swarm_categories. These keys exist in
--    swarm_intents (verified at migration time). Stage 3 owns them now.
DELETE FROM public.swarm_categories
WHERE swarm_type = 'debtor-email'
  AND category_key IN (
    'address_change',
    'contract_inquiry',
    'copy_document_request',
    'credit_request',
    'general_inquiry',
    'peppol_request',
    'payment_dispute',
    'other',
    'invoice_copy_request'
  );

-- 4. Drop the duplicate 'payment' row (consolidated into payment_admittance).
DELETE FROM public.swarm_categories
WHERE swarm_type = 'debtor-email'
  AND category_key = 'payment';
