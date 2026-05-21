# Phase 70: Telemetry consolidation (pipeline_events) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 70-telemetry-consolidation-pipeline-events
**Mode:** `--auto`
**Areas discussed:** Schema shape, Write strategy, Existing-table preservation, Bulk Review/recommender migration, eval_type vocabulary, Stage vocabulary, override? column shape

---

## Schema shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single `public.pipeline_events` table, UUID PK | Mirrors `agent_runs` / `automation_runs`. Replay-safe via `crypto.randomUUID()` in `step.run`. | ✓ |
| Partitioned table (monthly) from day 1 | Premature; volume bounded by email throughput. | |
| Event-store style (append-only with snapshot tables) | Heavy; not needed for OLTP scale. | |

**Selected option:** Single `public.pipeline_events` table, UUID PK
**Rationale:** Matches established pipeline-table patterns. Partitioning deferred per D-01. (D-01..05 in CONTEXT.md)

---

## Write strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Inline dual-write inside existing `step.run` | Same atomic boundary as legacy-table write. Explicit. | ✓ |
| DB triggers from legacy tables | Opaque, hard to debug across Inngest replays. | |
| CDC stream via logical replication | Premature complexity for v1. | |
| Inngest event listener (separate function) | Doubles step count, replay churn risk. | |

**Selected option:** Inline dual-write inside existing `step.run`
**Rationale:** Replay-safe, observable, no infra surface area added. Helper `emitPipelineEvent` keeps call-sites concise. (D-06..09)

---

## Existing-table preservation (TELE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-write; legacy tables stay primary read source for non-Bulk-Review consumers | Lowest risk. No consumer migration in this phase. | ✓ |
| `pipeline_events` primary; legacy tables become DB-trigger denormalisations | Inverts authority; premature when only Bulk Review consumes. | |
| Legacy tables become views over `pipeline_events` | Requires backfill + breaking schema change. | |

**Selected option:** Dual-write; legacy tables stay primary
**Rationale:** TELE-02 is satisfied trivially. Legacy table writes unchanged; just adds one INSERT alongside. (D-06, D-16)

---

## Bulk Review + recommender migration (TELE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Bulk Review feed query with `pipeline_events` read in same phase | Single PR proves the table is consumable. | ✓ |
| Backwards-compat shim (view named like old table) | Adds surface area without value; old tables stay anyway. | |
| Defer Bulk Review migration to Phase 71 | Misses TELE-03 acceptance criterion. | |

**Selected option:** Replace Bulk Review feed query with `pipeline_events` read
**Rationale:** Phase 70 ships TELE-03 end-to-end. Phase 72 recommender stub deferred to its own phase. (D-14, D-15, D-16)

---

## eval_type vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| `text` column, no CHECK constraint, NULL until Phase 71 | YAGNI; vocabulary documented in code. | ✓ |
| `enum` type `eval_type_enum` | Schema bump needed if vocabulary expands. | |
| `boolean is_regression` | Loses the "capability" axis from ROADMAP. | |

**Selected option:** `text` column, no CHECK constraint
**Rationale:** Mirrors Phase 69 D-09 stance on `swarm_type`. Constraint deferred until Phase 71 exercises the values. (D-12)

---

## Stage vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| `smallint` 0..4 with code-side `Stage` enum | Tiny, indexable, matches Stage 0..4 docs nomenclature. | ✓ |
| `text` (`'safety' \| 'regex' \| 'entity' \| 'coordinator' \| 'handler'`) | Self-documenting but bigger column; vocabulary may drift. | |

**Selected option:** `smallint` 0..4
**Rationale:** Numeric stage matches the canonical pipeline doc. Code provides human mapping. (D-13)

---

## override? column shape

| Option | Description | Selected |
|--------|-------------|----------|
| `jsonb NULL` (axis + original_decision + operator_id + reason) | Phase 71 lights up without schema migration. | ✓ |
| `boolean is_override` | Forces a Phase 71 schema bump to record axis/operator/reason. | |
| Separate `pipeline_overrides` join table | Splits read path; doubles query complexity. | |

**Selected option:** `jsonb NULL`
**Rationale:** Forward-compat scaffolding for Phase 71's 4-axis override redesign. Documented shape in CONTEXT D-11.

---

## Claude's Discretion

- Wire-up order between the 5 stage emit sites (Stage 0/1/2/3/4) — planner picks per implementation convenience.
- Test fixture co-location — planner picks per existing test conventions.
- Whether `cost_cents` is populated in v1 or NULL until Phase 72 — implementer's call.

## Deferred Ideas

- Monthly partitioning — defer until volume warrants.
- Materialized views over `pipeline_events` — defer; check raw-table perf first.
- CHECK constraints on `swarm_type` / `stage` / `eval_type` — defer until cross-swarm + override paths land.
- CDC stream to warehouse — out of scope.
- Backfill of historical `agent_runs` / `email_labels` — separate later phase.
- Drop / replace legacy tables with views — separate later phase.

## Reviewed Todos (not folded)

- `2026-04-22-resolve-postgrest-exposed-schemas-for-email-insights.md` — adjacent (PostgREST schema visibility) but `email_insights` schema is unrelated to `pipeline_events` (which lives in `public`).
- `2026-03-26-zapier-analytics-browser-automation.md` — unrelated.
