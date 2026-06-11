/* =============================================================================
   03-resolve-candidates.sql  —  CREATE OR ALTER PROC zapier.dbo.resolve_candidates

   The per-email resolver read (D-09). Applied ONCE direct-SQL (CREATE OR ALTER);
   then invoked per email by the resolver-read Zap (Catch Hook -> SQL action),
   routed via the zapier_tools 'nxt.resolve_candidates' row + nxt-zap-client.

   ESTATE BOUNDARY: SQL Server zapier.dbo over the materialized index — NOT
   supabase/migrations/.

   CONTRACT (LOCKED — must match ResolveCandidateMatchSchema in
   web/lib/automations/debtor-email/nxt-zap-client.ts). Returns one row per
   (identifier -> party):
     identifier_kind, identifier_value_norm, party_id, party_name,
     scope_key, brand_id, parent_party_id, root_party_id,
     is_unique_in_scope, precedence, status
   It returns CANDIDATES, not a verdict — the TS engine owns precedence + the
   AUTO/SUGGEST gate. is_unique_in_scope is the AUTO-eligibility hint.

   GRANULARITY (CR-01, Phase 91 review): is_unique_in_scope is computed per DIRECT
   party_id within an (identifier_kind, value_norm, brand_tier) partition. It is
   consumed by the SELF_AUTH tier (self-auth-match.ts), whose AUTO decision is also
   per-DIRECT party_id — granularities agree there. The NUMBER-search tier
   (identifier-match.ts) decides AUTO on root_party_id (D-04 rollup) and therefore
   does NOT pre-filter on this per-party flag; it gates on distinctRoots===1
   directly (a value spanning >=2 distinct roots fails closed to SUGGEST). Do NOT
   "restore" a per-party is_unique_in_scope pre-filter in the number tier — it
   drops legitimate same-root/distinct-party rollups (recall loss) without adding
   precision, since root-distinctness is the real gate there.

   root_party_id (D-04) is the materialized TRUE top-level customer (the seed/
   refresh walks the multi-level parent chain; the proc cannot). The engine rolls
   a number-search match up to root_party_id; NULL = the party is already a root.

   SCOPING (the cardinal invariants):
     - @environment_id is a HARD filter on EVERY join (default 'BX'). 4,726 BX
       id_orgs collide with UK/IE — this filter is load-bearing.
     - @brand_scope is a TIEBREAKER, NEVER a pre-filter. We do NOT
       WHERE scope_key IN (@brand_scope). 5 SB-mailbox emails resolve to SF
       customers; a hard brand filter would wrongly reject them. Brand only:
         (a) re-computes is_unique_in_scope WITHIN the requested brand set, and
         (b) ranks in-scope brands ahead of out-of-scope (the tiebreak column).
       All candidates are returned regardless of brand.

   SECURITY (T-90-10 / ASVS V5): @identifiers is parsed by OPENJSON as data.
   The extracted identifier is NEVER string-concatenated into dynamic SQL. No
   EXEC / sp_executesql over attacker-influenceable text anywhere in this proc.
   ============================================================================= */

-- NB: CREATE/ALTER PROCEDURE forbids a 3-part (database) prefix — the proc is
-- created in the CURRENT database, so set Beekeeper's active DB to `zapier`
-- before running this file. The proc BODY keeps 3-part zapier.dbo.* references
-- (DML allows them). Callers still EXEC zapier.dbo.resolve_candidates (3-part EXEC is fine).
CREATE OR ALTER PROCEDURE dbo.resolve_candidates
  @identifiers     nvarchar(max),            -- JSON: [{"value_norm":"17008641"}, ...] (kind OPTIONAL).
                                             -- The engine (identifier-match.ts / self-auth-match.ts) sends
                                             -- RAW candidate VALUES with NO kind — it can't know whether a bare
                                             -- number is an invoice_no/order_no/etc. — and filters the returned
                                             -- rows by eligible identifier_kind on the RESULT side. So this proc
                                             -- matches on value_norm and returns the kind; when kind IS supplied
                                             -- it is honoured as an extra constraint. (Cross-kind value collisions
                                             -- surface as ≥2 distinct roots → the engine fails closed to SUGGEST.)
  @environment_id  varchar(4)   = 'BX',      -- HARD filter on every join
  @brand_scope     nvarchar(64) = NULL,      -- CSV of allowed brands for the TIEBREAKER e.g. 'BB,IN' (NULL = none)
  @swarm_source    varchar(32)  = 'debtor-nxt'
AS
BEGIN
  SET NOCOUNT ON;

  /* ---- parse the requested identifiers (parameterized — SQLi guard) ------- */
  -- The engine sends a FLAT JSON array of raw value strings: ["17008641", ...]
  -- (no kind — it filters the returned rows by eligible identifier_kind on the
  -- RESULT side). Parse it WITHOUT a WITH clause so j.[value] is each scalar
  -- string; kind is always NULL here (⇒ match the value across every kind).
  -- The Zapier Code-by-Zapier step must emit exactly JSON.stringify(identifiers).
  DECLARE @ids TABLE (value_norm nvarchar(256) NOT NULL);
  INSERT INTO @ids (value_norm)
  SELECT LTRIM(RTRIM(j.[value]))
  FROM OPENJSON(@identifiers) AS j
  WHERE j.[value] IS NOT NULL AND LTRIM(RTRIM(j.[value])) <> '';

  /* ---- parse the brand tiebreaker set (parameterized) --------------------- */
  DECLARE @brands TABLE (brand nvarchar(8) PRIMARY KEY);
  IF @brand_scope IS NOT NULL AND LTRIM(RTRIM(@brand_scope)) <> ''
  BEGIN
    INSERT INTO @brands (brand)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@brand_scope, ',')
    WHERE LTRIM(RTRIM(value)) <> '';
  END;

  /* ---- candidate set: every (requested identifier -> party) edge in scope.
          environment_id is the HARD filter; brand is NOT filtered here. ------ */
  ;WITH candidates AS (
    SELECT
      ri.identifier_kind,
      ri.identifier_value_norm,
      ri.party_id,
      ri.party_name,
      ri.scope_key,                                   -- = brand_id (tiebreaker col)
      ri.scope_key AS brand_id,                       -- contract field (alias of scope_key)
      ri.parent_party_id,
      ri.root_party_id,                               -- materialized TRUE root (D-04 rollup)
      ri.precedence,
      ri.status,
      /* in-scope flag for the brand TIEBREAKER (no rows are dropped on it) */
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM @brands) THEN 1          -- no brand scope requested → treat all as in-scope
        WHEN ri.scope_key IN (SELECT brand FROM @brands) THEN 1 -- brand in the tiebreaker set
        ELSE 0
      END AS brand_in_scope
    FROM zapier.dbo.resolver_index AS ri
    JOIN @ids AS q
      ON q.value_norm = ri.identifier_value_norm        -- match on VALUE only; kind comes back in the result
    WHERE ri.swarm_source   = @swarm_source
      AND ri.environment_id = @environment_id          -- HARD env filter (every join)
  ),
  /* per (identifier, brand-tiebreak-tier) distinct party — collapses any
     residual line-level dup that survived the seed/refresh (defensive). */
  collapsed AS (
    SELECT DISTINCT
      identifier_kind, identifier_value_norm, party_id, party_name,
      scope_key, brand_id, parent_party_id, root_party_id, precedence, status, brand_in_scope
    FROM candidates
  ),
  /* re-assert uniqueness WITHIN the requested brand scope. A kind is unique
     in scope iff, after the brand tiebreaker preferred the in-scope tier,
     exactly ONE distinct party remains for that identifier in the top tier.
     (Invoice numbers that collide 3-way across BE brands become unique once
      the mailbox brand scope is applied — the load-bearing RESL-06 case.) */
  /* SQL Server forbids COUNT(DISTINCT ...) OVER (...). Standard workaround for
     "# distinct party_id per (identifier, brand-tier) partition":
        distinct_count = DENSE_RANK() ASC + DENSE_RANK() DESC - 1
     (each distinct party_id shares a rank; asc+desc-1 = the partition's cardinality). */
  ranked AS (
    SELECT c.*,
           /* best (lowest) tier per identifier: prefer in-scope brands */
           MAX(c.brand_in_scope) OVER (PARTITION BY c.identifier_kind, c.identifier_value_norm) AS any_in_scope,
           DENSE_RANK() OVER (PARTITION BY c.identifier_kind, c.identifier_value_norm, c.brand_in_scope ORDER BY c.party_id ASC)  AS prk_asc,
           DENSE_RANK() OVER (PARTITION BY c.identifier_kind, c.identifier_value_norm, c.brand_in_scope ORDER BY c.party_id DESC) AS prk_desc
    FROM collapsed AS c
  ),
  scoped AS (
    /* distinct parties in this (identifier, brand-tier) tier */
    SELECT r.*, (r.prk_asc + r.prk_desc - 1) AS parties_in_tier
    FROM ranked AS r
  )
  SELECT
    s.identifier_kind,
    s.identifier_value_norm,
    s.party_id,
    s.party_name,
    s.scope_key,
    s.brand_id,
    s.parent_party_id,
    s.root_party_id,
    /* is_unique_in_scope: true iff this row is in the effective top tier AND
       that tier resolves to exactly one party for the identifier. */
    CAST(
      CASE
        WHEN s.brand_in_scope = s.any_in_scope AND s.parties_in_tier = 1 THEN 1
        ELSE 0
      END AS bit) AS is_unique_in_scope,
    s.precedence,
    s.status
  FROM scoped AS s
  /* TIEBREAKER ordering: in-scope brands first, then by resolution precedence,
     then party_id for determinism. NOTHING is filtered out by brand. */
  ORDER BY
    s.identifier_kind,
    s.identifier_value_norm,
    s.brand_in_scope DESC,            -- in-scope brand wins the tiebreak (NOT a filter)
    s.precedence ASC,
    s.party_id ASC;
END;
