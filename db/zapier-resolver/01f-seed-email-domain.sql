/* =============================================================================
   01f-seed-email-domain.sql  —  CHUNK of the one-time seed (email_domain kind).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. One of the per-kind seed chunks (run 01a → 01b → 01c → 01d → 01e →
   01f → 01g, each on its own, in order). Each chunk finishes in seconds and is
   IDEMPOTENT — a scoped DELETE precedes the INSERT, so a re-run after a dropped
   Beekeeper connection never PK-violates and never needs a global TRUNCATE. The
   UNION across both email sources makes this one of the heavier chunks; if it
   still times out it can be re-run as-is.

   PK-DEDUP (load-bearing): the resolver_index PK is
   (swarm_source, environment_id, identifier_kind, identifier_value_norm, party_id).
   The same domain↔party edge comes from BOTH customer.email and
   contact_person.email — a naive UNION+INSERT collides on the PK. We UNION ALL
   both sources and GROUP BY the PK columns (environment_id, domain, party_id),
   collapsing to exactly one row per PK. is_unique_in_scope=0 (a domain is a
   candidate set, never unique). The own-brand / freemail / platform stripping
   happens later in the TS engine via Supabase resolution_blocklists (NOT here).

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* Idempotent: scope this chunk's prior rows away before re-inserting. */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'email_domain';

/* -----------------------------------------------------------------------------
   E3) email_domain — from BOTH sources (candidate-set kind: is_unique_in_scope=0).
   --------------------------------------------------------------------------- */
;WITH domain_src AS (
  SELECT c.environment_id, c.brand_id AS scope_key,
         LOWER(SUBSTRING(c.email, CHARINDEX('@', c.email) + 1, 256)) AS domain_norm,
         CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
         CAST(c.parent_id AS varchar(24)) AS parent_party_id, c.status,
         c.modified_on, 'nxt.dbo.customer.email' AS source_ref
  FROM nxt.dbo.customer AS c
  WHERE c.environment_id = 'BX' AND c.email LIKE '%@%'
  UNION ALL
  SELECT cp.environment_id, c.brand_id,
         LOWER(SUBSTRING(cp.email, CHARINDEX('@', cp.email) + 1, 256)),
         CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)), c.status,
         cp.modified_on, 'nxt.dbo.contact_person.email'
  FROM nxt.dbo.contact_person AS cp
  JOIN nxt.dbo.customer AS c
    ON c.id = cp.customer_id AND c.environment_id = cp.environment_id
  WHERE cp.environment_id = 'BX' AND cp.email LIKE '%@%'
)
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, is_unique_in_scope, precedence, status,
   modified_on, source_ref)
SELECT
  @swarm, environment_id, MAX(scope_key), 'email_domain', domain_norm,
  party_id, MAX(party_name), MAX(parent_party_id),
  0, 20, MAX(status), MAX(modified_on), MAX(source_ref)
FROM domain_src
WHERE domain_norm IS NOT NULL AND domain_norm <> ''
GROUP BY environment_id, domain_norm, party_id;
