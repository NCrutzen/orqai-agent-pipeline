# Phase 70: Telemetry consolidation (pipeline_events) — Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

Introduce a single canonical `pipeline_events` table that records one row per stage decision across the agentic pipeline (Stage 0 → 4) for every swarm. Existing per-table writes (`classifier_rules`, `agent_runs`, `email_labels`, `automation_runs`) keep happening unchanged — they become **denormalised read-models**. Bulk Review and the Phase 72 promotion recommender migrate to read from `pipeline_events` instead of joining 3+ legacy tables.

In scope (TELE-01..03):

1. **TELE-01:** Create `pipeline_events` schema + writes from every stage of the canonical debtor-email flow. Required columns: `swarm_type`, `stage`, `decision`, `confidence`, `override?`, `eval_type` (per ROADMAP success criteria 1).
2. **TELE-02:** Existing tables continue to populate without consumer breakage. No deletions, no consumer code edits to the legacy tables. Dual-write only (writes go to BOTH the legacy table and `pipeline_events` from the same code path inside the same `step.run()`).
3. **TELE-03:** Bulk Review API + (placeholder for) Phase 72 promotion recommender query `pipeline_events` instead of multi-table joins. Operator-facing UI in Bulk Review keeps current visual behaviour — only the data layer changes.

Out of scope (explicitly deferred):

- **4-axis override redesign + capability/regression tagging** — Phase 71. Phase 70 ships the `override?` and `eval_type` *columns* but the override-emit code paths and the operator UI for tagging are Phase 71. Phase 70 leaves `override?` and `eval_type` NULL on every event written from a non-override pipeline run.
- **`promotion_candidates` table + Learning Inbox** — Phase 72.
- **Sales-email swarm wiring** — Phase 73. Phase 70 designs the `swarm_type` column to hold any string; sales-email rows arrive when Phase 73 ships.
- **Deletion / view-replacement of legacy tables** — separate later phase once all consumers migrated and `pipeline_events` is proven authoritative. Phase 70 keeps both writes alive.
- **Backfill of historical agent_runs / email_labels into pipeline_events** — out of scope. `pipeline_events` starts empty; only events emitted *after* Phase 70 ships land in it. Bulk Review's history view continues reading legacy tables until a future backfill phase or until enough new events accumulate to read forward-only.

</domain>

<decisions>
## Implementation Decisions

### Schema shape (TELE-01)

- **D-01: `pipeline_events` lives in the `public` schema as a regular table (not partitioned, not a foreign data wrapper).** Keep it simple for v1. Phase 72+ can add monthly partitioning if growth warrants. Why: all existing pipeline tables are in `public`, RLS is already configured per-table for service-role access, and event volume is bounded by email volume (low thousands/day across all swarms).

- **D-02: PK = `id uuid DEFAULT gen_random_uuid()`.** Matches existing pipeline tables (`agent_runs.id`, `automation_runs.id`). Use `crypto.randomUUID()` inside `step.run("emit-pipeline-event", ...)` so Inngest replay determinism holds (CLAUDE.md §Inngest replay-onveilige id-generatie).

- **D-03: Required columns per TELE-01 + supporting columns.** Final shape:
  ```sql
  CREATE TABLE public.pipeline_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    swarm_type    text NOT NULL,                       -- 'debtor-email' | 'sales-email' | 'cross-cutting'
    stage         smallint NOT NULL,                   -- 0..4 (Stage 0 safety → Stage 4 handler)
    email_id      uuid NULL,                           -- FK soft-ref to email_pipeline.emails.id (nullable for non-email-bound stages e.g. Stage 0 safety budget hits)
    case_id       uuid NULL,                           -- forward-compat for the case-layer (docs/agentic-pipeline/case-layer.md); NULL until that ships
    decision      text NOT NULL,                       -- canonical stage outcome string (e.g. Stage 1: 'invoice_copy_request' | 'noise' | 'unknown')
    confidence    numeric(4,3) NULL,                   -- [0.000, 1.000] — NULL when stage is deterministic (Stage 1 regex hit) or when Stage 0 doesn't compute one
    override      jsonb NULL,                          -- NULL on first-pass events; populated on Phase 71 override emits ({original_decision, operator_id, reason, axis})
    eval_type     text NULL,                           -- NULL on first-pass; 'capability' | 'regression' on Phase 71 override emits
    decision_details jsonb NULL,                       -- stage-specific structured payload (e.g. Stage 4 handler output, Stage 3 intent ranking)
    cost_cents    numeric(10,4) NULL,                  -- per-event LLM cost where applicable; NULL for deterministic stages
    duration_ms   integer NULL,
    agent_run_id  uuid NULL,                           -- soft-ref to agent_runs.id when stage 3/4 used an Orq agent
    automation_run_id uuid NULL,                       -- soft-ref to automation_runs.id (e.g. invoice-copy handler runs)
    triggered_by  text NULL                            -- 'pipeline' | 'operator-override' | 'replay' | 'backfill'
  );
  ```
  Why these supporting columns:
  - `email_id` denormalised to enable single-table Bulk Review queries without joining `email_pipeline.emails`.
  - `case_id` is forward-compat scaffolding for `docs/agentic-pipeline/case-layer.md` — populated once the case-layer ships, NULL until then.
  - `decision_details jsonb` separates the canonical text decision (queryable, low cardinality) from the rich payload (per-stage variable shape).
  - `agent_run_id` / `automation_run_id` are soft-refs (no FK constraint) so legacy tables can be dropped later without breaking PG.

- **D-04: Indexes — start minimal, add when slow.** Initial migration creates:
  ```sql
  CREATE INDEX pipeline_events_email_id_idx ON public.pipeline_events (email_id);
  CREATE INDEX pipeline_events_swarm_stage_created_idx ON public.pipeline_events (swarm_type, stage, created_at DESC);
  CREATE INDEX pipeline_events_override_partial_idx ON public.pipeline_events (created_at DESC) WHERE override IS NOT NULL;
  ```
  No B-tree on `decision` yet — cardinality is low and stage+swarm_type filters narrow down fast. Bulk Review's "show all events for this email" hits `email_id_idx`; the recommender's "all overrides in last N days" hits the partial index. Reassess after first week of production data.

- **D-05: No FK constraints on `email_id`, `agent_run_id`, `automation_run_id`.** Soft-refs only. FK to `email_pipeline.emails` would tie us to that schema; a later schema split (e.g. moving emails to a separate Postgres) would force a migration. Constraint discipline lives in the application layer (TS types + the Phase 65 step.run replay-safe id pattern).

### Write strategy (TELE-01, TELE-02)

- **D-06: Inline dual-write inside the same `step.run()` that writes the legacy table.** Rejected: DB triggers (opaque, hard to debug across Inngest replays), CDC streams (premature complexity). Pattern:
  ```ts
  await step.run("write-classifier-rule-and-event", async () => {
    await admin.from("classifier_rules").insert({ ... });
    await admin.from("pipeline_events").insert({
      swarm_type: "debtor-email",
      stage: 1,
      email_id,
      decision: rule.category_key,
      confidence: rule.confidence,
      decision_details: { rule_id: rule.id, evidence: rule.evidence },
      triggered_by: "pipeline",
    });
  });
  ```
  Single `step.run` keeps both writes within one Inngest replay boundary — no orphan rows on retry.

- **D-07: One central helper `emitPipelineEvent(admin, payload)` in `web/lib/pipeline-events/emit.ts`.** Stages call it with their own payload. The helper is a thin INSERT wrapper (no caching, no batching) — its value is providing a typed `PipelineEventInput` so call-sites can't forget required columns. Co-located with `web/lib/automations/runs/emit.ts` (existing emit pattern).

- **D-08: Stage emit sites — minimal v1 set, all in the canonical debtor-email flow.** Phase 66 collapsed the pipeline; the touchpoints are:
  - Stage 0 safety (`web/lib/inngest/functions/debtor-email-coordinator.ts` — budget/safety bail) → emit when bail triggers
  - Stage 1 regex (`classifier-verdict-worker.ts` or wherever the regex match decides) → emit one event per email with `decision = matched_category | 'unknown'`
  - Stage 2 entity resolution (`web/lib/automations/debtor-email/coordinator/coordinator-complete.ts` — entity/customer match) → emit `decision = 'resolved' | 'unresolved'`, `decision_details = { customer_account_id, entity_brand }`
  - Stage 3 coordinator (intent resolution) → emit `decision = top_intent`, `decision_details = ranked_intents`
  - Stage 4 handler (`classifier-invoice-copy-handler.ts` and any future canonical handler) → emit `decision = 'completed' | 'failed'`, `decision_details = { handler_output, draftUrl, screenshots }`

  Each emit site is a 1-3 line addition next to the existing legacy-table write. No refactor of stage logic.

- **D-09: Replay safety.** Every emit MUST live inside an existing `step.run` (not a new top-level step). Generating new stepIds for telemetry would balloon the Inngest function's step count and risk replay churn. The emit is part of the surrounding step's atomic unit.

### eval_type & override semantics (forward-compat for Phase 71)

- **D-10: `eval_type` and `override` stay NULL in Phase 70.** Phase 70 ships the columns + the emit helper signature accepts them, but the only call-sites populating them are Phase 71's override paths. This is intentional forward-compat scaffolding — Phase 71 lights up the override emit code without a schema migration.

- **D-11: `override` is `jsonb`, not `boolean`.** Phase 71 needs to record axis (`stage_1_category` | `stage_2_customer` | `stage_3_intent` | `stage_4_handler_output`), original decision, operator_id, optional free-text reason. Boolean would force a schema bump in Phase 71. JSONB shape will be: `{ axis: text, original_decision: text, operator_id: uuid, reason: text|null }` — documented in CONTEXT for Phase 71.

- **D-12: `eval_type` is `text` (no CHECK constraint yet).** Vocabulary `'capability' | 'regression'` is documented in code comments; constraint deferred until Phase 71 lands and the values are exercised in production. YAGNI, mirrors Phase 69 D-09 precedent on `swarm_type`.

### Stage vocabulary (TELE-01)

- **D-13: `stage` is `smallint` 0..4.** Matches the Stage 0..4 nomenclature used everywhere in `docs/agentic-pipeline/README.md` and `docs/debtor-email-pipeline-architecture.md`. Numeric (not text) keeps the column tiny and indexable. Code-side: a `Stage` enum in `web/lib/pipeline-events/types.ts` provides the human mapping.

### Bulk Review + recommender migration (TELE-03)

- **D-14: Bulk Review API rewires its main feed query to `pipeline_events`.** Migration approach: ship Phase 70 dual-write first (so the table populates from day 1), then in the same phase update the Bulk Review feed endpoint (`web/app/api/automations/debtor-email/...`) to read events instead of joining `agent_runs + email_labels + automation_runs`. The visible operator UI behaviour is unchanged — only the SQL underneath shifts.

- **D-15: Phase 72 promotion recommender is NOT built in Phase 70.** Phase 70 leaves a one-paragraph stub (`docs/agentic-pipeline/promotion-recommender.md`) describing how Phase 72 will consume `pipeline_events`. No code, no Inngest function — that's Phase 72's job. Phase 70 only needs to prove the table is queryable and consumable.

- **D-16: Backwards-compat shim — none.** No views, no synonym tables. Bulk Review's old query is replaced atomically in the same PR as the dual-write rollout. If something breaks, revert — `pipeline_events` table stays, just unconsumed. Low risk because Phase 66 already collapsed the pipeline; only one or two query paths in Bulk Review hit the legacy multi-table join today.

### Migration discipline

- **D-17: Apply migrations via Supabase MCP at an operator-gated checkpoint.** Same pattern as Phase 67/68/69 — Claude proposes the migration SQL, operator runs `mcp__supabase__apply_migration`. Migration filename: `supabase/migrations/20260506a_pipeline_events.sql`.

- **D-18: Idempotency.** Migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Re-running is a no-op. Matches Phase 68 / 69 migration style.

### Claude's Discretion

- Wire-up order between the 5 stage emit sites — do them in the order the planner finds easiest to verify.
- Test fixture location (`web/lib/pipeline-events/__tests__/` vs co-located with each handler) — planner picks per existing test conventions.
- Whether `cost_cents` is populated in v1 or left NULL until Phase 72 needs it — implementer's call (low effort either way given the cost is already known at Stage 3/4 emit time).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (cross-swarm)
- `docs/agentic-pipeline/README.md` — Stage 0→4 architecture; `pipeline_events` is the runtime telemetry layer for this funnel.
- `docs/agentic-pipeline/case-layer.md` — forward-compat target for the `case_id` column (NULL until case-layer ships).

### Debtor-email implementation map
- `docs/debtor-email-pipeline-architecture.md` — concrete Stage 0..4 implementations + the touchpoints where Phase 70 emits.

### Prior phase contexts (decisions still in force)
- `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-CONTEXT.md` — single canonical flow precondition for TELE-01.
- `.planning/phases/68-swarm-registry-generalisation-canonical-context-shape/68-CONTEXT.md` — `swarm_type` registry semantics; `pipeline_events.swarm_type` aligns.
- `.planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-CONTEXT.md` — `swarm_type='cross-cutting'` convention; D-08 references the same swarm_type column shape.

### Project-level constraints
- `.planning/REQUIREMENTS.md` §TELE-01..03 — phase requirements verbatim.
- `CLAUDE.md` §Inngest — replay-onveilige id-generatie + step.run discipline (D-02, D-09 hinge on this).
- `CLAUDE.md` §Supabase — service-role pattern for automation writes.
- `docs/supabase-patterns.md` — RLS / service-role conventions for new tables.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`web/lib/automations/runs/emit.ts`** — `emitAutomationRunStale` — co-locate the new `emit.ts` for `pipeline_events` next to it; same admin-client pattern.
- **`step.run("...", async () => admin.from("...").insert(...))`** pattern — used throughout `web/lib/inngest/functions/`. Phase 70 just adds one row to the existing inserts.
- **Phase 65 replay-safe id pattern** — `crypto.randomUUID()` inside `step.run` — applies to Phase 70 emits.

### Established Patterns
- All pipeline writes use service-role admin client (`createAdminClient()`) — no RLS friction.
- Migration filenames `YYYYMMDDx_<slug>.sql` — Phase 70 follows.
- Soft-refs preferred over FK constraints (CLAUDE.md): `agent_run_id`, `automation_run_id`, `email_id` all stay constraint-free.

### Integration Points
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — Stage 0 safety + Stage 2 entity emit sites.
- `web/lib/automations/debtor-email/coordinator/coordinator-complete.ts` — Stage 2/3 emit sites.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — Stage 1 emit site.
- `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` — Stage 4 emit site (reference handler).
- `web/app/api/automations/debtor-email/...` — Bulk Review API endpoints (TELE-03 read-side migration).

</code_context>

<specifics>
## Specific Ideas

- Schema chose `numeric(4,3)` for `confidence` (not `real`) so 0.123 round-trips exactly without binary-float drift — matches `agent_runs.confidence` precedent if present, otherwise sets the convention.
- `triggered_by` text column accepts a small enum-like vocabulary (`'pipeline' | 'operator-override' | 'replay' | 'backfill'`) without a CHECK constraint — same YAGNI stance as `swarm_type` (Phase 69 D-09).
- Forward-compat for case-layer (`case_id`) and Phase 71 (`override`, `eval_type`) is intentional: ships now to avoid a Phase 71 schema bump.

</specifics>

<deferred>
## Deferred Ideas

- **Partition by month** — defer until row count or query latency demands it.
- **Materialized views over `pipeline_events`** for Bulk Review hot paths — defer; check raw-table query perf first.
- **CHECK constraints on `swarm_type`, `stage`, `eval_type`** — defer until Phase 73 lands a second swarm or Phase 71 lands the override taxonomy in production.
- **CDC stream / logical-replication outbox to a warehouse** — out of scope; Phase 70 is OLTP-only.
- **Backfill of historical `agent_runs` / `email_labels` into `pipeline_events`** — separate later phase. The legacy tables remain authoritative for pre-Phase-70 history.
- **Drop / replace legacy tables with views** — separate later phase once consumers fully migrated.
- **Reviewed Todos (not folded):**
  - `2026-04-22-resolve-postgrest-exposed-schemas-for-email-insights.md` — adjacent (also a PostgREST schema-exposure concern) but its scope is `email_insights` schema visibility, not `pipeline_events`. Phase 70 introduces the new table in `public` so the `email_insights` issue is independent.
  - `2026-03-26-zapier-analytics-browser-automation.md` — unrelated (Zapier scraping flow).

</deferred>

---

*Phase: 70-telemetry-consolidation-pipeline-events*
*Context gathered: 2026-05-05*
