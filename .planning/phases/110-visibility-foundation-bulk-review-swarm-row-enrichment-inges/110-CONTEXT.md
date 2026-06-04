# Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

The sales operator can see and follow `verkoop@smeba.nl` emails end-to-end in a Bulk Review surface **before any phase auto-acts**, and the `sales-email` `swarms` row is upgraded from a Stage-0/1 shell to a full-funnel registry config — the foundation every later V9.0 phase reads from.

**Requirements:** REVIEW-01, SWARM-01, SWARM-02, VERIFY-01.

**In scope:** generalized Bulk Review row sourcing for sales (and info-routing); full-funnel `swarms` row config behind a dry-run gate; generalized shared Stage-3 coordinator + multi-swarm codegen; per-mailbox ingest-health monitoring; per-stage dry-run governance.

**Out of scope (later phases):** Stage 1 noise calibration/flip (111), Outlook archive side-effect + backfill (112), the actual `sales-intent-agent` + seeded `swarm_intents` (113), the live Stage 2 NXT resolver dispatch seam (114, cross-track v8.2), SugarCRM dead-code removal (115). **No auto-acting on sales mail in this phase.**

⚠️ **Planner scope warning:** This phase is large and crosses the live debtor path twice (coordinator generalization + per-stage dry-run replacing the debtor boolean). Strongly consider splitting into multiple plans, each with hard debtor regression gates. See Decisions for the risk map.

</domain>

<decisions>
## Implementation Decisions

### Bulk Review — row sourcing (REVIEW-01)
- **D-01:** **Generalize the row hydrator** to a swarm-generic anchor instead of creating a sales label store. Today `web/app/(dashboard)/automations/[swarm]/review/page.tsx:84-86` hard-404s any swarm `!== 'debtor-email'` because the hydrator anchors on `debtor.email_labels` (a debtor-only store with no `swarm_type` column). Replace the **anchor** with a swarm-generic source — sales already writes `email_pipeline.emails` (`source='outlook'`) + `automation_runs` (`swarm_type='sales-email'`); the Stage 0–4 *evidence* the hydrator reads (`public.pipeline_events` + `public.agent_runs`) is **already swarm-generic**. Only the row anchor and the codegen imports are debtor-bound.
- **D-02:** The generalized hydrator must serve **debtor + sales + info-routing** uniformly (info-routing is already a live swarm). Don't special-case sales.
- **D-03:** Sidebar nav (`web/components/v7/swarm-sidebar.tsx`, hardcoded `AUTOMATIONS_ITEMS`) must gain a sales-email entry — prefer driving it from the `swarms` registry rather than another static literal.

### Swarm-row config (SWARM-01)
- **D-04:** Populate the **full-funnel config now** in one migration + atomic `npm run codegen`: `entity_brand=smeba`, `canonical_context_shape`, `stage2_entity_resolver`, `resolution_config`, `stage3_coordinator_agent_key` (planned target values, i.e. forward-references to assets built in 113/114).
- **D-05:** The forward-referenced config is held **inert behind an explicit dry-run gate** (see D-10/D-11), AND relies on natural inert guards: empty `swarm_intents` → Stage 3 no-ops until 113; no RESL dispatch seam → Stage 2 no-ops until 114; `side_effects='[]'` until 112. Belt-and-suspenders, fully auditable.
- **D-06:** No hardcoded enums, no hand-edited `*.generated.ts` — migration + codegen committed atomically (Phase 69 registry-as-source-of-truth pattern).

### Generalization scope (SWARM-02)
- **D-07:** **Generalize now — prove the seam.** Refactor `web/lib/inngest/functions/debtor-email-coordinator.ts` to read `swarm_type` from the event payload (drop the hardcoded `const SWARM_TYPE = "debtor-email"`) so it becomes the shared Stage-3 runner that 113's `sales-intent-agent` dispatches through with no further edits (honors 113 STAGE3-01 "no edits to the shared dispatcher").
- **D-08:** Generalize codegen (`web/scripts/gen-entity-types.ts`, `gen-intent-types.ts`) to **emit per-swarm `*.generated.ts`** (sales = empty unions for now since it has no `swarm_intents`/`entity_brand` yet), and repoint `web/lib/bulk-review/hydrate.ts` imports off the debtor-only paths. `gen-tenant-domains.ts` already emits a per-swarm map — follow that shape.
- **D-09:** **HIGHEST-RISK item.** Both D-07 and D-08 touch the live debtor path. Planner must require heavy debtor regression coverage (the existing static guard `__tests__/out-of-band.test.ts` and the classifier-screen-worker grep test must stay green; add debtor Stage-3 behavior tests around the coordinator refactor).

### Dry-run governance (cross-cutting; folds the v9.0 todo)
- **D-10:** **Adopt the full per-stage granular dry-run gating now** (folds `granular-dry-run-gating-per-stage-and-handler` todo, was targeted v9.0). Replace the narrow `debtor.labeling_settings.dry_run` boolean (which today only gates intent labeling — Stage 1 cleanup runs live regardless, the operator-mental-model footgun from Phase 82.8 UAT) with **per-stage + per-handler registry flags**: `stage_1_archive`, `stage_1_cleanup`, `stage_3_labeling`, and a `stage_4_handler_<name>` map. Stage 0/1-classify/2/3-classify stay always-live read-only.
- **D-11:** Sales defaults to dry-run/blocked for every side-effect stage; debtor's current effective gating must be **preserved exactly** through the migration (no behavior change to debtor's live side-effects — re-assert the 82.8 reality, don't silently flip the 867-delete cleanup path).

### Ingest verify (VERIFY-01)
- **D-12:** **Add a per-mailbox dimension** to `pipeline_health_snapshots` (`web/lib/inngest/functions/pipeline-health-monitor.ts` already probes `sales-email` per-swarm). Group throughput by source mailbox; confirm ~33/day for `verkoop@smeba.nl` is visible.
- **D-13:** **Sugar disposition = zero-assertion.** SugarCRM was **never actually connected** for sales ingest (the `sales-email-analyzer/fetch-sugarcrm-emails.ts` script was legacy and never wired). So there should be **no `source='sugarcrm'` rows** in `email_pipeline.emails`. Phase 110 asserts the count is **0** and flags any non-zero as an anomaly to investigate — no delete/mark/disposition machinery. (Dead *code* removal is Phase 115.)

### Claude's Discretion
- Exact contents of `canonical_context_shape` for sales (the Stage 2→3 context-shape contract) — derive from the RFC + debtor's shape; research/planning.
- Where sales `*.generated.ts` files physically live (per-swarm directory layout under `web/lib/automations/`).
- Migration file naming/splitting and the precise registry column shape for the per-stage dry-run flags (jsonb map vs discrete columns).

### Folded Todos
- **`2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`** (priority M, target v9.0) — *Original problem:* `debtor.labeling_settings.dry_run` only gates intent labeling; Stage 1 iController cleanup runs live regardless (867 real deletes under nominal "dry-run"), contradicting the operator's mental model. *How it fits:* D-10/D-11 adopt its proposed per-stage/per-handler model as the dry-run gate for the forward-referenced sales config, replacing the narrow boolean cross-swarm.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (locked RFCs — win over code-inferred conclusions)
- `docs/agentic-pipeline/README.md` — 5-stage funnel, Stage 2→3 context-shape contract (`canonical_context_shape`), 4-axis override model, registry-driven swarm shapes.
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 noise filter (regex Pass 1 + LLM 2nd-pass); sales is LLM-only (`stage1_regex_module=null`).
- `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier; `swarm_intents` dispatch; hard separation (a row is in exactly one of `swarm_noise_categories` or `swarm_intents`).
- `docs/debtor-email-pipeline-architecture.md` — debtor implementation map; the `debtor.email_labels` anchor being generalized away from.

### Phase 110 inputs
- `.planning/ROADMAP.md` §Phase 110 — goal + 4 success criteria.
- `.planning/REQUIREMENTS.md` — REVIEW-01, SWARM-01, SWARM-02, VERIFY-01 (lines 34/38/39/58).
- `.planning/STATE.md` — V9.0 re-sequencing notes (Sugar→Outlook, two-track parallelism, v8.2 RESL seam interleave).

### Folded todo
- `.planning/todos/pending/2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` — the per-stage gating spec adopted by D-10.

### Patterns (CLAUDE.md)
- Registry-driven literal-union codegen (Phase 69 D-03): `npm run codegen && git diff --exit-code` CI gate; never hand-edit `*.generated.ts`.
- RLS mandatory on every new table in an exposed schema; SECURITY INVOKER views; migration template `supabase/migrations/_template.sql`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` + `_shell/*` (14 components, `_lib/*`) — the Bulk Review shell is **already registry-generic**; the only blocker is the `swarmType !== "debtor-email"` 404 (line 84-86) and the `debtor.email_labels` anchor.
- `web/lib/bulk-review/hydrate.ts` — materializes a row from `email_labels` (debtor) + `pipeline_events` (public) + `agent_runs` (public). Evidence reads are swarm-generic; anchor + `intent.generated`/`entity.generated` imports are debtor-bound.
- `web/lib/inngest/functions/stage-3-dispatcher.ts` — **already branch-free**: wildcard `*/predicted` listener, derives `swarm_type` from payload, looks up `swarm_intents` via registry. The model the coordinator refactor (D-07) should mirror.
- `web/lib/inngest/functions/classifier-screen-worker.ts` — Stage 1, **already registry-driven, zero swarm branches**; protected by a static grep test (`classifier-screen-worker.test.ts:667`).
- `web/lib/inngest/functions/pipeline-health-monitor.ts` — already probes `["debtor-email","info-routing","sales-email"]`, writes `pipeline_health_snapshots`; per-swarm, needs the per-mailbox dimension (D-12).
- `web/app/api/automations/sales-email/ingest/route.ts` — sales ingest is **Outlook-only** (`SALES_SOURCE="outlook"`, mailbox `verkoop@smeba.nl`), idempotent on `(source, source_id)`.
- `web/scripts/gen-tenant-domains.ts` — already emits a per-swarm map including `sales-email`; the shape D-08 generalizes the entity/intent generators toward.

### Established Patterns
- Hard separation: a row is in exactly one of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — the generalized hydrator must keep enforcing this.
- Registry-as-source-of-truth + build-time codegen (Phase 69) — migration + codegen committed atomically.
- Inngest replay-safety: non-deterministic ids inside `step.run()`; `inngest.send` not destructured.

### Integration Points
- `swarms` registry (`supabase/migrations/20260429b_swarm_registry.sql` + evolutions) — the single source the migration enriches.
- The `debtor.labeling_settings.dry_run` boolean — being replaced cross-swarm by per-stage registry flags (D-10); preserve debtor's effective behavior (D-11).
- Cross-track seam: Phase 114 depends on v8.2 RESL-01/02/03 (debtor workspace) — `stage2_entity_resolver` is forward-referenced here, inert until that seam lands.

</code_context>

<specifics>
## Specific Ideas

- "Generalize the hydrator as we have info-routing up and running as a swarm as well" — the generalization is explicitly motivated by serving 3 swarms, not bespoke sales work.
- "We shouldn't have any sugar rows as Sugar was never connected" — VERIFY-01's disposition clause is an assertion of absence, not a cleanup task.

</specifics>

<deferred>
## Deferred Ideas

- **Reviewed Todos (not folded):**
  - `2026-04-23-create-draft-idempotency-and-cleanup.md` — debtor iController draft handler; not a sales/visibility concern.
  - `2026-04-23-debtor-review-pipeline-provenance-and-scoping.md` — debtor-specific provenance/scoping; out of Phase 110 scope.
  - `2026-05-18-override-note-flow-unclear.md` — Bulk Review override+note UX; a feedback-flow refinement, belongs with the override/feedback work, not foundation.
- Per-mailbox health for **multi-mailbox** swarms — D-12 adds the dimension generically, but the multi-mailbox UX/alerting tuning is future work (sales is single-mailbox today).

</deferred>

---

*Phase: 110-Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify*
*Context gathered: 2026-06-03*
