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
