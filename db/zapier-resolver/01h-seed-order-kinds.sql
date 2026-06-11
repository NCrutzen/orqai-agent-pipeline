/* =============================================================================
   01h-seed-order-kinds.sql  —  CHUNK of the one-time seed
                                (po_no / order_no / job_no / quote_no kinds).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. Slots after 01g (run 01a → 01b → 01c → 01d → 01e → 01f → 01g →
   01h → 01i, each on its own, in order). Each per-kind INSERT is IDEMPOTENT —
   a scoped DELETE precedes it, so a re-run after a dropped Beekeeper connection
   never PK-violates and never needs a global TRUNCATE.

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.

   SOURCE COLUMNS (operator-ratified — 91-03-SCHEMA-RESEARCH.md, probed live):
     order_no  → nxt.dbo.orders.order_id_org ; customer via BOTH orders.customer_id_org
                 AND orders.paying_customer_id_org → customer.id_org (BOTH-party rule).
     quote_no  → nxt.dbo.quote.id_org ; ALSO seed the normalized quote.reference
                 (strip leading alpha brand prefix, e.g. "SB017092" → "17092") ;
                 customer via quote.customer_id_org → customer.id_org.
     job_no    → nxt.dbo.job.internal_id_org (NOT job.id — that is a GUID) ;
                 customer via SITE path job.site_id_org → site → customer.
     po_no     → nxt.dbo.invoice.reference (FREE-TEXT) ; customer via BOTH
                 invoice.customer_id_org AND invoice.paying_customer_id_org. Seed
                 ONLY identifier-shaped, normalized values (see po_no block).

   BOTH-PARTY RULE (operator decision): where customer_id_org <> paying_customer_id_org
   emit a resolver_index row for EACH party — the debtor may be the ordering OR the
   billed party. Implemented as a UNION ALL over the two join keys + DISTINCT collapse.

   D-04 ROLLUP: every number-kind row carries root_party_id = the TRUE top-level
   customer, resolved by the #cust_root recursive parent-chain CTE below (mirrors
   02-refresh-resolver.sql §0). NULL = the party is already a root.

   COLLAPSE: DISTINCT (value_norm, party_id) — do NOT filter on any main-line flag
   (the BE-invoice anti-pattern that drops ~99% of rows). The proc re-asserts true
   uniqueness within @brand_scope at read time; a value mapping to >1 party becomes
   SUGGEST, never AUTO.
   ============================================================================= */

SET NOCOUNT ON;

DECLARE @swarm varchar(32) = 'debtor-nxt';

/* -----------------------------------------------------------------------------
   0) #cust_root — TRUE top-level customer per BX customer (D-04). Same recursive
      parent-chain walk as 02-refresh-resolver.sql §0: parent_id is composite
      ("BX477375") referencing customer.id within the SAME environment_id; NULL/
      self = root. Computed once here and joined into every kind below.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;

;WITH chain AS (
  SELECT CAST(c.id AS varchar(24))        AS id,
         CAST(c.parent_id AS varchar(24)) AS parent_id,
         CAST(c.id AS varchar(24))        AS cur,
         0                                AS depth
  -- PERF (Phase 91): recurse over zapier.dbo.resolver_customer (indexed, 74k) — NOT
  -- the nxt.dbo.customer multi-country VIEW (a per-step view seek stalls the walk;
  -- resolver_customer carries the same id+parent_id model and returns in seconds).
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
   1) order_no  (orders.order_id_org → customer via BOTH ordering + paying party)
   --------------------------------------------------------------------------- */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'order_no';

INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
   precedence, status, modified_on, source_ref)
SELECT DISTINCT
  @swarm, o.environment_id, c.brand_id, 'order_no',
  CAST(o.order_id_org AS nvarchar(256)),
  CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)), rt.root_party_id,
  1, 2,                                            -- order precedence (between invoice 1 and site 3)
  c.status, o.modified_on, 'nxt.dbo.orders'
FROM nxt.dbo.orders AS o
CROSS APPLY (VALUES (o.customer_id_org), (o.paying_customer_id_org)) AS party(cust_id_org)
JOIN nxt.dbo.customer AS c
  ON c.id_org = party.cust_id_org AND c.environment_id = o.environment_id
LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
WHERE o.environment_id = 'BX'
  AND o.order_id_org IS NOT NULL
  AND party.cust_id_org IS NOT NULL;

/* -----------------------------------------------------------------------------
   2) quote_no  (quote.id_org → customer via quote.customer_id_org)
      ALSO seed the normalized branded quote.reference ("SB017092" → "17092") so
      debtor emails citing the branded form resolve to the same party. The numeric
      id_org and the stripped reference both land as kind 'quote_no'.
   --------------------------------------------------------------------------- */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'quote_no';

/* PK DEDUP (Phase 91 fix): one value_norm can map to the SAME party via >1 source
   row (e.g. a quote's numeric id_org AND another quote's stripped reference both
   normalize to the same number for the same customer) with DIFFERING modified_on —
   SELECT DISTINCT keeps both (modified_on differs) → PK violation on
   (…,value_norm,party_id). Collapse to ONE row per (value_norm, party_id), keeping
   the latest modified_on, via ROW_NUMBER. */
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
   precedence, status, modified_on, source_ref)
SELECT
  swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
  party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
  precedence, status, modified_on, source_ref
FROM (
  SELECT
    @swarm AS swarm_source, q.environment_id, c.brand_id AS scope_key, 'quote_no' AS identifier_kind,
    v.value_norm AS identifier_value_norm,
    CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
    CAST(c.parent_id AS varchar(24)) AS parent_party_id, rt.root_party_id,
    CAST(1 AS bit) AS is_unique_in_scope, 5 AS precedence,  -- quote precedence (lowest ID kind; offerte, not yet billed)
    c.status, q.created_on AS modified_on, 'nxt.dbo.quote' AS source_ref,
    ROW_NUMBER() OVER (PARTITION BY v.value_norm, CAST(c.id AS varchar(24))
                       ORDER BY q.created_on DESC) AS rn
  FROM nxt.dbo.quote AS q
  JOIN nxt.dbo.customer AS c
    ON c.id_org = q.customer_id_org AND c.environment_id = q.environment_id
  LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
  CROSS APPLY (VALUES
    /* numeric id_org */
    (CAST(q.id_org AS nvarchar(256))),
    /* branded reference with the leading alpha brand prefix stripped + leading
       zeros removed → the bare id_org form. NULL when reference is empty/non-branded;
       filtered out below. "SB017092" → "17092". */
    (CASE
       WHEN q.reference IS NOT NULL
         AND PATINDEX('%[0-9]%', q.reference) > 0
       THEN
         /* drop the leading run of letters, then strip leading zeros */
         CAST(
           SUBSTRING(
             STUFF(q.reference, 1, PATINDEX('%[0-9]%', q.reference) - 1, ''),
             PATINDEX('%[^0]%', STUFF(q.reference, 1, PATINDEX('%[0-9]%', q.reference) - 1, '') + 'X'),
             256
           ) AS nvarchar(256))
       ELSE NULL
     END)
  ) AS v(value_norm)
  WHERE q.environment_id = 'BX'
    AND q.id_org IS NOT NULL
    AND v.value_norm IS NOT NULL
    AND v.value_norm <> ''
) AS z
WHERE z.rn = 1;

/* -----------------------------------------------------------------------------
   3) job_no  (job.internal_id_org → customer via SITE path)
      NOT job.id (a GUID). Customer via job.site_id_org → site → customer (every
      job has a site; total coverage). Order path is an optional future secondary.
   --------------------------------------------------------------------------- */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'job_no';

INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
   precedence, status, modified_on, source_ref)
SELECT DISTINCT
  @swarm, j.environment_id, c.brand_id, 'job_no',
  CAST(j.internal_id_org AS nvarchar(256)),
  CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)), rt.root_party_id,
  1, 3,                                            -- job ≈ site precedence (reached via the site)
  c.status, j.modified_on, 'nxt.dbo.job'
FROM nxt.dbo.job AS j
JOIN nxt.dbo.site AS s
  ON s.id_org = j.site_id_org AND s.environment_id = j.environment_id
JOIN nxt.dbo.customer AS c
  ON c.id = s.customer_id AND c.environment_id = s.environment_id
LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
WHERE j.environment_id = 'BX'
  AND j.internal_id_org IS NOT NULL;

/* -----------------------------------------------------------------------------
   4) po_no  (invoice.reference → customer via BOTH ordering + paying party)
      FREE-TEXT source. PRECISION-SAFE seeding (mandatory for the ≥99% gate):
        - normalize: trim + collapse a trailing ", ," tail to nothing
        - seed ONLY identifier-shaped values: ^[A-Za-z0-9][A-Za-z0-9\-/]{3,}$
          (≥4 chars, no spaces/prose/punctuation, no names/notes)
        - do NOT seed raw reference; junk that no email cites is harmless but the
          shape filter keeps the index clean. is_unique_in_scope re-asserted by the
          proc → non-unique refs become SUGGEST, never AUTO.
   --------------------------------------------------------------------------- */
DELETE FROM zapier.dbo.resolver_index
 WHERE swarm_source = 'debtor-nxt' AND identifier_kind = 'po_no';

/* PK DEDUP (Phase 91 fix): a customer PO reference (invoice.reference) repeats
   across MANY invoices for the same customer (observed up to ~2000×), each with a
   different modified_on → SELECT DISTINCT keeps them all → PK violation on
   (…,value_norm,party_id). Collapse to ONE row per (ref_norm, party_id), keeping
   the latest modified_on, via ROW_NUMBER. The BOTH-party CROSS APPLY can also emit
   the ordering and paying party for one invoice; dedup is per (value, party). */
INSERT INTO zapier.dbo.resolver_index
  (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
   party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
   precedence, status, modified_on, source_ref)
SELECT
  swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
  party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope,
  precedence, status, modified_on, source_ref
FROM (
  SELECT
    @swarm AS swarm_source, n.environment_id, c.brand_id AS scope_key, 'po_no' AS identifier_kind,
    n.ref_norm AS identifier_value_norm,
    CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
    CAST(c.parent_id AS varchar(24)) AS parent_party_id, rt.root_party_id,
    CAST(1 AS bit) AS is_unique_in_scope, 2 AS precedence,  -- PO ≈ order precedence (customer-supplied order ref)
    c.status, n.modified_on, 'nxt.dbo.invoice.reference' AS source_ref,
    ROW_NUMBER() OVER (PARTITION BY n.ref_norm, CAST(c.id AS varchar(24))
                       ORDER BY n.modified_on DESC) AS rn
  FROM (
    SELECT
      inv.environment_id,
      inv.customer_id_org,
      inv.paying_customer_id_org,
      inv.modified_on,
      /* normalize: strip any leading/trailing run of spaces AND commas (NXT free-text
         leaves a trailing ", ," tail on some refs). TRIM(chars FROM ...) removes any
         of the listed characters from both ends in one pass. The identifier-shape
         filter below then rejects anything that still contains a space/comma in the
         MIDDLE (i.e. prose/names), keeping only single clean identifier tokens. */
      TRIM(', ' FROM inv.reference) AS ref_norm
    FROM nxt.dbo.invoice AS inv
    WHERE inv.environment_id = 'BX'
      AND inv.reference IS NOT NULL
      AND LTRIM(RTRIM(inv.reference)) <> ''
  ) AS n
  CROSS APPLY (VALUES (n.customer_id_org), (n.paying_customer_id_org)) AS party(cust_id_org)
  JOIN nxt.dbo.customer AS c
    ON c.id_org = party.cust_id_org AND c.environment_id = n.environment_id
  LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
  WHERE n.environment_id = 'BX'
    AND party.cust_id_org IS NOT NULL
    AND n.ref_norm IS NOT NULL
    AND LEN(n.ref_norm) >= 4
    /* identifier shape: starts alnum, then only alnum / - / ; no spaces, no prose.
       T-SQL LIKE has no quantifiers, so: first char alnum AND no disallowed char
       anywhere (anything outside A-Za-z0-9-/). */
    AND n.ref_norm LIKE '[A-Za-z0-9]%'
    AND n.ref_norm NOT LIKE '%[^A-Za-z0-9/-]%'
) AS z
WHERE z.rn = 1;

/* -----------------------------------------------------------------------------
   cleanup
   --------------------------------------------------------------------------- */
IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;

/* -----------------------------------------------------------------------------
   VERIFY (run after this chunk):
     SELECT identifier_kind, COUNT(*) AS n,
            SUM(CASE WHEN root_party_id IS NOT NULL THEN 1 ELSE 0 END) AS rolled
       FROM zapier.dbo.resolver_index
      WHERE environment_id='BX'
        AND identifier_kind IN ('order_no','quote_no','job_no','po_no')
      GROUP BY identifier_kind;
   --------------------------------------------------------------------------- */
