-- Phase 90 (RESL-05) — backfill debtor.email_labels.conversation_id.
--
-- NO DDL. The conversation_id text column + its partial index already exist
-- (20260423_debtor_email_labeling.sql:25, :49). This is a one-statement DATA
-- migration on an EXISTING table — no new table, no new RLS policy, no new
-- function. RLS on debtor.email_labels is already enabled from its create
-- migration; this UPDATE runs as service_role at apply time.
--
-- The bug (90-RESEARCH §RESL-05, VALIDATION §3.2): the prior backfill populated
-- email_pipeline.emails.conversation_id but NOT debtor.email_labels.conversation_id.
-- The resolver's thread_inheritance layer self-joins on email_labels.conversation_id,
-- so with only 3/383 labels stamped, thread_inheritance fires ~0x. 377 labels are
-- backfillable (0 orphans; their emails are 99.2% stamped).
--
-- Forward-rate guard lives in code (Plan 03): all 3 email_labels write paths stamp
-- conversation_id at INSERT, and forward-rate-paths.ts enumerates the audited set
-- so a 4th writer can't silently skip it. This migration is the one-shot historical
-- patch; the forward guard prevents re-rot.

BEGIN;

UPDATE debtor.email_labels AS l
   SET conversation_id = e.conversation_id
  FROM email_pipeline.emails AS e
 WHERE l.email_id = e.id
   AND l.conversation_id IS NULL
   AND e.conversation_id IS NOT NULL;

-- Expected ~377 rows updated (RESL-05). 3/383 labels were already stamped;
-- 0 orphans. Post-apply check (run separately):
--   SELECT count(*) FROM debtor.email_labels WHERE conversation_id IS NOT NULL;
--   -> expect >= 377 (3 pre-existing + ~377 backfilled).

COMMIT;
