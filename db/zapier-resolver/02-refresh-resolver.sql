/* =============================================================================
   02-refresh-resolver.sql  —  CREATE OR ALTER PROC zapier.dbo.refresh_resolver

   The recurring delta refresh. Applied ONCE direct-SQL (CREATE OR ALTER); then
   run every 2-4h by a scheduled Zap (Schedule trigger -> SQL action: EXEC
   zapier.dbo.refresh_resolver). NOT a SQL Server Agent job (§0.2 / §0.10 A1).

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   Delta MERGE per materialized table on the modified_on watermark, source filtered
   to environment_id = 'BX' (HARD — re-asserts the seed invariant).

   GAP-LOOKBACK: read last_modified_on, then subtract 6h before filtering the
   source. This mirrors the CLAUDE.md Inngest cron-watermark rule — the first
   tick after a gap (e.g. Monday 06:00) must re-scan weekend rows whose
   modified_on lands inside the gap. The MERGE is idempotent (re-MERGING an
   already-current row is a no-op UPDATE), so over-scanning is safe.

   The delta is tiny (BX adds ~7 customers / ~80 invoices per day), so the whole
   proc fits inside the Zapier SQL action limit (write-path MERGE live-probed).
   ============================================================================= */

-- NB: CREATE/ALTER PROCEDURE forbids a 3-part (database) prefix — the proc is
-- created in the CURRENT database, so set Beekeeper's active DB to `zapier`
-- before running this file. The proc BODY keeps 3-part zapier.dbo.* references
-- (DML allows them), so it resolves the same regardless of caller DB context.
CREATE OR ALTER PROCEDURE dbo.refresh_resolver
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @swarm        varchar(32) = 'debtor-nxt';
  DECLARE @lookback_hrs int         = 6;   -- gap re-scan window

  /* ---- watermarks (with gap-lookback applied) ---------------------------- */
  DECLARE @wm_customer datetime2(3) =
    DATEADD(hour, -@lookback_hrs, (SELECT last_modified_on FROM zapier.dbo.resolver_watermark WHERE table_name='customer'));
  DECLARE @wm_site datetime2(3) =
    DATEADD(hour, -@lookback_hrs, (SELECT last_modified_on FROM zapier.dbo.resolver_watermark WHERE table_name='site'));
  DECLARE @wm_invoice datetime2(3) =
    DATEADD(hour, -@lookback_hrs, (SELECT last_modified_on FROM zapier.dbo.resolver_watermark WHERE table_name='invoice'));
  DECLARE @wm_contact datetime2(3) =
    DATEADD(hour, -@lookback_hrs, (SELECT last_modified_on FROM zapier.dbo.resolver_watermark WHERE table_name='contact_email'));

  /* ======================================================================== *
     0) root_party_id (D-04) — resolve the TRUE top-level customer for EVERY BX
        customer via a recursive parent-chain CTE. parent_id is composite
        ("BX477375") and references customer.id within the SAME environment_id;
        NULL/self = root. ~12.2% of BX customers are parented and the chain can
        be deeper than one level — the proc cannot walk a chain, so the resolved
        root is materialized here and joined into the number-kind MERGE blocks.

        This is computed over the FULL BX customer set (NOT delta-keyed): a row's
        root can change when an ANCESTOR is re-parented without the row itself
        being touched, so the delta watermark is insufficient for the chain. The
        set is ~74.5k rows — cheap to walk once per refresh.
     ======================================================================== */
  IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;

  ;WITH chain AS (
    /* anchor: every BX customer, starting at itself */
    SELECT CAST(c.id AS varchar(24))        AS id,
           CAST(c.parent_id AS varchar(24)) AS parent_id,
           CAST(c.id AS varchar(24))        AS cur,        -- cursor walking up the chain
           0                                AS depth
    FROM nxt.dbo.customer AS c
    WHERE c.environment_id = 'BX'
    UNION ALL
    /* recurse: replace cur with its parent, staying within BX */
    SELECT ch.id, CAST(p.parent_id AS varchar(24)) AS parent_id,
           CAST(p.id AS varchar(24)) AS cur, ch.depth + 1
    FROM chain AS ch
    JOIN nxt.dbo.customer AS p
      ON p.id = ch.parent_id AND p.environment_id = 'BX'
    WHERE ch.parent_id IS NOT NULL
      AND ch.parent_id <> ch.cur          -- self-parent = root (guard self-loop)
      AND ch.depth < 32                   -- cycle guard (re-parenting loops can't blow the stack)
  )
  SELECT id,
         /* the root is the `cur` at the deepest walked level for this id. Pack
            (depth, cur) into one string with ZERO-PADDED depth so a plain MAX()
            picks the deepest row lexically (depth 2 < 10 numerically AND as
            '02' < '10' lexically), then unpack the cur after the '|'. */
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

  /* ======================================================================== *
     1) resolver_customer  (richer projection; P1/P2 forward-store)
     ======================================================================== */
  MERGE zapier.dbo.resolver_customer AS tgt
  USING (
    SELECT c.environment_id,
           CAST(c.id AS varchar(24)) AS id, c.id_org, c.brand_id,
           CAST(c.parent_id AS varchar(24)) AS parent_id,
           c.previous_customer_id, c.email, c.postcode, c.status, c.modified_on
    FROM nxt.dbo.customer AS c
    WHERE c.environment_id = 'BX'           -- HARD filter on the MERGE source
      AND c.modified_on > @wm_customer
  ) AS src
  ON tgt.id = src.id
  WHEN MATCHED THEN UPDATE SET
    tgt.id_org = src.id_org, tgt.brand_id = src.brand_id, tgt.parent_id = src.parent_id,
    tgt.previous_customer_id = src.previous_customer_id, tgt.email = src.email,
    tgt.postcode = src.postcode, tgt.status = src.status, tgt.modified_on = src.modified_on
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (environment_id, id, id_org, brand_id, parent_id, previous_customer_id, email, postcode, status, modified_on)
    VALUES (src.environment_id, src.id, src.id_org, src.brand_id, src.parent_id,
            src.previous_customer_id, src.email, src.postcode, src.status, src.modified_on);

  /* ======================================================================== *
     2) resolver_index — customer_no (klantnummer = id_org)
     ======================================================================== */
  MERGE zapier.dbo.resolver_index AS tgt
  USING (
    SELECT @swarm AS swarm_source, c.environment_id, c.brand_id AS scope_key,
           'customer_no' AS identifier_kind,
           CAST(c.id_org AS nvarchar(256)) AS identifier_value_norm,
           CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
           CAST(c.parent_id AS varchar(24)) AS parent_party_id,
           rt.root_party_id,
           CAST(1 AS bit) AS is_unique_in_scope, 4 AS precedence, c.status,
           c.modified_on, 'nxt.dbo.customer' AS source_ref
    FROM nxt.dbo.customer AS c
    LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
    WHERE c.environment_id = 'BX' AND c.id_org IS NOT NULL
      AND c.modified_on > @wm_customer
  ) AS src
  ON  tgt.swarm_source = src.swarm_source AND tgt.environment_id = src.environment_id
  AND tgt.identifier_kind = src.identifier_kind
  AND tgt.identifier_value_norm = src.identifier_value_norm
  AND tgt.party_id = src.party_id
  WHEN MATCHED THEN UPDATE SET
    tgt.scope_key = src.scope_key, tgt.party_name = src.party_name,
    tgt.parent_party_id = src.parent_party_id, tgt.root_party_id = src.root_party_id,
    tgt.is_unique_in_scope = src.is_unique_in_scope,
    tgt.precedence = src.precedence, tgt.status = src.status,
    tgt.modified_on = src.modified_on, tgt.source_ref = src.source_ref
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
     party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope, precedence, status, modified_on, source_ref)
    VALUES (src.swarm_source, src.environment_id, src.scope_key, src.identifier_kind, src.identifier_value_norm,
            src.party_id, src.party_name, src.parent_party_id, src.root_party_id, src.is_unique_in_scope, src.precedence, src.status, src.modified_on, src.source_ref);

  /* ======================================================================== *
     3) resolver_index — site_no
     ======================================================================== */
  MERGE zapier.dbo.resolver_index AS tgt
  USING (
    SELECT @swarm AS swarm_source, s.environment_id, c.brand_id AS scope_key,
           'site_no' AS identifier_kind,
           CAST(s.id_org AS nvarchar(256)) AS identifier_value_norm,
           CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
           CAST(c.parent_id AS varchar(24)) AS parent_party_id,
           rt.root_party_id,
           CAST(1 AS bit) AS is_unique_in_scope, 3 AS precedence, c.status,
           s.modified_on, 'nxt.dbo.site' AS source_ref
    FROM nxt.dbo.site AS s
    JOIN nxt.dbo.customer AS c ON c.id = s.customer_id AND c.environment_id = s.environment_id
    LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
    WHERE s.environment_id = 'BX' AND s.id_org IS NOT NULL
      AND s.modified_on > @wm_site
  ) AS src
  ON  tgt.swarm_source = src.swarm_source AND tgt.environment_id = src.environment_id
  AND tgt.identifier_kind = src.identifier_kind
  AND tgt.identifier_value_norm = src.identifier_value_norm
  AND tgt.party_id = src.party_id
  WHEN MATCHED THEN UPDATE SET
    tgt.scope_key = src.scope_key, tgt.party_name = src.party_name,
    tgt.parent_party_id = src.parent_party_id, tgt.root_party_id = src.root_party_id,
    tgt.precedence = src.precedence,
    tgt.status = src.status, tgt.modified_on = src.modified_on, tgt.source_ref = src.source_ref
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
     party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope, precedence, status, modified_on, source_ref)
    VALUES (src.swarm_source, src.environment_id, src.scope_key, src.identifier_kind, src.identifier_value_norm,
            src.party_id, src.party_name, src.parent_party_id, src.root_party_id, src.is_unique_in_scope, src.precedence, src.status, src.modified_on, src.source_ref);

  /* ======================================================================== *
     4) resolver_index — invoice_no (exact_invoice_id; DISTINCT customer_id_org)
        Do NOT filter on the is_main flag. Re-MERGE collapses line-level dups.
     ======================================================================== */
  MERGE zapier.dbo.resolver_index AS tgt
  USING (
    SELECT @swarm AS swarm_source, inv.environment_id, c.brand_id AS scope_key,
           'invoice_no' AS identifier_kind,
           CAST(inv.exact_invoice_id AS nvarchar(256)) AS identifier_value_norm,
           CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
           CAST(c.parent_id AS varchar(24)) AS parent_party_id,
           rt.root_party_id,
           CAST(1 AS bit) AS is_unique_in_scope, 1 AS precedence, c.status,
           inv.modified_on, 'nxt.dbo.invoice' AS source_ref
    FROM (
      SELECT DISTINCT
             i.environment_id, i.exact_invoice_id, i.customer_id_org,
             MAX(i.modified_on) OVER (PARTITION BY i.environment_id, i.exact_invoice_id, i.customer_id_org) AS modified_on
      FROM nxt.dbo.invoice AS i
      WHERE i.environment_id = 'BX'
        AND i.exact_invoice_id IS NOT NULL
        AND i.modified_on > @wm_invoice
    ) AS inv
    JOIN nxt.dbo.customer AS c ON c.id_org = inv.customer_id_org AND c.environment_id = inv.environment_id
    LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
    WHERE inv.environment_id = 'BX'
  ) AS src
  ON  tgt.swarm_source = src.swarm_source AND tgt.environment_id = src.environment_id
  AND tgt.identifier_kind = src.identifier_kind
  AND tgt.identifier_value_norm = src.identifier_value_norm
  AND tgt.party_id = src.party_id
  WHEN MATCHED THEN UPDATE SET
    tgt.scope_key = src.scope_key, tgt.party_name = src.party_name,
    tgt.parent_party_id = src.parent_party_id, tgt.root_party_id = src.root_party_id,
    tgt.status = src.status,
    tgt.modified_on = src.modified_on, tgt.source_ref = src.source_ref
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
     party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope, precedence, status, modified_on, source_ref)
    VALUES (src.swarm_source, src.environment_id, src.scope_key, src.identifier_kind, src.identifier_value_norm,
            src.party_id, src.party_name, src.parent_party_id, src.root_party_id, src.is_unique_in_scope, src.precedence, src.status, src.modified_on, src.source_ref);

  /* ======================================================================== *
     5) resolver_index — email_address + email_domain (customer ∪ contact_person)
        Delta-keyed on each source's modified_on. Domain rows is_unique_in_scope=0.
     ======================================================================== */
  ;WITH email_src AS (
    /* customer.email */
    SELECT c.environment_id, c.brand_id AS scope_key, LOWER(LTRIM(RTRIM(c.email))) AS addr_norm,
           CAST(c.id AS varchar(24)) AS party_id, c.name AS party_name,
           CAST(c.parent_id AS varchar(24)) AS parent_party_id, rt.root_party_id,
           c.status, c.modified_on,
           'nxt.dbo.customer.email' AS source_ref
    FROM nxt.dbo.customer AS c
    LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
    WHERE c.environment_id = 'BX' AND c.email LIKE '%@%' AND c.modified_on > @wm_customer
    UNION ALL
    /* contact_person.email */
    SELECT cp.environment_id, c.brand_id, LOWER(LTRIM(RTRIM(cp.email))),
           CAST(c.id AS varchar(24)), c.name, CAST(c.parent_id AS varchar(24)), rt.root_party_id,
           c.status, cp.modified_on, 'nxt.dbo.contact_person.email'
    FROM nxt.dbo.contact_person AS cp
    JOIN nxt.dbo.customer AS c ON c.id = cp.customer_id AND c.environment_id = cp.environment_id
    LEFT JOIN #cust_root AS rt ON rt.id = CAST(c.id AS varchar(24))
    WHERE cp.environment_id = 'BX' AND cp.email LIKE '%@%' AND cp.modified_on > @wm_contact
  )
  MERGE zapier.dbo.resolver_index AS tgt
  USING (
    /* email_address rows — one row per (env, addr, party) = the merge key.
       The same address comes from customer.email AND contact_person.email;
       GROUP BY collapses both so the MERGE never matches a target row twice. */
    SELECT @swarm AS swarm_source, environment_id, MAX(scope_key) AS scope_key,
           'email_address' AS identifier_kind, addr_norm AS identifier_value_norm,
           party_id, MAX(party_name) AS party_name, MAX(parent_party_id) AS parent_party_id,
           MAX(root_party_id) AS root_party_id,
           CAST(1 AS bit) AS is_unique_in_scope, 10 AS precedence, MAX(status) AS status,
           MAX(modified_on) AS modified_on, MAX(source_ref) AS source_ref
    FROM email_src
    GROUP BY environment_id, addr_norm, party_id
    UNION ALL
    /* email_domain rows — one row per (env, domain, party) (candidate set) */
    SELECT @swarm, environment_id, MAX(scope_key), 'email_domain',
           SUBSTRING(addr_norm, CHARINDEX('@', addr_norm) + 1, 256) AS identifier_value_norm,
           party_id, MAX(party_name), MAX(parent_party_id), MAX(root_party_id),
           CAST(0 AS bit), 20, MAX(status), MAX(modified_on), MAX(source_ref)
    FROM email_src
    WHERE CHARINDEX('@', addr_norm) > 0
    GROUP BY environment_id, SUBSTRING(addr_norm, CHARINDEX('@', addr_norm) + 1, 256), party_id
  ) AS src
  ON  tgt.swarm_source = src.swarm_source AND tgt.environment_id = src.environment_id
  AND tgt.identifier_kind = src.identifier_kind
  AND tgt.identifier_value_norm = src.identifier_value_norm
  AND tgt.party_id = src.party_id
  WHEN MATCHED THEN UPDATE SET
    tgt.scope_key = src.scope_key, tgt.party_name = src.party_name,
    tgt.parent_party_id = src.parent_party_id, tgt.root_party_id = src.root_party_id,
    tgt.status = src.status,
    tgt.modified_on = src.modified_on, tgt.source_ref = src.source_ref
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (swarm_source, environment_id, scope_key, identifier_kind, identifier_value_norm,
     party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope, precedence, status, modified_on, source_ref)
    VALUES (src.swarm_source, src.environment_id, src.scope_key, src.identifier_kind, src.identifier_value_norm,
            src.party_id, src.party_name, src.parent_party_id, src.root_party_id, src.is_unique_in_scope, src.precedence, src.status, src.modified_on, src.source_ref);

  /* ======================================================================== *
     5b) WR-04 (Phase 91 review) — re-stamp root_party_id on the BULK-SEEDED
         number kinds from the freshly computed #cust_root every refresh.

         po_no / order_no / job_no / quote_no / previous_customer_id are seeded
         once by 01h/01i and are NOT row-level delta-maintained here (adding new
         orders/quotes is a tolerable recall gap). BUT their root_party_id is a
         PRECISION surface: when a customer is re-parented, #cust_root above
         recomputes the new root, yet these rows would keep their seed-time root
         and the number back-search would AUTO-resolve to a root that is no longer
         the billing parent. This UPDATE mirrors how the maintained kinds carry
         rt.root_party_id, closing the staleness hole without re-seeding the rows.

         Set-based, idempotent, environment_id='BX' hard-filtered. Keyed on
         party_id = CAST(customer.id AS varchar(24)) = #cust_root.id. Only touches
         rows whose root actually changed (the predicate makes a no-op refresh a
         genuine no-op even on the NULL<->value boundary).
     ======================================================================== */
  UPDATE ri
     SET ri.root_party_id = rt.root_party_id
  FROM zapier.dbo.resolver_index AS ri
  JOIN #cust_root AS rt ON rt.id = ri.party_id
  WHERE ri.swarm_source   = @swarm
    AND ri.environment_id = 'BX'
    AND ri.identifier_kind IN
        ('po_no','order_no','job_no','quote_no','previous_customer_id')
    AND ( (ri.root_party_id IS NULL     AND rt.root_party_id IS NOT NULL)
       OR (ri.root_party_id IS NOT NULL AND rt.root_party_id IS NULL)
       OR (ri.root_party_id <> rt.root_party_id) );

  /* ======================================================================== *
     6) Advance the watermarks to the new high-water (the REAL last_modified_on,
        NOT the lookback-shifted one — the lookback is a read-side widening only).
     ======================================================================== */
  UPDATE w
     SET w.last_modified_on =
           CASE w.table_name
             WHEN 'customer'      THEN ISNULL((SELECT MAX(modified_on) FROM nxt.dbo.customer       WHERE environment_id='BX'), w.last_modified_on)
             WHEN 'site'          THEN ISNULL((SELECT MAX(modified_on) FROM nxt.dbo.site           WHERE environment_id='BX'), w.last_modified_on)
             WHEN 'invoice'       THEN ISNULL((SELECT MAX(modified_on) FROM nxt.dbo.invoice        WHERE environment_id='BX'), w.last_modified_on)
             WHEN 'contact_email' THEN ISNULL((SELECT MAX(modified_on) FROM nxt.dbo.contact_person WHERE environment_id='BX'), w.last_modified_on)
           END,
         w.refreshed_at = SYSUTCDATETIME()
  FROM zapier.dbo.resolver_watermark AS w;

  /* NOTE: the number-search kinds (po_no/order_no/job_no/quote_no) + the
     previous_customer_id kind are bulk-seeded by 01h/01i. Their root_party_id is
     NOW re-stamped every refresh from the freshly computed #cust_root (block 5b,
     WR-04) so a re-parented customer's root cannot go stale — the precision
     surface is maintained. Only ROW ADDITIONS (a brand-new order/quote created
     after the one-time seed) remain non-delta-maintained — a tolerable recall gap
     (those rows fall through to the legacy live path). A future extension can add
     orders/quote/job watermark rows + MERGE blocks that reuse #cust_root above;
     the column + INCLUDE are already in place. */

  IF OBJECT_ID('tempdb..#cust_root') IS NOT NULL DROP TABLE #cust_root;
END;
