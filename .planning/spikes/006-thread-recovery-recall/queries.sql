-- Spike 006 (Lever 2): thread + quoted-body recovery floor.
-- Ground-truth proxy = our own resolution history. Conservative FLOOR.
-- Run via Supabase MCP execute_sql (project mvqjhlxfvtqqubqgdvhz).

-- Q1: thread-inheritance recovery (sibling resolved label on same conversation)
WITH misses AS (
  SELECT l.id, e.conversation_id
  FROM debtor.email_labels l
  JOIN email_pipeline.emails e ON e.id = l.email_id
  WHERE l.method='unresolved' AND l.created_at > now() - interval '30 days'
),
resolved_threads AS (
  SELECT DISTINCT e.conversation_id
  FROM debtor.email_labels l
  JOIN email_pipeline.emails e ON e.id = l.email_id
  WHERE l.customer_account_id IS NOT NULL AND e.conversation_id IS NOT NULL
)
SELECT count(*) AS total_misses,
       count(*) FILTER (WHERE m.conversation_id IS NOT NULL) AS now_have_conv_id,
       count(*) FILTER (WHERE rt.conversation_id IS NOT NULL) AS recoverable_via_thread,
       round(100.0*count(*) FILTER (WHERE rt.conversation_id IS NOT NULL)/count(*),1) AS pct
FROM misses m LEFT JOIN resolved_threads rt ON rt.conversation_id = m.conversation_id;
-- RESULT 2026-05-29: total=247, now_have_conv_id=246, via_thread=44, pct=17.8

-- Q2: combined union floor (thread OR sender-domain OR quoted-body).
-- See conversation transcript 2026-05-29 for the full scored CTE.
-- RESULT: via_thread=44, via_sender_domain=35, via_quoted_body=44, union=80 (32.4%).
