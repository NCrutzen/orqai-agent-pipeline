-- Phase 56-02 wave 3 part 2: route the invoice_copy_request bucket to the
-- automated draft handler via swarm_dispatch instead of the noop
-- categorize_archive action.
--
-- Listener: web/lib/inngest/functions/classifier-invoice-copy-handler.ts
--
-- Operator-driven flow today: emails are reclassified from Bulk Review
-- (override category=invoice_copy_request); the regex classifier never emits
-- this category. Once flipped, an operator override produces a verdict-worker
-- swarm_dispatch into 'debtor-email/invoice-copy.requested', and the new
-- handler builds the iController draft. Outlook is NOT archived in this
-- branch (the operator must still send the draft from iController).

update public.swarm_categories
   set action          = 'swarm_dispatch',
       swarm_dispatch  = 'debtor-email/invoice-copy.requested',
       updated_at      = now()
 where swarm_type   = 'debtor-email'
   and category_key = 'invoice_copy_request';
