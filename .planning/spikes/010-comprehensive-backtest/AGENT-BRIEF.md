# Agent Brief — Stage 2 Resolution Recall comprehensive backtest

You are a backtest agent validating assumptions for a Stage 2 (customer resolution)
redesign at Moyne Roberts. Your job: run LIVE queries against real data and report
whether each assigned assumption HOLDS or BREAKS, with evidence. Be adversarial —
try to break assumptions, not confirm them. Real emails > theory.

## Data access (both are session MCP tools — load via ToolSearch if not visible)

1. **Supabase** (our pipeline DB): `mcp__supabase__execute_sql`, project_id `mvqjhlxfvtqqubqgdvhz`. Postgres.
   - `debtor.email_labels`: id, email_id, method ('unresolved'|'thread_inheritance'|'sender_match'|'identifier_match'|'llm_tiebreaker'), customer_account_id, customer_name, confidence, conversation_id, created_at, reason.
   - `email_pipeline.emails`: id, sender_email, sender_name, subject, body_full_text (FULL quoted thread), body_unique_text (latest msg only), conversation_id, recipients (jsonb — often EMPTY), received_at, source.
   - `email_pipeline.conversation_context`: prior thread messages (Phase 83) — PK (email_id, position). Check if populated.
   - Unresolved misses: `method='unresolved'`. Own-brand/internal sender regex: `(smeba|smeba-fire|fire-control|firecontrol|sicli|berki|moyne|walkerfire)`.

2. **NXT ERP** (SQL Server, live, BILLED): `mcp__claude_ai_Zapier__sql_server_find_multiple_rows_via_custom_query` and `..._find_row_via_custom_query`. Connected DB is `zapier`; query NXT via 3-part names.
   - **`nxt_benelux_prod.dbo`** (our 6 Benelux brands). Also `nxt_ireland_prod`, `nxt_uk_prod`.
   - `customer`: id(bigint), name, brand_id, parent_id(hierarchy; top-level = parent_id NULL), email, postcode, city, vat_number, company_registration_number(KvK), previous_customer_id, phone_number_1..4, peppol_id, address_1/2, status.
   - `contact_person`: id, email, customer_id, firstname, lastname, mobile, phone, job_title, site_id.
   - `site`: id, customer_id, postcode, city, name, address_1/2, phone_number_1..4. (one row per managed building — key for FM/property orgs)
   - `invoice`: invoice_number(bigint, 8-digit e.g. 18800001), invoice_code, customer_id, paying_customer_id, site_id, order_id, job_id, reference.
   - `orders`: order_id(bigint), customer_id, paying_customer_id, sales_reference, reference_1/2/3, quote_reference, site_id. (customer PO refs live in sales_reference/reference_*)
   - `job`: internal_id(bigint, 6-7 digit), site_id, order_id. (job no customer_id — go job.site_id -> site.customer_id)
   - `quote`: id, reference(e.g. SB000028), enquiry_number, customer_id, site_id.
   - Domain from email in T-SQL: `LOWER(SUBSTRING(email, CHARINDEX('@',email)+1, 200))`.

### NXT MCP gotchas (IMPORTANT)
- The `output_hint` param triggers an auto-generated jq filter that CAN MANGLE results — it has clamped COUNT values to 0/1 and dropped rows. Mitigations: (a) for aggregates, return ONE `CONCAT('a=',x,' b=',y)` string and set output_hint to "return the single summary string verbatim"; (b) for row lists, set output_hint to "return every row exactly as-is, no transformation, no omissions".
- Multi-`UNION ALL` queries with empty-string `''` literals can throw "unclosed quotation mark". Use `LEN(LTRIM(col))>0` instead of `col<>''`. Keep UNION blocks simple.
- Each query must run <30s. Use TOP. LIKE '%@domain' can't use an index — keep candidate sets small or extract domain to a column and group.
- It is BILLED per call — be economical, batch checks into single queries where sensible.

## Findings so far (spikes 005-009 — build on these, don't re-derive)
- 65% of Stage-1-unknown debtor emails are unresolved (247/379 / 30d). 74% external, 26% internal-forward.
- Lever 1 SHIPPED: conversation_id was dropped at ingest (camelCase bug), fixed + backfilled (coverage 76%->99.6%). thread_inheritance was firing 0x.
- Domain probe: 88% of business miss-domains ARE real NXT customers; ~60% of external misses domain-resolvable. BUT many domains map to many customers (cbre 59, vbtgroep 81, veolia 30) = property mgmt / FM orgs.
- Disambiguation signals: number back-search (invoice/job/PO/order/quote) highest precision; postcode 85% email / ~100% NXT but sender-signature confound; phone 35%/78%; KvK 13%/36%; customer-debtor-number 13%/(prev_customer_id 73%); VAT 39%; peppol 4.5% (intermediary residue). IBAN ruled out (no customer bank field). recipients column empty (ingest gap).
- Backtest (5 emails) BROKE assumptions: domain match gave a CONFIDENT FALSE POSITIVE (spendlab.com -> "EQUANS" id 544685, real customer was Jumbo via "namens Jumbo"); number back-search missed a fresh inbound CBRE PO (not yet an order); name match ambiguous for chains (Jumbo 30+, Boels 6); "namens/op verzoek van/uw klant X" is a mandatory pattern; some top miss domains are Stage-1 noise (totaaltechniekgroep noreply werkbon x21).

## How to report (return STRUCTURED text)
For each assigned assumption: `A##: HOLDS | BREAKS | PARTIAL` + 1-3 sentence evidence with concrete numbers/customer ids/email examples + design implication. Then a `NEW ASSUMPTIONS` section listing any new testable claims you surfaced, and a `CONFOUNDS/RISKS` section. Cite real sender_email/subject/customer id so findings are verifiable. Use real thread bodies (body_full_text), not just body_unique_text.
