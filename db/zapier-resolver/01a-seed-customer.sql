/* =============================================================================
   01a-seed-customer.sql  —  CHUNK of the one-time seed (resolver_customer).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. One of the per-kind seed chunks (run 01a → 01b → 01c → 01d → 01e →
   01f → 01g, each on its own, in order). Each chunk finishes in seconds and is
   IDEMPOTENT — a scoped DELETE precedes the INSERT, so a re-run after a dropped
   Beekeeper connection never PK-violates and never needs a global TRUNCATE.

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.
   ============================================================================= */

SET NOCOUNT ON;

/* Idempotent: scope this chunk's prior rows away before re-inserting. */
DELETE FROM zapier.dbo.resolver_customer WHERE environment_id = 'BX';

/* -----------------------------------------------------------------------------
   A) resolver_customer — the richer customer projection (P1/P2 forward-store).
   --------------------------------------------------------------------------- */
INSERT INTO zapier.dbo.resolver_customer
  (environment_id, id, id_org, brand_id, parent_id, previous_customer_id,
   email, postcode, status, modified_on)
SELECT
  c.environment_id,
  CAST(c.id AS varchar(24)),
  c.id_org,
  c.brand_id,
  CAST(c.parent_id AS varchar(24)),
  c.previous_customer_id,
  c.email,
  c.postcode,
  c.status,
  c.modified_on
FROM nxt.dbo.customer AS c
WHERE c.environment_id = 'BX';
