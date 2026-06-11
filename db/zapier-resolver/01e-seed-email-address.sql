/* =============================================================================
   01e-seed-email-address.sql  —  CHUNK of the one-time seed (email_address kind).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. One of the per-kind seed chunks (run 01a → 01b → 01c → 01d → 01e →
   01f → 01g, each on its own, in order). Each chunk finishes in seconds and is
   IDEMPOTENT — a scoped DELETE precedes the INSERT, so a re-run after a dropped
   Beekeeper connection never PK-violates and never needs a global TRUNCATE.

   This chunk materializes BOTH customer.email (E1) and contact_person.email (E2)
   into the single email_address kind (Open Question 2 — the unused recall lever
   GAP-1).

   PK-DEDUP (load-bearing): the resolver_index PK is
   (swarm_source, environment_id, identifier_kind, identifier_value_norm, party_id).
   The SAME address can belong to a customer record AND its contact_person, and
   junk placeholder addresses (e.g. '*') repeat across many rows — so a naive
   customer-INSERT + contact-INSERT collides on the PK. We therefore UNION ALL
   both sources and GROUP BY the PK columns (environment_id, addr, party_id),
   collapsing to exactly one row per PK. brand_id/name/parent/status are constant
   per party_id; modified_on takes the latest; source_ref is deterministic (MAX).

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* Idempotent: scope this chunk's prior rows away before re-inserting (covers
   both the E1 customer.email and E2 contact_person.email sources below). */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'email_address';

/* -----------------------------------------------------------------------------
   E) email_address  (customer.email ∪ contact_person.email — materialize BOTH
      per Open Question 2). is_unique_in_scope=1 (the proc re-asserts within scope).
   --------------------------------------------------------------------------- */
;WITH email_addr_src AS (
  /* E1) customer.email */
  SELECT c.environment_id, c.brand_id AS scope_key,
         LOWER(LTRIM(RTRIM(c.email))) AS addr_norm,
         CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
         CAST(c.parent_id AS varchar(24)) AS parent_party_id, c.status,
         c.modified_on, 'nxt.dbo.customer.email' AS source_ref
  FROM nxt.dbo.customer AS c
  WHERE c.environment_id = 'BX'
    AND c.email IS NOT NULL AND LTRIM(RTRIM(c.email)) <> ''
  UNION ALL
  /* E2) contact_person.email — the unused recall lever (GAP-1) */
  SELECT cp.environment_id, c.brand_id,
         LOWER(LTRIM(RTRIM(cp.email))),
         CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)), c.status,
         cp.modified_on, 'nxt.dbo.contact_person.email'
  FROM nxt.dbo.contact_person AS cp
  JOIN nxt.dbo.customer AS c
    ON c.id = cp.customer_id AND c.environment_id = cp.environment_id
  WHERE cp.environment_id = 'BX'
    AND cp.email IS NOT NULL AND LTRIM(RTRIM(cp.email)) <> ''
)
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, is_unique_in_scope, precedence, status,
   modified_on, source_ref)
SELECT
  @swarm, environment_id, MAX(scope_key), 'email_address', addr_norm,
  party_id, MAX(party_name), MAX(parent_party_id),
  1, 10, MAX(status), MAX(modified_on), MAX(source_ref)
FROM email_addr_src
GROUP BY environment_id, addr_norm, party_id;
