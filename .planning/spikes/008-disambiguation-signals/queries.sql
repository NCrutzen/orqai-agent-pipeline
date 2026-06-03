-- Spike 008: disambiguation signals for multi-customer domains.
-- Supabase (email side) + Zapier MCP SQL -> nxt_benelux_prod (NXT side).

-- ============ EMAIL SIDE (Supabase) ============
-- Q1: marker presence in email bodies by domain bucket (unique/multi/no_match).
--     See transcript 2026-05-29. Result (multi bucket, 65 misses):
--     NL postcode 55 (85%), ref words 58 (89%), VAT/BTW 54 (83%), phone 15 (23%).

-- Q3: extract NL postcodes from multi-customer-domain miss bodies (proof input)
--     regexp_matches(body,'[1-9][0-9]{3} ?[A-Z]{2}','g')

-- ============ NXT SIDE (nxt_benelux_prod via Zapier MCP) ============
-- Q2: discriminating power of postcode/city/vat per multi-customer domain
--     (distinct_postcodes vs customers). Postcode ~100% populated; narrows
--     3-10x, sometimes 1:1 (rcn.nl 11 cust -> 11 postcodes).

-- Q4: END-TO-END PROOF — domain + email postcode -> NXT customer
WITH pairs(dom,pc) AS (SELECT dom,pc FROM (VALUES
   ('hanab.nl','4130EA'),('rcn.nl','8626GG'),('cbre.com','1059CM') /* ...*/ ) v(dom,pc)),
ce AS (
  SELECT LOWER(SUBSTRING(cp.email,CHARINDEX('@',cp.email)+1,200)) dom, cp.customer_id cust
  FROM nxt_benelux_prod.dbo.contact_person cp WHERE cp.email LIKE '%@%' AND cp.customer_id IS NOT NULL
  UNION SELECT LOWER(SUBSTRING(c.email,CHARINDEX('@',c.email)+1,200)), c.id
  FROM nxt_benelux_prod.dbo.customer c WHERE c.email LIKE '%@%')
SELECT p.dom, p.pc, COUNT(DISTINCT cu.id) matched_customers, MAX(cu.name) example
FROM pairs p JOIN ce ON ce.dom=p.dom
JOIN nxt_benelux_prod.dbo.customer cu ON cu.id=ce.cust AND REPLACE(UPPER(cu.postcode),' ','')=p.pc
GROUP BY p.dom,p.pc;
-- RESULT: hanab.nl/4130EA->1, rcn.nl/8626GG->1 (unique); cbre.com/1059CM->33 (HQ, no separation);
-- several email postcodes -> 0 customers (sender-signature address, not target).

-- Q5: NUMBER BACK-SEARCH format samples (design extraction regexes)
-- invoice.invoice_number = 8-digit (18800001); job.internal_id = 6-7 digit (1026065);
-- quote.reference = [A-Z]{2}\d{6} (SB000028); orders.sales_reference/reference_1 = free-text
-- customer PO (SSQ75589, EPN51812756); quote.enquiry_number = free-text (Opdracht A1625828/1).
-- Customer link: invoice.customer_id, orders.customer_id, quote.customer_id direct;
--                job.site_id -> site.customer_id; ticket.job_id -> job -> site -> customer.

-- ============ ADDITIONAL SIGNAL COVERAGE SCAN (2026-05-29) ============
-- NXT side (nxt_benelux_prod.dbo.customer, 74,432 rows): field population
--   vat=29222(39%) kvk(company_registration_number)=26531(36%) gnumber=19(dead)
--   peppol_id=3318(4.5%) external_code=1(dead) previous_customer_id=54012(73%)
--   phone_number_1=57797(78%)
-- Email side (182 external misses): mentions_kvk=32(18%), kvk_with_8digits=23(13%),
--   mentions_customer/debiteurnummer=24(13%), has_phone=64(35%),
--   recipients populated=0 (INGEST GAP — recipients column empty, like conversation_id was).
-- Ruled out: IBAN (no customer bank field), g_number/external_code (dead), CC (empty).
