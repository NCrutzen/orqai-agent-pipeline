# Generic Cross-Swarm Entity Resolution — design

> Status: design 2026-05-30 (architecture revised 2026-05-30 to SQL-native — see DESIGN-GUIDE §0.2). Builds on the locked Stage 2→3 contract (`docs/agentic-pipeline/context-shape-contract.md`), the swarm-shape model (`README.md`), the validated resolution findings (DESIGN-GUIDE.md §0–§13), and the CFO's unfinished `pa_entity_lookup` view (the right shape for ONE source). Goal: a reusable entity-resolution substrate any swarm can adopt by configuration, not a debtor-only build.
>
> **VALIDATION AMENDMENTS (2026-06-01)** — see DESIGN-GUIDE §0.10 + `VALIDATION-FINDINGS-v8.2.md`:
> - **Materialise only `customer` / `contact_person.email` / `site` / `invoice.exact_invoice_id`.** Mark `previous_customer_id` (62 collisions, fallback-only) and `vat`/`kvk` (6.8%, weak) as **live-`nxt` fallback kinds, not materialised**. Decide `order_ref`/`quote_ref`: materialise + precision-test, or demote R5/R6 to SUGGEST (they were never validated as AUTO). **Drop `phone`** from the resolvable `identifier_kind` vocab — it is an own-entity contaminant only, never a resolution key.
> - **Reframe the milestone as "build the debtor resolver behind a config-shaped seam," NOT "build the generic engine."** The ≥99% win rests entirely on self-auth stamps (aanmaning ID / Klantnummer / werkbon) that **SugarCRM has none of**, and `body_full_text`=0% on sugarcrm. So debtor's dominant precision lever does not transfer. Keep the engine/config split, but the only generality claim P0 may make is an **acceptance test that the self-auth-ID tier degrades to a no-op** (not a crash, not a false candidate) when a backend's config declares zero auto-safe self-auth kinds. The sales adapter must extract from `body_text`.
> - **Seed is direct-SQL, not Zapier** (DESIGN-GUIDE §0.10 A1): the Source-Adapter refresh cadence applies to the recurring delta only; the one-time projection seed runs in the operator's SQL session.

## Why generic, and why now
The Stage 2 contract is already backend-agnostic — `PipelineStageContext` is produced identically whether the backend is NXT (debtor) or SugarCRM (sales, V10.0). The architecture already has the seam: `swarms.stage2_entity_resolver` (a per-swarm resolver module path) and `classifier_rules.kind='label_resolver'` (registry-driven extraction). But the seam is **unwired** — `stage-2-customer-resolver.ts` hardcodes `resolveDebtor`, and the resolver column has no code consumer. Building the recall work as a *generic substrate* now (debtor as first consumer) means V10.0/sales and future hybrid swarms plug in by config — avoiding the rebuild the operator wants to prevent.

## The substrate = Resolver + Engine + Source Adapters (all registry-configured)

> REVISED 2026-05-30: the shared lookup layer ("Index") lives in **SQL** — a resolver in `zapier.dbo` joining cross-DB into `nxt`, NOT a synced Supabase table (operator governance decision: NXT customer data may not be copied into Supabase; see DESIGN-GUIDE §0.2). The Engine contract is unchanged.

```
 backend(s)            ADAPTER (per source)     SHARED RESOLVER (SQL)     SHARED ENGINE           contract
 NXT (debtor)    ──▶  nxt adapter ───────┐
 SugarCRM (sales)──▶  sugar adapter ─────┼──▶ resolve_candidates ─────▶ resolution engine ──▶ PipelineStageContext
 (future)        ──▶  …                  ┘      (zapier.dbo over nxt)    (precedence + gates)    → Stage 3
                                                ▲ blocklists, config (registry) ▲
```

### Layer A — Resolvable-Identity projection (generalize the CFO view) — lives in SQL, not Supabase
> REVISED 2026-05-30: this is the shape of the **materialized indexed tables in `zapier.dbo`** (the default backing) that the SQL resolver `zapier.dbo.resolve_candidates` reads, populated from `nxt` (see DESIGN-GUIDE §0.2) — NOT a Supabase table. One conceptual row per (identifier → party):

| column | meaning |
|---|---|
| `swarm_source` | which swarm/backend owns the row (debtor-nxt, sales-sugar, …) |
| `environment_id` | region/tenant (BX/UK/IE for NXT) — HARD scope filter |
| `scope_key` | brand (SB/FI/BB/SF/SN/SS/IN…) — TIEBREAKER, not hard filter |
| `identifier_kind` | open vocab: `invoice_no, customer_no, prev_customer_no, site_no, job_no, order_ref, quote_ref, email_domain, email_address, vat, kvk, phone, postcode` |
| `identifier_value_norm` | normalized lookup key (digits-only phone, space-stripped postcode, lowercased domain) |
| `party_id` | **stable composite key** (e.g. `BX594313`) — what we persist on `email_labels.customer_account_id` |
| `party_name`, `parent_party_id` | display + FM roll-up |
| `is_unique_in_scope` | true = exact (auto-eligible); false = candidate-set kind (domain/postcode/name) |
| `precedence` | resolution priority (invoice 1 → job 2 → site 3 → customer 4; the CFO's `order_by`) |
| `status`, `modified_on`, `source_ref` | active/stopped; watermark for incremental refresh; provenance |

This is exactly `pa_entity_lookup` **+ the columns our backtest proved missing**: `scope_key`/brand, `prev_customer_no`, `quote`, the email-domain/address kinds, `exact_invoice_id IS NOT NULL`, and `is_unique_in_scope`. Indexed on `(swarm_source, environment_id, identifier_kind, identifier_value_norm)` → a whole candidate set resolves in ONE SQL call (the resolver in `zapier.dbo` joins cross-DB into `nxt`; NXT data is never copied into Supabase).

### Layer B — Resolution Engine (shared code, swarm-agnostic)
`web/lib/agentic-pipeline/resolve/` — a pure pipeline parameterized by a per-swarm config object. Steps = the validated precedence (DESIGN-GUIDE §3), all reading the resolver projection ("the Index" = the SQL resolver in `zapier.dbo`, §0.2 — NOT a Supabase table):
1. strip own-entity identifiers (blocklist from registry, per source)
2. self-auth labeled IDs (config lists which `identifier_kind`s + label patterns are auto-safe)
3. exact number back-search against the resolver (the resolver IS the existence-filter → kills the ~25% date/ref false positives for free)
4. domain match (freemail/own/platform blocklist + platform-score) → candidate set
5. postcode/site ∩ candidate set
6. on-behalf-of principal name → candidate set
7. score + precedence → **confidence gate**: AUTO (unique exact, no intermediary) / SUGGEST (ranked, → LLM tiebreaker + operator) / HARD / FLAG-FOR-REVIEW (residual ambiguity)
8. emit `PipelineStageContext` (`customer_id`=party_id, `customer_name`, `entity_brand`=scope, `recent_documents` from the resolver, `context_version:1`)

Per-swarm `resolution_config` (jsonb on `swarms`): scope rule (env hard / brand tiebreak), auto-safe kinds, precedence weights, blocklist ref, LLM-tiebreaker on/off. **Debtor's `resolve-debtor.ts` becomes config + data, not bespoke code.**

### Layer C — Source Adapters (per backend)
A `resolution_sources` registry row per (swarm, source): backend kind, connection ref, field mapping, scope, and — only if a backend needs a materialized projection for speed — a refresh cadence/watermark. An adapter exposes the resolver projection (Layer A shape) for its backend:
- **NXT adapter** = the SQL resolver `zapier.dbo.resolve_candidates` (the CFO's `pa_entity_lookup` view + the missing branches) over **materialized indexed tables in `zapier.dbo`** (the default — populated from `nxt.dbo.*` by a `MERGE` proc, refreshed by a **scheduled Zap (Schedule → SQL action)**, `modified_on` watermark, every 2–4h; a Zap rather than a SQL Agent job so it needs only `zapier.dbo` DDL + the whitelisted Zapier connection), called via the existing Zapier SQL path; live-`nxt` cross-DB views are the long-tail fallback. **No cross-system sync to Supabase** — everything stays inside the SQL estate; `nxt` is the single source of truth.
- **SugarCRM adapter** (V10.0) exposes the same projection shape from Sugar (backend-native query or materialization) → the proof of generality.
- Router swarms (info-routing) register no source; the engine is never invoked (`stage2_entity_resolver=NULL`).

## Registry wiring (reuse existing seams; minimal new tables)
- `swarms.stage2_entity_resolver` → point resolving swarms at the **shared engine module**; add `swarms.resolution_config` jsonb.
- `classifier_rules.kind='label_resolver'` → extraction patterns (generalize the Azure regex into per-swarm registry rows; extract liberally, the resolver filters).
- New: `resolution_sources` registry + `resolution_blocklists` (own-entity / freemail / platform, refreshable per source). The resolver projection itself lives in SQL (`zapier.dbo` over `nxt`), NOT as a Supabase table.
- **Wire dynamic dispatch** in `stage-2-customer-resolver.ts` (today hardcoded) to load `swarms.stage2_entity_resolver` + config.

## Swarm-shape fit (no new stages, no forks)
- **Handler** (debtor): full engine, NXT source. First consumer.
- **Router** (info-routing): no Stage 2 → engine not invoked. Unchanged.
- **Hybrid**: engine invoked conditionally per intent.
- **Sales** (V10.0): same engine, SugarCRM adapter + sales config.

## Evidence boundary (do not over-claim)
The engine's precedence/blocklists/scoping and the resolver-projection shape are **validated on NXT/debtor only** (spike 010/010b; and per project memory, all classifier evidence is debtor@smeba.nl). Cross-backend generality (SugarCRM) is a **designed seam, not yet validated** — confirm when the V10.0 source adapter exists. Build the engine/resolver generically; treat the second-backend adapter as the generality test.

## Sequencing (folds into DESIGN-GUIDE §0.8)
- **P0** now also builds: the generic resolver projection (Layer A shape) + Engine skeleton + dynamic Stage-2 dispatch + the NXT adapter = `zapier.dbo.resolve_candidates` over `nxt` (the completed `pa_entity_lookup`), called via Zapier. Plus the prior P0 (Lever-1 fix, blocklists as registry data, Berki BB+IN).
- **P1–P4** (debtor) run on the generic engine via debtor `resolution_config` — debtor is the first consumer, not a special case.
- **V10.0** adds the SugarCRM adapter + sales config → no engine rebuild.

## Make-it-generic gaps to close
1. **Dynamic dispatch**: `stage-2-customer-resolver.ts` must load the resolver+config from `swarms.stage2_entity_resolver`/`resolution_config` (today hardcodes `resolveDebtor`).
2. **Complete `pa_entity_lookup` as `zapier.dbo.resolve_candidates`** (the CFO view → our resolver, joining cross-DB into `nxt`) → add `brand_id`(scope), `prev_customer_no` branch, `quote` branch, email-domain/address branches (customer + contact_person + site), `exact_invoice_id IS NOT NULL`, `recent_documents` feed. Canonical store + read path **RESOLVED**: SQL Server `nxt` via the production Zapier SQL action (DESIGN-GUIDE §0.2).
3. **SQL resolver in `zapier.dbo`** over **materialized indexed tables** (default; populated from `nxt` by a `MERGE` proc, refreshed by a scheduled Zap — Schedule → SQL action, not a SQL Agent job) + register one `zapier_tools` row; live-`nxt` views as long-tail fallback (no cross-system sync to Supabase). Confirm the Zapier SQL action can write, not just SELECT.
4. **Blocklists + resolution_config as registry data** (own-entity, freemail, platform — refreshable; not hardcoded).
5. **Generic confidence gate → Bulk Review** (auto/suggest/hard/flag) — the review surface is already converging cross-swarm via the unified shell.
