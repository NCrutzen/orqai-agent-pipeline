-- Spike 005 (Lever 3): domain-level sender-match recall.
-- Ground-truth proxy = our own resolution history. Conservative FLOOR.
-- Run via Supabase MCP execute_sql (project mvqjhlxfvtqqubqgdvhz).

-- Q1: floor + distinct domains recovered
WITH free AS (
  SELECT unnest(ARRAY['gmail','hotmail','outlook','live','icloud','yahoo',
                      'telenet','skynet','proximus','me','msn','aol']) AS w
),
resolved AS (
  SELECT lower(split_part(coalesce(e.sender_email,''),'@',2)) AS dom,
         l.customer_account_id
  FROM debtor.email_labels l
  JOIN email_pipeline.emails e ON e.id = l.email_id
  WHERE l.customer_account_id IS NOT NULL AND coalesce(e.sender_email,'') <> ''
),
domain_map AS (
  SELECT dom, count(DISTINCT customer_account_id) AS n_customers,
         min(customer_account_id) AS the_customer
  FROM resolved
  WHERE dom <> '' AND dom NOT IN (SELECT w FROM free)
  GROUP BY dom
),
confident_map AS (SELECT dom, the_customer FROM domain_map WHERE n_customers = 1),
misses AS (
  SELECT l.id, lower(split_part(coalesce(e.sender_email,''),'@',2)) AS dom
  FROM debtor.email_labels l
  JOIN email_pipeline.emails e ON e.id = l.email_id
  WHERE l.method='unresolved' AND l.created_at > now() - interval '30 days'
    AND coalesce(e.sender_email,'') <> ''
    AND lower(split_part(coalesce(e.sender_email,''),'@',2))
        !~ '(smeba|smeba-fire|fire-control|firecontrol|sicli|berki|moyne|walkerfire)'
)
SELECT
  (SELECT count(*) FROM misses)                            AS external_misses,
  count(*)                                                 AS recoverable_via_domain_floor,
  round(100.0*count(*)/(SELECT count(*) FROM misses),1)    AS pct_of_all_external,
  count(DISTINCT m.dom)                                    AS distinct_domains_recovered
FROM misses m JOIN confident_map c ON c.dom = m.dom;
-- RESULT 2026-05-29: external_misses=182, recoverable=35, pct=19.2, distinct_domains=18

-- Q2: bracket the remainder (unique floor / ambiguous / never-seen)
-- (same CTEs, replace domain_map n filter) -> 35 unique / 20 ambiguous / 127 never-seen
