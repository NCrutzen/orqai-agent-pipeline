-- Phase 87 follow-up — disable the own_outbound_invoice_loopback Stage 1 rule.
--
-- Measurement (retro run dd88887c + a read-only V3 re-classification of the 67
-- live loopback archives since the Phase 84 deploy) showed 27/67 (~40%) carried
-- REAL actions — 18 payment_dispute, 5 credit_request, 3 peppol_request,
-- 1 contract_inquiry. Cause: the rule keys on the *forwarder's* domain, so a
-- colleague forwarding a customer dunning/rejection into debiteuren@ from an
-- own-domain mailbox (e.g. elger@smeba-fire.be, crediteuren@smeba.nl) was
-- archived as "System Notification" (action=categorize_archive) before Stage 3.
--
-- The worker rule is now registry-gated (classifier-screen-worker.ts: it only
-- fires when this row is present + enabled, and loadSwarmNoiseCategories filters
-- enabled=true). Flipping enabled=false therefore stops the rule firing; the
-- emails fall through to the LLM 2nd-pass / Stage 3 and are classified normally.
--
-- Re-enable only after a TRUE-system-loopback matcher lands (distinguish the
-- mailbox auto-copying itself from a human colleague forward). Tracked as a
-- follow-up phase.
--
-- Data-only UPDATE on an existing RLS-enabled table — no schema/RLS changes.

UPDATE public.swarm_noise_categories
SET enabled = false,
    updated_at = now()
WHERE swarm_type = 'debtor-email'
  AND category_key = 'own_outbound_invoice_loopback';
