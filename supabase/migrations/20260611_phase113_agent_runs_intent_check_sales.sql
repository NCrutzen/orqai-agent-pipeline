-- Phase 113 (post-go-live-review fix, 2026-06-11): widen agent_runs_intent_check
-- with the 12 promoted sales intents.
--
-- ROOT CAUSE: the constraint predates multi-swarm Stage 3 and listed ONLY the
-- 8 debtor intents. The Phase 113 seed (20260609b) added 13 sales swarm_intents
-- but nobody widened this CHECK — a 5th enum surface next to the 3-way
-- invariant (swarm_intents registry / intent.generated.ts / Orq json_schema)
-- and the agent instructions. The bug stayed INVISIBLE while the sales agent
-- ran its bootstrap prompt (every verdict 'other', which IS in the debtor
-- list). The moment real sales intents flowed (2026-06-11, agent v2.0.0), the
-- classify-intent hoist (updateRun -> agent_runs.intent='quote_request')
-- violated the CHECK, the Inngest step crash-looped, and persist-ranked never
-- ran: coordinator_runs.ranked_intents stayed [] while agent_runs.tool_outputs
-- held the verdict.
--
-- This list MUST stay the union of all swarm_intents.intent_key values.
-- Long-term: drop the CHECK in favour of registry validation (the Zod gate +
-- swarm_intents FK path already enforce per-swarm vocabularies) or codegen it
-- — tracked with the Phase 113 checkpoint addendum.

alter table public.agent_runs
  drop constraint if exists agent_runs_intent_check;

alter table public.agent_runs
  add constraint agent_runs_intent_check
  check (intent = any (array[
    -- debtor-email (Phase 68 vocabulary)
    'copy_document_request'::text,
    'payment_dispute'::text,
    'address_change'::text,
    'peppol_request'::text,
    'credit_request'::text,
    'contract_inquiry'::text,
    'general_inquiry'::text,
    -- sales-email (Phase 113 promoted vocabulary, 20260609b)
    'quote_request'::text,
    'quote_acceptance'::text,
    'quote_rejection'::text,
    'purchase_order'::text,
    'order_status'::text,
    'service_request'::text,
    'billing_dispute'::text,
    'documentation_request'::text,
    'complaint'::text,
    'contract'::text,
    'portal_access'::text,
    'product_question'::text,
    -- shared residual (both swarms)
    'other'::text
  ]));
