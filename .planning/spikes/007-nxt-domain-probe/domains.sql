-- Spike 007 input: the "never-seen" external-miss domains the NXT probe tests.
-- Read-only, run via Supabase MCP (project mvqjhlxfvtqqubqgdvhz). Feed the
-- output (domain list) to the NXT domain lookup via the Zapier whitelisted-IP path.
WITH free AS (
  SELECT unnest(ARRAY['gmail.com','hotmail.com','outlook.com','live.com','icloud.com',
                      'yahoo.com','telenet.be','skynet.be','proximus.be','me.com',
                      'msn.com','aol.com']) AS w
),
resolved AS (
  SELECT lower(split_part(coalesce(e.sender_email,''),'@',2)) AS dom
  FROM debtor.email_labels l JOIN email_pipeline.emails e ON e.id=l.email_id
  WHERE l.customer_account_id IS NOT NULL AND coalesce(e.sender_email,'')<>''
),
seen AS (SELECT DISTINCT dom FROM resolved WHERE dom<>''),
misses AS (
  SELECT lower(split_part(coalesce(e.sender_email,''),'@',2)) AS dom
  FROM debtor.email_labels l JOIN email_pipeline.emails e ON e.id=l.email_id
  WHERE l.method='unresolved' AND l.created_at>now()-interval '30 days'
    AND coalesce(e.sender_email,'')<>''
    AND lower(split_part(coalesce(e.sender_email,''),'@',2))
        !~ '(smeba|smeba-fire|fire-control|firecontrol|sicli|berki|moyne|walkerfire)'
)
SELECT m.dom, count(*) AS misses
FROM misses m
WHERE m.dom NOT IN (SELECT dom FROM seen)
  AND m.dom NOT IN (SELECT w FROM free)
GROUP BY m.dom
ORDER BY misses DESC, m.dom;
-- 2026-05-29: ~127 distinct domains. Top: totaaltechniekgroep.nl(21), cbre.com(6),
-- hanab.nl(5), argroep.nl(3), buildingsagency.be(3), eusmtp.ariba.com(3), rskinstallatie.nl(3)...
-- Note: *.ariba.com / basware / spendlab / sap.com / factuurportal.eu are e-invoicing
-- intermediaries -> pre-classify as Lever 4 (body extraction), do NOT NXT-domain-test.
