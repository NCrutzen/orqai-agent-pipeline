-- Phase 91 (D-02): persist environment_id alongside the numeric customer_account_id
-- so a future (environment_id, customer_account_id) key needs no migration.
--
-- Estate boundary (Pitfall 1): this is Postgres `supabase/migrations/`, auto-applied.
-- It is NOT `db/zapier-resolver/` (SQL Server `zapier.dbo`, operator-applied). Do not
-- reference nxt.dbo / zapier.dbo here.
--
-- RLS: this adds a COLUMN to an existing table; the column inherits the table's
-- existing policies, so no new policy is required. `npm run check:supabase` must
-- stay green (no ERROR-level advisor lint).
--
-- D-01/D-02: stripEnvPrefix ("BX593290" -> "593290") is a PRESENTATION strip, not a
-- discard — environment_id is persisted here so the BX-only view today is unblocked
-- toward a multi-country (environment_id, customer_account_id) key tomorrow. Forward-only:
-- no NOT NULL, no backfill (historic rows are all BX).

-- 1. D-02: add environment_id (text, nullable, forward-only — idempotent).
alter table debtor.email_labels add column if not exists environment_id text;

-- 2. Extend the method CHECK with the new self_auth method (Phase 91 D-10 first rung),
--    mirroring the analog 20260429f drop-and-re-add. The live constraint (verified
--    against prod 2026-06-10) already carries seven values INCLUDING invoice_copy_drafted
--    (written by the debtor invoice-copy handler); the re-add MUST preserve all seven and
--    only ADD self_auth — narrowing the set would break invoice-copy writes. Eight total.
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
    'invoice_copy_drafted',
    'self_auth'
  ]));
