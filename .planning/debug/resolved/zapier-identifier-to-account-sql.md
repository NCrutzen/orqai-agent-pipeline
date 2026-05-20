---
slug: zapier-identifier-to-account-sql
status: resolved
trigger: Zapier Customer Mapping Zap — Step 9 SQL Server error on Identifier → Account path
created: 2026-05-20
updated: 2026-05-20
resolved: 2026-05-20
goal: find_and_fix
---

# Debug Session: zapier-identifier-to-account-sql

## Symptoms

- Inngest called `nxt.identifier_lookup` with `payload.invoice_numbers=["17338747"]`, `brand_id="FI"`.
- Zap path `Identifier → Account` Step 9 (SQL Server) errored.
- Visible SQL contained `STRING_SPLIT('', CHAR(44))` → `''` → INT conversion error.

## Root Cause

Step 9's SQL on the `Identifier → Account` path was a copy of the `Candidate Details` SQL: queried `customer.id IN (customer_ids_csv)`. For `lookup_kind=identifier_to_account` the caller sends `invoice_numbers`, not `customer_ids`, so the placeholder rendered empty and the table was wrong. The path is supposed to translate **invoice number → paying customer** via the `invoice` table.

## Fix

Replaced Step 9 SQL with an `invoice`-table query joined to `customer` for the `brand_id` filter (invoice table has no `brand_id` column):

```sql
SELECT
  i.id                                                              AS invoice_id,
  i.exact_invoice_id                                                AS invoice_number,
  i.customer_id,
  i.paying_customer_id                                              AS top_level_customer_id,
  i.site_id,
  i.job_id,
  CAST(CONVERT(VARCHAR(27), i.invoice_date, 121) AS VARCHAR(27))    AS invoice_date,
  i.status
FROM [{{nxt_database}}].dbo.invoice i
JOIN [{{nxt_database}}].dbo.customer c
  ON c.id = i.paying_customer_id
WHERE i.exact_invoice_id IN (
  SELECT TRIM(value)
  FROM STRING_SPLIT('{{payload.invoice_numbers}}', CHAR(44))
  WHERE TRIM(value) <> ''
)
AND c.brand_id = '{{brand_id}}'
```

Verified working live.

## Follow-ups

- Consider adding a Filter step (or defensive `WHERE TRIM(value) <> ''`, already included) to the `Sender → Account` and `Candidate Details` paths to avoid the same `'' → int` class of failure if their upstream CSVs are ever empty.
