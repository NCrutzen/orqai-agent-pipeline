-- Phase 76: handler_status registry column on swarm_intents.
-- Purpose: Stage 3 dispatch checks handler_status before inngest.send.
-- 'registered' → handler exists, fire event. 'placeholder' → write Kanban row.
-- Per RESEARCH.md §Pattern 1 + CONTEXT.md "Schema / row shape on automation_runs".

BEGIN;

ALTER TABLE public.swarm_intents
  ADD COLUMN handler_status text NOT NULL DEFAULT 'registered'
  CHECK (handler_status IN ('registered','placeholder'));

-- 8 of 9 debtor-email intents have NO Stage 4 handler today.
-- Only invoice_copy_request stays 'registered' (default).
-- Source: classifier-invoice-copy-handler.ts is the only *-handler.ts in the Stage 4 set.
UPDATE public.swarm_intents
   SET handler_status = 'placeholder'
 WHERE swarm_type = 'debtor-email'
   AND intent_key IN (
     'address_change',
     'contract_inquiry',
     'copy_document_request',
     'credit_request',
     'general_inquiry',
     'peppol_request',
     'payment_dispute',
     'other'
   );

COMMENT ON COLUMN public.swarm_intents.handler_status IS
  'Phase 76: registry source-of-truth for Stage 4 handler registration. Stage 3 dispatch checks this before inngest.send; placeholder intents land in Kanban human lane (automation_runs.status=pending, result.kanban_reason=no_handler).';

COMMIT;
