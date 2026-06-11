/* =============================================================================
   00-index-tables.sql  —  zapier.dbo entity-resolution materialized index (Layer A)
   Phase 90 (P0 — Resolver substrate). Operator-/Zap-applied SQL Server T-SQL.

   ESTATE BOUNDARY: this is SQL Server `zapier.dbo` over `nxt.dbo.*` — it is NOT
   `supabase/migrations/`. Apply in the operator direct-SQL session (see README.md).

   DESIGN: GENERIC-RESOLUTION-DESIGN.md §Layer A (projection row shape),
           NXT-ADDENDUM.md (nxt.dbo column model), DESIGN-GUIDE §0.10 A10
           (materialize ONLY customer / contact_person.email / site /
            invoice.exact_invoice_id).

   TABLE-SPLIT CHOICE (documented per Task 1):
     We use ONE unified lookup table `zapier.dbo.resolver_index` carrying the
     Layer-A projection columns — every materialized identifier_kind lands here
     as (swarm_source, environment_id, identifier_kind, identifier_value_norm) →
     party. The proc reads ONE indexed table, so brand-tiebreaker + scope logic
     lives in one place and cannot drift per kind. RATIONALE: 4 parallel
     per-kind tables would force the proc to UNION 4 shapes; the unified table
     keeps `resolve_candidates` a single covered-index seek per identifier.

     ALONGSIDE it we keep a richer `zapier.dbo.resolver_customer` projection
     (id / id_org / brand_id / parent_id / previous_customer_id / email /
      postcode / status) so P1 (previous_customer_id fallback) and P2
      (domain + postcode candidate set) can read the customer columns directly
      without re-hitting live nxt. In P0 the engine only reads `resolver_index`;
      `resolver_customer` is the forward-store for P1/P2.

   SCOPING INVARIANTS (enforced here as a BX-only store; the seed + refresh +
   proc re-assert — belt-and-suspenders):
     - environment_id is materialized but ONLY 'BX' rows are ever inserted
       (HARD filter at seed/refresh; the proc re-asserts @environment_id).
     - scope_key = brand_id is a TIEBREAKER column, never a pre-filter.
     - is_unique_in_scope set per kind by the seed (exact kinds true;
       domain/postcode false).
   ============================================================================= */

/* -----------------------------------------------------------------------------
   1) Unified Layer-A lookup index — the table `resolve_candidates` reads.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('zapier.dbo.resolver_index', 'U') IS NULL
BEGIN
  CREATE TABLE zapier.dbo.resolver_index (
    swarm_source           varchar(32)    NOT NULL,   -- 'debtor-nxt' etc. (which backend owns the row)
    environment_id         varchar(4)     NOT NULL,   -- HARD scope; only 'BX' rows are inserted
    scope_key              nvarchar(8)    NULL,        -- = brand_id (SB/FI/BB/SF/SN/SS/IN) — TIEBREAKER, not a filter
    identifier_kind        varchar(32)    NOT NULL,    -- invoice_no | customer_no | site_no | email_domain | email_address
    identifier_value_norm  nvarchar(256)  NOT NULL,    -- normalized lookup key (lower(domain), digits invoice_no, etc.)
    party_id               varchar(24)    NOT NULL,    -- composite customer.id e.g. 'BX594313' (the LOCKED customer_account_id)
    party_name             nvarchar(256)  NOT NULL,
    parent_party_id        varchar(24)    NULL,        -- IMMEDIATE parent customer.id (FM roll-up, OPT-5)
    root_party_id          varchar(24)    NULL,        -- TRUE top-level customer.id (D-04 multi-level rollup; proc can't walk a chain, so it is materialized here)
    is_unique_in_scope     bit            NOT NULL,     -- true = exact (auto-eligible); false = candidate-set kind
    precedence             int            NULL,         -- resolution priority hint (invoice 1 < site 3 < customer 4)
    status                 nvarchar(16)   NULL,         -- customer status (active/stopped) for the narrower
    modified_on            datetime2(3)   NULL,         -- watermark for the delta refresh
    source_ref             nvarchar(64)   NULL,         -- provenance e.g. 'nxt.dbo.invoice'
    CONSTRAINT PK_resolver_index PRIMARY KEY
      (swarm_source, environment_id, identifier_kind, identifier_value_norm, party_id)
  );
END;

/* root_party_id (D-04) — add idempotently for an already-applied estate. The
   CREATE TABLE above carries it for a fresh apply; this ALTER backfills the
   column when the table already exists from Phase 90. */
IF COL_LENGTH('zapier.dbo.resolver_index', 'root_party_id') IS NULL
BEGIN
  ALTER TABLE zapier.dbo.resolver_index ADD root_party_id varchar(24) NULL;
END;

/* The covering seek index the proc relies on: a whole candidate set for one
   (kind, value) resolves in one indexed seek. INCLUDE the projection columns so
   resolve_candidates never key-lookups back to the heap. root_party_id is a
   COVERED column (the proc returns it but never key-seeks on it). */
IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = 'IX_resolver_index_lookup'
             AND object_id = OBJECT_ID('zapier.dbo.resolver_index'))
  AND NOT EXISTS (SELECT 1
                  FROM sys.index_columns ic
                  JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
                  WHERE ic.object_id = OBJECT_ID('zapier.dbo.resolver_index')
                    AND ic.index_id  = INDEXPROPERTY(OBJECT_ID('zapier.dbo.resolver_index'), 'IX_resolver_index_lookup', 'IndexID')
                    AND col.name = 'root_party_id')
BEGIN
  /* INCLUDE list changed → recreate so root_party_id becomes a covered column. */
  DROP INDEX IX_resolver_index_lookup ON zapier.dbo.resolver_index;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_resolver_index_lookup'
                 AND object_id = OBJECT_ID('zapier.dbo.resolver_index'))
BEGIN
  CREATE INDEX IX_resolver_index_lookup
    ON zapier.dbo.resolver_index (swarm_source, environment_id, identifier_kind, identifier_value_norm)
    INCLUDE (scope_key, party_id, party_name, parent_party_id, root_party_id, is_unique_in_scope, precedence, status);
END;

/* -----------------------------------------------------------------------------
   2) Richer customer projection — forward-store for P1 (previous_customer_id
      fallback) + P2 (domain + postcode candidate set). NOT read by the P0 engine.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('zapier.dbo.resolver_customer', 'U') IS NULL
BEGIN
  CREATE TABLE zapier.dbo.resolver_customer (
    environment_id         varchar(4)     NOT NULL,   -- only 'BX' inserted
    id                     varchar(24)    NOT NULL,    -- composite customer.id e.g. 'BX594313'
    id_org                 bigint         NOT NULL,    -- per-region klantnummer (repeats across regions — NOT a global key)
    brand_id               nvarchar(8)    NULL,        -- SB/FI/BB/SF/SN/SS/IN
    parent_id              varchar(24)    NULL,        -- parent customer.id (FM roll-up)
    previous_customer_id   nvarchar(32)   NULL,        -- migration id customers still cite (P1 fallback)
    email                  nvarchar(256)  NULL,        -- customer.email (domain/address candidate source)
    postcode               nvarchar(16)   NULL,        -- customer.postcode (P2 narrower)
    status                 nvarchar(16)   NULL,         -- active/stopped
    modified_on            datetime2(3)   NULL,         -- watermark
    CONSTRAINT PK_resolver_customer PRIMARY KEY (id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_resolver_customer_idorg'
                 AND object_id = OBJECT_ID('zapier.dbo.resolver_customer'))
BEGIN
  CREATE INDEX IX_resolver_customer_idorg
    ON zapier.dbo.resolver_customer (environment_id, id_org);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_resolver_customer_prevcust'
                 AND object_id = OBJECT_ID('zapier.dbo.resolver_customer'))
BEGIN
  CREATE INDEX IX_resolver_customer_prevcust
    ON zapier.dbo.resolver_customer (environment_id, previous_customer_id)
    WHERE previous_customer_id IS NOT NULL;
END;

/* -----------------------------------------------------------------------------
   3) Watermark — one row per materialized source table; the refresh proc reads
      + advances last_modified_on for the delta MERGE.
   --------------------------------------------------------------------------- */
IF OBJECT_ID('zapier.dbo.resolver_watermark', 'U') IS NULL
BEGIN
  CREATE TABLE zapier.dbo.resolver_watermark (
    table_name        varchar(64)   NOT NULL PRIMARY KEY,  -- 'customer' | 'contact_email' | 'site' | 'invoice'
    last_modified_on  datetime2(3)  NOT NULL DEFAULT '1900-01-01',
    refreshed_at      datetime2(3)  NULL
  );
END;

/* Seed the four watermark rows at the floor so the very first refresh tick is a
   full delta pass (the one-time seed in 01-seed.sql is the bulk load; the
   watermark is bumped to the seed high-water there). */
MERGE zapier.dbo.resolver_watermark AS tgt
USING (VALUES ('customer'), ('contact_email'), ('site'), ('invoice')) AS src(table_name)
   ON tgt.table_name = src.table_name
WHEN NOT MATCHED THEN
  INSERT (table_name, last_modified_on) VALUES (src.table_name, '1900-01-01');
