> **Status:** RFC — locked architectural shape for v8.0 Agentic Platform (milestone 63-73)
> **Audience:** engineers building or extending agentic pipelines (debtor-email today, sales-email Phase 73)
> **Supersedes:** the cross-swarm shape sections of `../debtor-email-pipeline-architecture.md` (that doc retained as the debtor-email implementation map)

## What This Is

This README is the canonical entry point for the v8.0 5-stage funnel architecture for cross-swarm agentic pipelines at Moyne Roberts. Read it first; per-stage and contract details live in self-contained sibling files indexed below — one read of any sibling = full understanding of that stage or contract.

The shape is workflow-first, not agent-first. Each stage does the smallest job that justifies its own LLM (or no LLM at all when a regex / lookup will do). Decomposition into stages exists to keep prompts narrow, telemetry per-stage, and graduated automation tractable. Anthropic's *Building Effective Agents* (`https://www.anthropic.com/engineering/building-effective-agents`) frames the workflow-vs-agent distinction we use throughout: most production work is chained workflow with deterministic routers; true agentic loops are reserved for Stage 3.5 escalation only.

## The 5-Stage Funnel

```
                    inbound (email / webhook / event)
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │ Stage 0 — Input Safety        │
                    │ injection / spam / budget gate│
                    └──────────────────────────────┘
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │ Stage 1 — Regex Routing       │
                    │ deterministic category switch │
                    └──────────────────────────────┘
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │ Stage 2 — Entity Enrichment   │
                    │ thread / sender / lookup      │
                    │ emits PipelineStageContext    │
                    └──────────────────────────────┘
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │ Stage 3 — Intent Coordinator  │
                    │ ranked-intent classifier      │
                    │ (Stage 3.5 escalation rare)   │
                    └──────────────────────────────┘
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │ Stage 4 — Handler             │
                    │ bounded single-shot agent     │
                    │ + zapier_tools allowlist      │
                    └──────────────────────────────┘
                                  │
                                  ↓
                       side-effects (NXT, iController,
                          Outlook, Supabase, …)
```

Each stage produces a telemetry row; Stage 2 produces the cross-swarm context contract that Stage 3 consumes; Stages 1–4 each carry one override axis (see `./override-model.md`).

## Tenancy (D-08)

### Brand multitenancy is day-1

Every routing, prompt-selection, category, and handler-allowlist decision is scoped by `entity_brand`. There are no hardcoded brand enums anywhere in the codebase — brand is a registry-driven dimension on every pipeline row. Adding a brand is a registry insert, not a code change.

### Today's brands (walkerfire.icontroller.eu tenant)

The following 6 entity brands are flowing through production today:

- `smeba`
- `smeba-fire`
- `firecontrol`
- `sicli-noord`
- `sicli-sud`
- `berki`

Note: `walkerfire.icontroller.eu` is the iController **tenant** (umbrella), NOT a brand. All 6 brands above route through that single tenant.

### Source of truth (today)

Today the per-mailbox columns `debtor.labeling_settings.brand_id` (2-letter NXT code) and `debtor.labeling_settings.nxt_database` are the working source of truth. Phase 68 (SWRM-01) introduces the unified `swarms.entity_brand` registry as the single source of truth; once that ships, today's per-mailbox columns become a denormalised read-model populated from the registry.

### Future brand additions

UK/IE expansion is in the Phase 999.1 backlog — brand names TBD; new brands onboard via registry insert. Do NOT use placeholder names.

## Swarm Shapes

> Added 2026-05-20 once a second swarm (`info-routing`, Phase 88) made the variance explicit.

Not every swarm runs every stage. Three shapes use the **same** 5-stage funnel with different stages nulled out — no new stages, no forks. Pick the shape that matches what the swarm does; don't copy debtor-email's shape by default.

### Handler swarm — full funnel

**Canonical example:** debtor-email.

All five stages active. Stage 2 resolves a customer entity; Stage 4 actuates side effects (drafts replies, fetches documents, updates records). The rest of this RFC describes this shape in detail.

- **Use when:** every inbound is customer-bound and the swarm produces direct side effects.
- **Registry config:** `swarms.stage2_entity_resolver` set; `swarm_intents` rows with non-null `handler_event`.

### Router swarm — no Stage 2, no Stage 4

**Canonical example:** info-routing for `info@smeba.nl` (Phase 88; see [`../../.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md`](../../.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md) for the spike-derived blueprint).

Stage 1 filters noise, Stage 3 ranks intents (typically "which department should handle this"), Stage 4 is **terminal-by-operator** — the row surfaces in Bulk Review and a human forwards. No Stage 2 because the inbox is not customer-bound; no Stage 4 handler because the routing decision IS the deliverable.

- **Use when:** the inbox is a triage point, not a workflow endpoint. Volume too low or vocabulary too unstable to justify Stage 4 handlers.
- **Registry config:** `swarms.stage2_entity_resolver = NULL`; `swarm_intents` rows with `handler_event = NULL`.
- **Cross-swarm dispatch already works at Stage 1:** `swarm_noise_categories.action = 'swarm_dispatch'` with `swarm_dispatch='<target-swarm>/<event>'` hands a row off deterministically. No code change required.

### Hybrid swarm — selective Stages 2 and 4

**Canonical example:** none yet. Forward-referenced because the user model demands it (Q2-Q3 2026): a single inbox handles both in-scope work AND traffic that belongs to other swarms.

Mixed: some intents resolve entities and run handlers (handler-shaped), others terminate as forwards or dispatch to another swarm (router-shaped). Stage 2 fires **conditionally per intent**; Stage 4 handlers come in three kinds:

- **actuator** — does work (draft reply, update record). Today's only kind.
- **forwarder** — sends the message to an external mailbox / human queue.
- **dispatcher** — emits a cross-swarm event that re-enters the target swarm's pipeline.

#### Cross-Swarm Dispatch Contract

Locked 2026-05-20. Hybrid swarms (and Stage 1 `swarm_dispatch` from a router swarm) emit the same event shape; the target swarm consumes it through a partial Stage 0 re-run.

**Event payload — reference, never copy:**

```ts
event: '<target_swarm>/dispatch.requested'
data: {
  source_swarm: string,                  // e.g. 'info-routing'
  source_event_id: string,               // FK to pipeline_events.id (source swarm's terminal row)
  email_id: string,                      // FK to email_pipeline.emails (shared corpus)
  dispatched_at: string,                 // ISO timestamp
  dispatched_by: 'stage-1' | 'stage-4-dispatcher',
  dispatch_reason: string,               // noise_category_key OR intent_key on source swarm
}
```

The email already lives in `email_pipeline.emails`. Cross-swarm dispatch means "now run swarm B's pipeline against email X." Never serialise message body or attachments into the event.

**Stage 0 in target swarm — partial re-run:**

- **Skip:** injection-check, spam-check (already passed in source swarm; re-running wastes tokens and risks inconsistent verdicts).
- **Re-run:** per-run cost ceiling (target swarm may have different `BUDG-01` thresholds), entity-brand scope check (target may not handle this brand).
- Implementation: Stage 0 reads `dispatched_from` flag on the inbound event and skips subchecks listed as source-passed in `pipeline_events.stage0_subchecks` of the source row.

**`pipeline_events` lineage — single chain, FK back:**

- Source swarm's terminal row: `decision='dispatched_to:<target_swarm>'`, `terminal=true`.
- Target swarm's Stage 0 row carries a new column `dispatched_from_event_id` → FK to the source row.
- Lineage query is a recursive CTE on `dispatched_from_event_id`.

**Bounce-back on target rejection:**

If the target swarm cannot complete (e.g. Stage 2 finds no customer, or Stage 3 emits `unknown` after exhausting its vocabulary), the row surfaces in the **target** swarm's Bulk Review with a `bounce_back_to_source` action available to the operator. Target swarm has the right context to triage; bouncing back is an explicit operator decision, not automatic.

**Loop guard:**

Dispatch chains are capped at recursive depth ≤ 2 via `dispatched_from_event_id`. Beyond depth 2, Stage 0 force-terminates the row to operator review in the swarm where the cap tripped. Prevents A→B→A pathologies.

**Cross-swarm override learning — deferred to V9.0:**

When an operator overrides a target-swarm decision with "this was misrouted from <source_swarm>", the source swarm's Stage 1 / Stage 4 dispatcher decision should receive a negative learning signal (Axis 1 or Axis 4 scoped to the *source* swarm, not the target). This is a `pipeline_events` writer concern and a Learning Inbox UX concern — both belong in V9.0 (Promotion Recommender + Learning Inbox). Until V9.0 ships, target-swarm overrides do not propagate back to source-swarm learning; that's a known gap, not a contract ambiguity.

### Per-stage nullability

| Stage | Always runs? | Skip condition |
|---|---|---|
| 0 — Safety | Yes | Never. Every inbound runs Stage 0 (forward-ref Phase 64). |
| 1 — Regex | Yes | Never. Stage 1 is the deterministic entry point. |
| 2 — Entity | No | `swarms.stage2_entity_resolver IS NULL` (whole-swarm skip) OR per-intent flag (hybrid, forward-ref). |
| 3 — Coordinator | Yes when Stage 1 emits `unknown` | A categorical Stage 1 hit terminates the row without ever reaching Stage 3. |
| 4 — Handler | No | `swarm_intents.handler_event IS NULL` → operator-terminal in Bulk Review. |

### What this means for designing a new swarm

1. Ask: is the inbox **customer-bound** (every email maps to one account)?
   - Yes → Stage 2 required → likely Handler shape.
   - No → Stage 2 nulled → likely Router shape.
2. Ask: does Stage 3's intent vocabulary point to **side effects we control** or to **other humans / other swarms**?
   - Control side effects → Stage 4 handlers (actuator kind).
   - Hand off → Stage 4 nulled (Router) OR Stage 4 forwarder/dispatcher (Hybrid).
3. Register via inserts into `swarms`, `swarm_noise_categories`, `swarm_intents`. No new Stage 1/2/3 code paths — if you find yourself adding per-swarm branches in the classifier or coordinator workers, that's a cross-swarm architecture bug, fix it upstream.

## Index

**Stages:**

- [`./stage-0-safety.md`](./stage-0-safety.md) — input safety / injection / budget gate (forward-ref Phase 64)
- [`./stage-1-regex.md`](./stage-1-regex.md) — deterministic regex routing
- [`./stage-2-entity.md`](./stage-2-entity.md) — entity enrichment, emits `PipelineStageContext`
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md) — ranked-intent coordinator (Stage 3.5 escalation principle)
- [`./stage-4-handler.md`](./stage-4-handler.md) — bounded single-shot handler + tool allowlist

**Contracts:**

- [`./context-shape-contract.md`](./context-shape-contract.md) — Stage 2→3 `PipelineStageContext` contract (TS interface + prose semantics, `context_version: 1`)
- [`./override-model.md`](./override-model.md) — 4-axis override taxonomy (one axis per Stage 1–4)
- [`./graduated-automation.md`](./graduated-automation.md) — promotion-ladder principles (LLM → deterministic), thresholds deferred to Phase 71

**Sibling (different concern):**

- [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) — UI plumbing for `automation_runs` / kanban surface. NOT superseded by this RFC; it covers the read-model surfaced to Bulk Review and Kanban, not the pipeline shape.

## Reading Order

Recommended path:

1. This README (you're here) — overall shape, tenancy, index.
2. The three contract docs (Wave 1) — `context-shape-contract.md`, `override-model.md`, `graduated-automation.md`. These define the cross-stage invariants.
3. The five per-stage docs (Wave 2) — read in order 0 → 4 for the full funnel, or jump directly to a single stage when working on it.

Single-stage focus: read just that stage doc. Everything needed is either inline or linked OUT — per-stage docs do not require the others to be understood.

## Implementation Patterns (link out)

These existing pattern docs hold the concrete how-tos. RFC docs do NOT duplicate them.

- [`../orqai-patterns.md`](../orqai-patterns.md) — Orq.ai agent + LLM Router patterns
- [`../zapier-patterns.md`](../zapier-patterns.md) — Zapier-tool registry + NXT SQL via whitelisted IP
- [`../inngest-patterns.md`](../inngest-patterns.md) — durable functions, business-hours cron, watermark syncs
- [`../browserless-patterns.md`](../browserless-patterns.md) — Browserless.io playwright-core patterns
- [`../supabase-patterns.md`](../supabase-patterns.md) — service-role writes, JSONB double-encoding

## Forward References (RFC names, later phases ship)

These names appear in the RFC because the architecture depends on them; they ship in the listed phase.

| Forward-ref | Where named | Ship phase |
|---|---|---|
| `pipeline_events` (canonical events table) | stage-0..4, contract docs | Phase 70 |
| `zapier_tools.allowed_for_intents` (per-intent tool allowlist) | stage-4-handler.md | Phase 64 |
| `swarms.entity_brand` registry | README tenancy, contract docs | Phase 68 |
| `swarm_intents` table | stage-3-coordinator.md, override-model.md | Phase 68 |
| Stage 3.5 full design (orchestrator-worker fan-out) | stage-3-coordinator.md | Phase 65 |
| Per-run cost ceilings (`BUDG-01`) | stage-0-safety.md | Phase 64 |
| Stage 0 implementation (`SAFE-01..04`) | stage-0-safety.md | Phase 64 |
| `web/lib/agentic-pipeline/types.ts` codification | context-shape-contract.md | Phase 64 / 70 |
| Stage 4 handler canonicalisation | stage-4-handler.md | Phase 69 |
| Bulk Review 4-axis UI | override-model.md | Phase 71 |
| Concrete promotion thresholds (Wilson-CI gates) | graduated-automation.md | Phase 71 / 72 |
| Sales-email / SugarCRM swarm onboarding | stage-1, stage-3 parallel blocks | Phase 73 |
| UK/IE brand naming | README tenancy "Future brand additions" | Phase 999.1 backlog |
