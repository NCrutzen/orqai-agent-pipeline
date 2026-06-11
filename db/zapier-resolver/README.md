# `zapier.dbo` Resolver Substrate — Operator Runbook

**Phase 90 (P0 — Resolver substrate + bugfixes). Created 2026-06-01. Finalized Plan 90-04.**

This directory holds the **SQL Server `zapier.dbo` estate** for the v8.2 entity-resolution
substrate: hand-/Zap-applied T-SQL (the materialized index tables, the `refresh_resolver` proc,
the `resolve_candidates` proc). It is the **durable record of the SQL Server + Zapier runtime
state**, neither of which lives in git.

> **This estate is NOT `supabase/migrations/`.** Those migrations are auto-applied Postgres
> by tooling. The `.sql` files here are **operator-applied** against SQL Server (`zapier.dbo`,
> reading from `nxt.dbo`). Never mix the two — see CLAUDE.md and 90-RESEARCH §Pitfall 2.

---

## Estate boundary & naming note (read before writing any label)

These files are **operator-/Zap-applied SQL Server T-SQL in `zapier.dbo`** — never placed in
`supabase/migrations/` (D-08, Pitfall 2).

Both the legacy resolver and the new resolver query NXT **via Zapier** — the only difference is
**which SQL object the one Zapier SQL action hits**. Label internal paths by the SQL target:

- **legacy live-`nxt` per-signal views** — the old per-signal lookups (`lookupSenderToAccount`,
  `lookupIdentifierToAccount`) hitting live `nxt` cross-DB views.
- **single-call `zapier.dbo.resolve_candidates` index** — the new one-call materialized-index proc.

**Never** label these "live-nxt vs zapier" — that phrasing is wrong (both go via Zapier) and is
**prohibited** in this runbook and in code comments.

---

## Architecture in one breath

- **No copy of NXT data into Supabase.** NXT masterdata is materialized into indexed tables in
  `zapier.dbo`, scoped to `environment_id = 'BX'` (hard filter).
- `brand_id` (= `scope_key`) is a **tiebreaker, NOT** a `WHERE brand = mailbox_brand` pre-filter.
- Materialize ONLY `customer_no`, `email_address`/`email_domain`, `site_no`, `invoice_no`
  (from `nxt.dbo.invoice.exact_invoice_id`). prev-customer / VAT / KvK / order / quote stay
  **live-`nxt` fallback** (not materialized in P0).
- Collapse multi-row invoices via `DISTINCT customer_id_org` — **do NOT filter on the `is_main`
  flag** (BE invoices live as `is_main=false`; filtering drops ~99%).
- `resolve_candidates` is a **stored procedure** that returns the whole candidate set +
  `is_unique_in_scope` in one call. It returns **candidates, not a verdict** — the TS engine owns
  precedence + the AUTO/SUGGEST gate.

The 3-operation split (see 90-RESEARCH §1):

| Operation | Home | Mechanism | Frequency |
|-----------|------|-----------|-----------|
| **Seed** | SQL Server, operator session | direct-SQL `INSERT…SELECT FROM nxt.dbo.* WHERE environment_id='BX'` | one-time (+ re-seed on schema change) |
| **Refresh** | Scheduled Zap | `Schedule trigger → SQL action: EXEC zapier.dbo.refresh_resolver` (delta MERGE) | every 2–4h |
| **Read** | Vercel/Inngest → `nxt-zap-client` → Zapier SQL action | `EXEC resolve_candidates @identifiers, @environment_id='BX', @brand_scope` | per email |

Only **Read + Refresh** use Zapier. The seed never touches the Zapier action (no 30s timeout).

---

## The `.sql` files in this directory

| File | What it creates | Applied by |
|------|-----------------|------------|
| `00-index-tables.sql` | `zapier.dbo.resolver_index` (unified Layer-A lookup) + `zapier.dbo.resolver_customer` (richer P1/P2 forward-store) + `zapier.dbo.resolver_watermark` + indexes | direct-SQL (step 1) |
| `01a-seed-customer.sql` … `01i-seed-previous-customer.sql` | one-time seed, **split into small per-kind chunks** — each a scoped `DELETE` + `INSERT…SELECT FROM nxt.dbo.* WHERE environment_id='BX'` (01a resolver_customer, 01b customer_no, 01c site_no, 01d invoice_no, 01e email_address, 01f email_domain, 01g watermark bump, 01h po_no/order_no/job_no/quote_no, 01i previous_customer_id). Each chunk is independently runnable + idempotent (safe to re-run after a dropped connection). 01h/01i materialize `root_party_id` (D-04). | direct-SQL (step 1) |
| `02-refresh-resolver.sql` | `CREATE OR ALTER PROCEDURE zapier.dbo.refresh_resolver` — delta MERGE on `modified_on` (BX-scoped source, 6h gap-lookback) | direct-SQL once (step 2); runs via the refresh Zap (step 3) |
| `03-resolve-candidates.sql` | `CREATE OR ALTER PROCEDURE zapier.dbo.resolve_candidates @identifiers, @environment_id='BX', @brand_scope` — parameterized (OPENJSON), candidates-not-verdict | direct-SQL once (step 2); runs via the resolver-read Zap (step 4) |

**Table-split choice:** a single unified `resolver_index` table backs the proc (one covered-index
seek per identifier), alongside a richer `resolver_customer` projection the later P1/P2 phases read.
See the header comment in `00-index-tables.sql`.

**Security:** `resolve_candidates` is **parameterized T-SQL** (`@identifiers` parsed by `OPENJSON` as
data) — the extracted identifier is **never** string-concatenated into dynamic SQL (T-90-10 / ASVS V5
SQL-injection guard).

---

## SQL client note (GO-free — Beekeeper Studio supported)

The `.sql` files are **GO-free**: each file is meant to be run as a **single batch / statement-block**
(no client-side `GO` separators). This means **Beekeeper Studio works** — it sends the script straight
to SQL Server, which has no `GO` keyword (`GO` is a *client-only* batch separator understood only by
SSMS / Azure Data Studio / `sqlcmd`; sending it to SQL Server raises `Incorrect syntax near 'GO'`).
Run each file's whole contents at once (e.g. "Run" / Ctrl+Enter on the full editor buffer). The
`:r <file>` lines below are sqlcmd-style include shorthand — in Beekeeper just open each file and run it.

---

## Operator sequence (the LOCKED order — do these IN ORDER)

> Assumption A3 / Open Question 4 sequencing. The Zaps must exist (with their catch-hook URL)
> before the `zapier_tools` row is functional and before the equality dry-run can run.
> Steps 1–2 + 6 (seed, procs, RESL-06 backtest) MUST complete in the Plan 90-04 operator gate;
> steps 3–5 + 7–8 may run here or be sequenced into Plan 90-06's cutover gate.

### 1. One-time direct-SQL seed

In the operator direct-SQL session (SSMS / Azure Data Studio / **Beekeeper Studio** — the files are
GO-free, see the SQL client note above) with a direct login (`nxt.dbo` read confirmed 2026-06-01, full
`zapier.dbo` DDL). **No Zapier.** Run each file's full contents in order:

The seed is **split into small per-kind chunk files** so each finishes in seconds and a re-run
after a dropped Beekeeper connection is safe. Run them **one at a time, in order** (each chunk is
GO-free — run its whole contents at once):

```
:r 00-index-tables.sql           -- CREATE the resolver_index / resolver_customer / resolver_watermark tables + indexes
:r 01a-seed-customer.sql         -- resolver_customer projection (BX)
:r 01b-seed-customer_no.sql      -- customer_no kind
:r 01c-seed-site_no.sql          -- site_no kind
:r 01d-seed-invoice_no.sql       -- invoice_no kind (largest; ~275k rows)
:r 01e-seed-email-address.sql    -- email_address kind (customer.email ∪ contact_person.email)
:r 01f-seed-email-domain.sql     -- email_domain kind (UNION across both email sources)
:r 01g-watermark.sql             -- bump the seed high-water watermark
:r 01h-seed-order-kinds.sql      -- po_no/order_no/job_no/quote_no kinds (D-06, RESL-08) + root_party_id rollup
:r 01i-seed-previous-customer.sql -- previous_customer_id kind (RESL-08 fallback) + root_party_id rollup
```

> **Phase 91-03 additions.** `01h`/`01i` seed the number-search kinds + the
> `previous_customer_id` fallback, and every row they insert carries the
> materialized `root_party_id` (D-04 top-level rollup; the proc cannot walk a
> multi-level parent chain). They run AFTER `01g` and are NOT yet delta-maintained
> by `02-refresh-resolver.sql` (no watermark row) — re-run `01h`/`01i` manually to
> refresh those kinds until a refresh extension adds their watermarks. The
> `root_party_id` column + the recreated `IX_resolver_index_lookup` INCLUDE come
> from the updated `00-index-tables.sql` (idempotent `ALTER` for the applied estate).

**Each `01*` chunk is idempotent** — it does a scoped `DELETE` of its own rows before the `INSERT`
(01g is an UPDATE, also idempotent), so it is **safe to re-run after a dropped connection** without
PK violations and without a global `TRUNCATE`. If a single heavy chunk (e.g. `01d` invoice or `01f`
domain) still times out, just **re-run that one chunk as-is** — the scoped DELETE makes the re-run a
clean replace.

**Verify** seeded row counts against `nxt` masterdata before continuing:

```sql
SELECT identifier_kind, COUNT(*) AS rows
  FROM zapier.dbo.resolver_index
 WHERE environment_id = 'BX'
 GROUP BY identifier_kind;          -- expect: customer_no, site_no, invoice_no, email_address, email_domain
SELECT COUNT(*) FROM zapier.dbo.resolver_customer WHERE environment_id = 'BX';
-- compare against: SELECT COUNT(*) FROM nxt.dbo.customer WHERE environment_id='BX'; (≈74,432) etc.
```

The seed materializes **both** `customer.email` and `contact_person.email` (Open Question 2
resolution — the unused recall lever GAP-1).

### 2. Apply the two procs (CREATE OR ALTER)

Still in the direct-SQL session:

```
:r 02-refresh-resolver.sql  -- CREATE OR ALTER PROCEDURE zapier.dbo.refresh_resolver
:r 03-resolve-candidates.sql-- CREATE OR ALTER PROCEDURE zapier.dbo.resolve_candidates
```

### 3. Build the refresh Zap

- Trigger: **Schedule** (every 2–4h, hours 6-19 Mon-Fri Amsterdam). NOT a SQL Server Agent job.
- Action: SQL → `EXEC zapier.dbo.refresh_resolver` (delta `MERGE` on the `modified_on` watermark).
- **Capture nothing** — Schedule-triggered, so there is no catch-hook URL to record.
- Watermark note: `refresh_resolver` already applies a 6h gap-lookback so the first tick after a
  gap (e.g. Monday 06:00) re-scans weekend data (mirrors the CLAUDE.md Inngest cron watermark rule).

### 4. Build the resolver-read Zap

- Trigger: **Catch Hook**.
- Action: SQL → `EXEC zapier.dbo.resolve_candidates @identifiers, @environment_id='BX', @brand_scope`.
- **Capture the catch-hook URL** — this becomes the `zapier_tools.target_url` for
  `tool_id = 'nxt.resolve_candidates'`.
- Auth: validate via a **body field** (`auth: "<secret>"`), reusing `DEBTOR_FETCH_WEBHOOK_SECRET`
  (Catch Hook does not reliably expose headers in the field picker).
- Callback: reuse `/api/automations/debtor/nxt-lookup/callback` (the `nxt-zap-client` async path).

### 5. Land the URL into the `zapier_tools` row

Plan 90-02 seeded a `zapier_tools` row for `nxt.resolve_candidates` with `target_url =
'PENDING_OPERATOR_ZAP_URL'` (fails closed by design, T-90-06). The operator UPDATEs it to the real
catch-hook URL captured in step 4:

```sql
UPDATE public.zapier_tools
   SET target_url = '<resolver-read Zap catch-hook URL from step 4>'
 WHERE tool_id = 'nxt.resolve_candidates';
```

### 6. RESL-06 backtest verification (the substrate acceptance signal)

Run the RESL-06 backtest invoice directly against the seeded `zapier.dbo`:

```sql
EXEC zapier.dbo.resolve_candidates
     @identifiers   = N'[{"kind":"invoice_no","value_norm":"17008641"}]',
     @environment_id = 'BX',
     @brand_scope    = N'BB,IN';
```

**MUST return `party_name = 'DWT Groep'` with `scope_key`/`brand_id` = `IN`** (Inprevo). Without the
`IN` (Inprevo) scope this customer is unreachable via the Berki mailbox — this is the concrete
RESL-06 acceptance signal. (Berki's `labeling_settings.brand_id` stays `'BB'`; the BB+IN widening is
carried as data in `swarms.resolution_config.scope.brand_scope_by_mailbox['debiteuren@berki.nl']`,
which the engine passes to the proc as `@brand_scope='BB,IN'`.)

**Brand-as-tiebreaker proof (also confirm here):** a self-auth-ID email that arrived at the SB
mailbox but resolves to an SF customer must STILL resolve — env=BX + unique `id_org` wins regardless
of brand; a hard brand filter would have rejected it. (The proc never filters on brand — it only
ranks in-scope brands first and re-asserts `is_unique_in_scope` within the requested scope.)

**Smoke the refresh proc:** `EXEC zapier.dbo.refresh_resolver;` must run without error; confirm a
delta MERGE lands after a `modified_on` advance (or a no-op on an already-current store).

### 7. Run the equality dry-run (the cutover GATE)

From `web/`:

```bash
npm run dry-run:equality
```

This is **READ-ONLY** (Plan 90-06 gate). It runs the new engine over the set we currently resolve
correctly and compares each `customer_account_id` to the stored one. **It must report 0
regressions.** Any mismatch prints `REGRESSION email_id=… stored=… new=…`, exits non-zero, and
**blocks the flip**.

### 8. Flip dispatch (big-bang cutover — Plan 90-06)

Once the dry-run reports 0 regressions, point the debtor swarm at the new engine:

```sql
UPDATE public.swarms
   SET stage2_entity_resolver = '<new engine module path>'   -- e.g. '@/lib/agentic-pipeline/resolve/engine'
 WHERE swarm_type = 'debtor-email';
```

Flip all 4 active mailboxes at once (no prolonged shadow window — low correctly-resolved volume
doesn't justify it). Data-only, no deploy, instantly reversible.

---

## Revert (kill-switch, D-07)

```sql
UPDATE public.swarms
   SET stage2_entity_resolver = '@/lib/automations/debtor-email/resolve-debtor'
 WHERE swarm_type = 'debtor-email';
```

Pointing the dispatch column back at the 1:1-ported adapter `@/lib/automations/debtor-email/resolve-debtor`
restores the legacy live-`nxt` per-signal behaviour. Data-only, per-swarm, instant — **no deploy**.

---

## Re-apply / re-seed

- **Schema change in the index tables** → re-run `00-index-tables.sql` (idempotent `IF OBJECT_ID …`
  guards) then re-seed with the `01a`…`01i` chunk files in order (each chunk scoped-`DELETE`s its own
  rows before re-inserting, so the re-seed is safe to re-run — chunk by chunk if a connection drops).
  Re-verify row counts (step 1).
- **Proc change** (`refresh_resolver` / `resolve_candidates`) → re-run the corresponding
  `CREATE OR ALTER PROCEDURE` script. No re-seed needed.
- **NXT registry growth** (e.g. smeba.nl customer count grew 590→925) → the scheduled refresh Zap
  picks up new/changed rows via the `modified_on` watermark; no manual action unless a brand-new
  `identifier_kind` is added (then re-seed).
- **Blocklists** live in Supabase (`public.resolution_blocklists`), NOT here — refresh them via a
  Supabase migration / seed, not this estate.

---

## Column-mapping caveat (Assumption A4 — confirm during the seed session)

The `nxt.dbo.*` column names in `01-seed.sql` / `02-refresh-resolver.sql` are derived from
**NXT-ADDENDUM.md**, not probed live for this seed. A wrong column name fails at apply time (low
blast radius — a syntax/binding error in the operator session, never a silent wrong-resolve).
**Confirm these against the live `nxt.dbo` schema before trusting the seed; correct the `.sql` files
in place if the live schema differs** (and note the correction back into `01-seed.sql`):

| Table | Columns assumed | Note |
|-------|-----------------|------|
| `nxt.dbo.customer` | `id`, `id_org`, `brand_id`, `parent_id`, `previous_customer_id`, `email`, `postcode`, `status`, `environment_id`, `modified_on`, `name` | `name` is the display column (NXT MCP gotchas use `LEFT(name,N)`); `previous_customer_id` is nvarchar |
| `nxt.dbo.contact_person` | `customer_id` (→ `customer.id`), `email`, `environment_id`, `modified_on` | the unused recall lever (GAP-1) |
| `nxt.dbo.site` | `id_org`, `customer_id` (→ `customer.id`), `environment_id`, `modified_on` | |
| `nxt.dbo.invoice` | `exact_invoice_id`, `customer_id_org` (→ `customer.id_org`), `environment_id`, `modified_on` | NO `brand_id` on invoice — brand comes from the joined customer |

If the customer→contact/site FK is `customer.id_org` rather than `customer.id` (or a different join
key), adjust the join predicate accordingly — keep `environment_id` on BOTH sides of every join.
