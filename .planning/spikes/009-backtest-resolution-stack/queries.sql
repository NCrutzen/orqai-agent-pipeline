-- Spike 009: end-to-end backtest of the resolution stack on 5 real emails.
-- Email pulls: Supabase. Customer/order back-search: Zapier MCP -> nxt_benelux_prod.

-- 1) Sample emails (Supabase) — one per failure mode
SELECT e.sender_email, e.sender_name, e.subject, e.conversation_id,
       left(coalesce(e.body_full_text,e.body_text,''),2200) AS body_excerpt
FROM debtor.email_labels l JOIN email_pipeline.emails e ON e.id=l.email_id
WHERE l.method='unresolved' AND l.created_at>now()-interval '40 days'
  AND lower(split_part(coalesce(e.sender_email,''),'@',2)) IN
    ('totaaltechniekgroep.nl','cbre.com','hanab.nl','eusmtp.ariba.com','spendlab.com');

-- 2) Backtest checks (NXT). Key results captured 2026-05-29:
--   spendlab.com domain  -> customer "EQUANS" (id 544685)  == FALSE POSITIVE (real customer = Jumbo)
--   name LIKE '%Jumbo%'  -> 30+ entities (~5 exact "Jumbo Supermarkten B.V.")
--   name LIKE '%Boels%'  -> 6 entities (Verhuur/Industrial/Luxembourg/Verwarming)
--   CBRE PO 95NLP6415039 in orders.sales_reference/reference_1/2/quote_reference -> 0 rows (fresh inbound PO)
--   hanab.nl postcode 4130EA -> 1 customer (unique); 4131NJ -> 9 (from spike 008)
SELECT 'spendlab_domain' chk, CAST(c.id AS varchar(20)) id, c.name, c.city
FROM nxt_benelux_prod.dbo.customer c
WHERE c.id IN (
  SELECT cp.customer_id FROM nxt_benelux_prod.dbo.contact_person cp WHERE LOWER(cp.email) LIKE '%@spendlab.com'
  UNION SELECT c2.id FROM nxt_benelux_prod.dbo.customer c2 WHERE LOWER(c2.email) LIKE '%@spendlab.com')
UNION ALL SELECT 'name_jumbo', CAST(id AS varchar(20)), name, city FROM nxt_benelux_prod.dbo.customer WHERE name LIKE '%Jumbo%'
UNION ALL SELECT 'name_boels', CAST(id AS varchar(20)), name, city FROM nxt_benelux_prod.dbo.customer WHERE name LIKE '%Boels%';
