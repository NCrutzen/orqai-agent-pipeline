/* =============================================================================
   01i-seed-previous-customer.sql  —  CHUNK of the one-time seed
                                      (previous_customer_id kind).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. The LAST kind chunk (run 01a → … → 01g → 01h → 01i, each on its own,
   in order). Runs in seconds and is IDEMPOTENT — a scoped DELETE precedes the
   INSERT, so a re-run after a dropped Beekeeper connection never PK-violates.

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.

   SOURCE (operator-ratified — 91-03-SCHEMA-RESEARCH.md): no nxt.dbo probe needed.
   nxt.dbo.customer.previous_customer_id is already materialized into
   zapier.dbo.resolver_customer (01a, ~72.6% BX coverage). This chunk reads it from
   resolver_customer — the migration id a customer still cites maps to the CURRENT
   customer that owns it (the RESL-08 fallback for re-keyed accounts).

   D-04 ROLLUP: each row carries root_party_id = the TRUE top-level customer,
   resolved by the #cust_root recursive parent-chain CTE (mirrors 02-refresh §0
   and 01h). NULL = the party is already a root.

   value_norm = the RAW previous id (no normalization). party_id = the current
   customer.id that cites it. is_unique_in_scope=1 per row; the proc re-asserts
   true uniqueness within @brand_scope (two customers citing the same migration id
   → SUGGEST, never AUTO).
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* -----------------------------------------------------------------------------
   0) #cust_root — TRUE top-level customer per BX customer (D-04). Same recursive
      parent-chain walk as 02-refresh-resolver.sql §0 and 01h.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;

;WITH chain AS (
  SELECT CAST(c.id AS varchar(24))        AS id,
         CAST(c.parent_id AS varchar(24)) AS parent_id,
         CAST(c.id AS varchar(24))        AS cur,
         0                                AS depth
  -- PERF (Phase 91): recurse over zapier.dbo.resolver_customer (id + parent_id,
  -- indexed, 74k) — NOT the nxt.dbo.customer multi-country VIEW. The recursive
  -- per-step seek into the view stalled the seed (>20 min, 0 rows); the same walk
  -- over resolver_customer returns ~84k chain rows in seconds. Same parent model.
  FROM zapier.dbo.resolver_customer AS c
  WHERE c.environment_id = 'BX'
  UNION ALL
  SELECT ch.id, CAST(p.parent_id AS varchar(24)) AS parent_id,
         CAST(p.id AS varchar(24)) AS cur, ch.depth + 1
  FROM chain AS ch
  JOIN zapier.dbo.resolver_customer AS p
    ON p.id = ch.parent_id AND p.environment_id = 'BX'
  WHERE ch.parent_id IS NOT NULL
    AND ch.parent_id <> ch.cur
    AND ch.depth < 32
)
SELECT id,
       CAST(
         SUBSTRING(
           MAX(RIGHT('00' + CAST(depth AS varchar(2)), 2) + '|' + cur),
           4, 24
         ) AS varchar(24)
       ) AS root_party_id
INTO #cust_root
FROM chain
GROUP BY id
OPTION (MAXRECURSION 32);

CREATE UNIQUE CLUSTERED INDEX IX_cust_root ON #cust_root (id);

/* -----------------------------------------------------------------------------
   1) previous_customer_id  (migration id → current owning customer)
   --------------------------------------------------------------------------- */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'previous_customer_id';

INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
   precedence, status, modified_on, source_ref)
SELECT DISTINCT
  @swarm, rc.environment_id, rc.brand_id, 'previous_customer_id',
  CAST(rc.previous_customer_id AS nvarchar(256)),  -- RAW previous id
  CAST(rc.id AS varchar(24)),
  ISNULL(pn.party_name, N''),                        -- name from the cheap zapier.dbo customer_no rows (01b), NOT the nxt.dbo.customer view
  rc.parent_id, rt.root_party_id,
  1, 6,                                             -- previous_customer_id precedence (fallback, below quote)
  rc.status, rc.modified_on, 'resolver_customer.previous_customer_id'
FROM zapier.dbo.resolver_customer AS rc
/* PERF (Phase 91): party_name was joined from nxt.dbo.customer (a multi-country
   VIEW) — 74k probes into the view stalled the seed (>20 min, 0 rows). The name
   is already materialized per party_id on the customer_no rows (01b); source it
   from there — pure zapier.dbo, indexed, seconds. #cust_root still supplies root. */
LEFT JOIN (
  SELECT party_id, MAX(party_name) AS party_name
  FROM zapier.dbo.resolver_index
  WHERE swarm_source = 'debtor-nxt' AND environment_id = 'BX' AND identifier_kind = 'customer_no'
  GROUP BY party_id
) AS pn ON pn.party_id = CAST(rc.id AS varchar(24))
LEFT JOIN #cust_root AS rt ON rt.id = CAST(rc.id AS varchar(24))
WHERE rc.environment_id = 'BX'
  AND rc.previous_customer_id IS NOT NULL
  AND LTRIM(RTRIM(rc.previous_customer_id)) <> '';

/* -----------------------------------------------------------------------------
   cleanup
   --------------------------------------------------------------------------- */
IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;

/* -----------------------------------------------------------------------------
   VERIFY (run after this chunk):
     SELECT COUNT(*) AS n,
            SUM(CASE WHEN root_party_id IS NOT NULL THEN 1 ELSE 0 END) AS rolled
       FROM zapier.dbo.resolver_index
      WHERE environment_id='BX' AND identifier_kind='previous_customer_id';
   --------------------------------------------------------------------------- */
