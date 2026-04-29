-- Phase 56-02 wave 2: align email_labels.method CHECK with resolveDebtor.
-- The resolver returns 'identifier_match' (renamed from 'invoice_match'
-- because the lookup also accepts non-invoice numeric identifiers).
-- Keep the old value for any pre-resolver rows.

alter table debtor.email_labels drop constraint if exists email_labels_method_check;
alter table debtor.email_labels
  add constraint email_labels_method_check
  check (method = any (array[
    'thread_inheritance',
    'invoice_match',
    'identifier_match',
    'sender_match',
    'llm_tiebreaker',
    'unresolved'
  ]));
