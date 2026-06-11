/* =============================================================================
   01b-seed-customer_no.sql  —  CHUNK of the one-time seed (customer_no kind).

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

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* Idempotent: scope this chunk's prior rows away before re-inserting. */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'customer_no';

/* -----------------------------------------------------------------------------
   B) customer_no  (klantnummer = id_org; exact, is_unique_in_scope=1)
   --------------------------------------------------------------------------- */
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, is_unique_in_scope, precedence, status,
   modified_on, source_ref)
SELECT
  @swarm, c.environment_id, c.brand_id, 'customer_no',
  CAST(c.id_org AS nvarchar(256)),               -- normalized klantnummer (digits)
  CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)),
  1,                                              -- exact → unique-in-scope
  4,                                              -- customer precedence (lowest of the ID kinds)
  c.status, c.modified_on, 'nxt.dbo.customer'
FROM nxt.dbo.customer AS c
WHERE c.environment_id = 'BX'
  AND c.id_org IS NOT NULL;
