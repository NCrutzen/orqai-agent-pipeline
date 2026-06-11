/* =============================================================================
   01d-seed-invoice_no.sql  —  CHUNK of the one-time seed (invoice_no kind).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. One of the per-kind seed chunks (run 01a → 01b → 01c → 01d → 01e →
   01f → 01g, each on its own, in order). Each chunk finishes in seconds and is
   IDEMPOTENT — a scoped DELETE precedes the INSERT, so a re-run after a dropped
   Beekeeper connection never PK-violates and never needs a global TRUNCATE.
   This is the largest kind (~275k invoice rows); if it still times out it can be
   re-run as-is (the scoped DELETE makes the re-run a clean replace).

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.

   INVOICE COLLAPSE: DISTINCT customer_id_org — do NOT filter on the is_main flag
   (99% of invoice numbers have every row is_main=false; filtering to the main
   line would drop ~99% of resolvable invoices). §0.10 A2.
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* Idempotent: scope this chunk's prior rows away before re-inserting. */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'invoice_no';

/* -----------------------------------------------------------------------------
   D) invoice_no  (exact_invoice_id → customer via customer_id_org)
      COLLAPSE multi-row invoices via DISTINCT customer_id_org — do NOT filter on
      the is_main flag (BE invoices live as is_main=false; filtering drops ~99%).
      is_unique_in_scope is set TRUE per row here; the proc still re-asserts true
      uniqueness within @brand_scope at read time (BE numbers collide 3-way).
   --------------------------------------------------------------------------- */
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, is_unique_in_scope, precedence, status,
   modified_on, source_ref)
SELECT
  @swarm, inv.environment_id, c.brand_id, 'invoice_no',
  CAST(inv.exact_invoice_id AS nvarchar(256)),
  CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)),
  1, 1,                                           -- invoice = highest ID precedence
  c.status, inv.modified_on, 'nxt.dbo.invoice'
FROM (
  /* one row per (exact_invoice_id, customer_id_org) — line-level dups collapsed */
  SELECT DISTINCT
         i.environment_id, i.exact_invoice_id, i.customer_id_org,
         MAX(i.modified_on) OVER (PARTITION BY i.environment_id, i.exact_invoice_id, i.customer_id_org) AS modified_on
  FROM nxt.dbo.invoice AS i
  WHERE i.environment_id = 'BX'
    AND i.exact_invoice_id IS NOT NULL
) AS inv
JOIN nxt.dbo.customer AS c
  ON c.id_org = inv.customer_id_org AND c.environment_id = inv.environment_id
WHERE inv.environment_id = 'BX';
