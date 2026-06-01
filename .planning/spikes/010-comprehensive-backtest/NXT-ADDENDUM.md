# NXT-ADDENDUM — use the consolidated `nxt` database (supersedes zapier/per-region for NXT data)

Operator directive 2026-05-30: resolve against the **`nxt`** database ONLY (all regions, complete).
DO NOT use the `zapier` database (process-driven, incomplete — the peppol view is a subset) and DO NOT use the per-region `nxt_benelux_prod`/`nxt_ireland_prod`/`nxt_uk_prod` for this work. Query `nxt` via 3-part names: `nxt.dbo.<table>`.

## Consolidated model (verified recon 2026-05-30)
- Tables: `nxt.dbo.{customer, contact_person, site, invoice, orders, job, quote, brand, country}` — same shape as the regional DB PLUS consolidation columns.
- **`environment_id`** (varchar) = REGION. Three values: `BX` (Benelux, 74,432 customers, 7 brands), `UK` (78,717, 15 brands), `IE` (59,106, 5 brands).
- Every entity has BOTH `id` (varchar composite, globally unique) AND `id_org` (bigint = the original per-region id). **`id_org` REPEATS across environments** (verified: same id_org in 2+ environments). Joins inside one environment can use id_org; the globally-unique key is `id` (or environment_id+id_org).
- `customer.brand_id` (nvarchar code). In BX the brands are SB/FI/BB/SF/SN/SS (+1). `invoice` has NO brand_id — get brand by joining invoice→customer.

## THE SCOPING RULE (mandatory on every lookup)
Our debtor swarm is entirely Benelux → **`environment_id = 'BX'`** on every query (prevents matching a UK/IE customer/invoice with the same number). Then **`brand_id` from the mailbox** disambiguates within-BX collisions (the 3 BE brands SF/SN/SS share Exact invoice numbering).
Mailbox→brand_id (all BX): `debiteuren@smeba.nl`=SB, `administratie@fire-control.nl`=FI, `debiteuren@berki.nl`=BB, `debiteuren@smeba-fire.be`=SF, `debiteuren@sicli-noord.be`=SN, `debiteuren@sicli-sud.be`=SS.

## Numbers (corrected source)
- **Customer-facing invoice number = `nxt.dbo.invoice.exact_invoice_id`** (nvarchar; NL brands 17xxxxxx-25xxxxxx, BE brands 32xxxxxx-33xxxxxx). ~99% populated. Resolve: `WHERE exact_invoice_id=@n AND environment_id='BX'` → `customer_id_org` → customer; filter brand. VERIFIED: 17342353→1 customer (447444 TEVU, BX); 33050836→3 customers in BX (554115/559600/529909 = the 3 BE brands) → brand filter required.
- `invoice.invoice_number` (bigint, 19M range) = INTERNAL, not what customers cite. Ignore for back-search.
- **Klantnummer the customer cites = `customer.id_org`** (e.g. 530549). Scope environment_id='BX' + brand_id. id_org repeats across regions.
- job.internal_id, orders.sales_reference/reference_*, quote.reference/enquiry_number — same as before but in `nxt`, environment_id='BX'-scoped.
- WATCH: some exact_invoice_ids have many rows (one had 340 across 2 envs) — investigate (credit notes / is_main / line dup / placeholder) and define the filter (likely `is_main=1` and/or exclude null/0) before trusting uniqueness.

## What transfers from spike 010 (nxt-BX == nxt_benelux_prod, same 74,432 customers)
The blocklists (own-entity identifiers, freemail/ISP, platform/intermediary, own-domain-on-customer), domain/postcode/name behaviors, and the self-auth-ID signals all hold — just re-source to `nxt` with the `environment_id='BX'` filter added. Re-confirm rather than re-derive.

## NXT MCP gotchas (unchanged)
output_hint = "return every row exactly as-is verbatim, no transformation, no omissions"; aggregates as single CONCAT `AS summary`; CAST ids to varchar, LEFT(name,N); `previous_customer_id` is nvarchar (CAST before int compare); <30s; billed — batch.
