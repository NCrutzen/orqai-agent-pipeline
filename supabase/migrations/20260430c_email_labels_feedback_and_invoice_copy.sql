-- Phase 56-02 wave 3 part 2: extend debtor.email_labels for the 2-flow
-- feedback model (per architecture doc §"Feedback model — two distinct
-- loops") and admit the new resolver method emitted by the invoice-copy
-- handler.
--
-- Flow 1 (rule correctness) already lands in email_labels.corrected_category
-- and agent_runs.human_verdict — no schema change there.
--
-- Flow 2 (handler/automation correctness): four new columns. All nullable
-- and additive — pre-Wave-3 rows stay clean (NULL means "no feedback yet").

alter table debtor.email_labels
  add column if not exists feedback_verdict             text
    check (feedback_verdict in ('approved', 'rejected', 'manual_override')),
  add column if not exists feedback_reason              text,
  add column if not exists corrected_customer_account_id text,
  add column if not exists draft_quality                text
    check (draft_quality in ('correct', 'needed_edit', 'rejected'));

create index if not exists email_labels_feedback_verdict_idx
  on debtor.email_labels (feedback_verdict)
  where feedback_verdict is not null;

create index if not exists email_labels_draft_quality_idx
  on debtor.email_labels (draft_quality)
  where draft_quality is not null;

-- Allow the method emitted by classifier-invoice-copy-handler.
alter table debtor.email_labels drop constraint if exists email_labels_method_check;
alter table debtor.email_labels
  add constraint email_labels_method_check
  check (method = any (array[
    'thread_inheritance',
    'invoice_match',
    'identifier_match',
    'sender_match',
    'llm_tiebreaker',
    'unresolved',
    'invoice_copy_drafted'
  ]));
