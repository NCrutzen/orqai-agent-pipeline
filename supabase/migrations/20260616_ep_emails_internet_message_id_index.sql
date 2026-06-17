-- 20260616 — index email_pipeline.emails.internet_message_id
--
-- Why: the Stage-1.5 / Stage-2 / verdict-worker / invoice-copy handlers look up
-- the email row with
--     .or("source_id.eq.<id>,internet_message_id.eq.<id>")
-- on email_pipeline.emails (~125k rows). `source_id` is unique-indexed
-- (emails_graph_id_key) but `internet_message_id` had NO index, so the OR
-- forced a sequential scan and intermittently hit the Postgres statement
-- timeout — surfacing as `emails lookup failed: canceling statement due to
-- statement timeout`. With retries:0 on those workers (see the companion
-- handoff-resilience change) that throw permanently dropped the email
-- mid-funnel. A btree index on internet_message_id lets the planner BitmapOr
-- both arms of the .or() and the lookup returns in milliseconds.
--
-- No new table → no RLS/policy changes required. Index-only, idempotent.
-- Not CONCURRENTLY: migrations run in a transaction here and 125k rows build
-- in well under the timeout.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_ep_emails_internet_message_id
  ON email_pipeline.emails (internet_message_id);

COMMIT;
