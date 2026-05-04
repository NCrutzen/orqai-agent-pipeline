# Phase 69: Handler-agent canonicalisation (cross-swarm reuse) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 69-handler-agent-canonicalisation-cross-swarm-reuse
**Mode:** `--auto` (Claude selected the recommended option for each gray area; no interactive Q&A)
**Areas discussed:** Brand registry shape, Body-agent prompt refactor approach, Cross-cutting `swarm_type` declaration, Codegen vs runtime types, Cutover sequencing

---

## Brand registry shape (CANO-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `swarms.entity_brand` as `text[]` of brand codes; ship per-brand metadata in a new `entity_brands` table | Normalised, joinable, idiomatic SQL | |
| Expand `swarms.entity_brand` jsonb to per-brand metadata objects | Single migration, fewer moving parts, brands stay 1:1 with swarm | ✓ |
| Keep `text[]` and hardcode per-brand metadata in TS | Fast but defeats CANO-04 (zero prompt edit on new brand) | |

**Auto-selected:** jsonb expansion on `swarms.entity_brand` (D-01).
**Why:** brands are 1:1 with swarm today; second table is YAGNI. Phase 68 already columnised entity_brand on `swarms`.

---

## Body-agent prompt refactor approach (CANO-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Pass union of all brands; agent picks one based on input | Same prompt, multi-tenant; agent can leak cross-brand context | |
| Pass single brand metadata object; prompt templates from it | One brand per invocation, no cross-brand leak, fully data-driven | ✓ |
| Generate per-brand prompt variants in Orq | One agent_key per brand × intent; explodes catalog | |

**Auto-selected:** single-brand metadata input (D-04, D-05).
**Why:** one agent serves all brands; brand context is bounded per invocation; matches Phase 68's PipelineStageContext intent.

---

## Cross-cutting `swarm_type` declaration (CANO-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Add `swarm_type='cross-cutting'` to `debtor-copy-document-body-agent` only; keep loader keyed on agent_key | Minimal change, runtime unchanged, tagging hint for tooling | ✓ |
| Add a separate `is_cross_cutting boolean` column on `orq_agents` | Explicit, queryable, but redundant with swarm_type | |
| Add CHECK constraint enforcing swarm_type ∈ ('debtor-email', 'sales-email', 'cross-cutting', ...) | Hardens contract but blocks future swarms | |

**Auto-selected:** swarm_type='cross-cutting' on body agent only (D-08, D-09, D-10).
**Why:** convention over constraint; runtime keyed on agent_key already; defer enforcement until needed.

---

## Codegen vs runtime types (CANO-02 implementation)

| Option | Description | Selected |
|--------|-------------|----------|
| Drop `Entity` enum, use `string` everywhere | Maximum flexibility, loses compile-time safety | |
| Codegen `Entity` literal-union from registry into a generated TS file; commit the generated file | Strict types AND zero-edit onboarding; codegen step in CI | ✓ |
| Keep `Entity` enum hardcoded; manually edit on new brand | Defeats CANO-04 acceptance | |

**Auto-selected:** codegen from registry (D-03).
**Why:** preserves TS strictness; onboarding = registry INSERT + `npm run codegen`; matches Supabase's own `gen types typescript` pattern.

---

## Cutover sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Single PR with sequential waves (migration → loader → handler → Orq prompt → tests → docs) | Atomic, reviewable, operator checkpoints between waves | ✓ |
| Two PRs: infra (migrations + loader) then runtime (handler + Orq prompt) | Slower but reduces blast radius if Orq update fails | |
| Feature-flagged rollout with both old + new prompt active in parallel | Maximum safety but adds shim code that becomes dead weight | |

**Auto-selected:** single PR, sequential waves (D-18).
**Why:** Phase 67/68 precedent; Wave 1 + Wave 4 are operator-gated (Supabase MCP + Orq MCP); rollback is `git revert + reapply migration in reverse`; debtor-email volume is low enough to absorb a minutes-long deploy gap (D-19).

---

## Claude's Discretion

- Codegen script language (TS via tsx vs compiled JS).
- Exact wording of new `<brand_register>` prompt block — within D-05 constraints.
- Per-process Map cache vs Supabase RT cache for `loadBrandRegister`.
- Whether to bump `BODY_VERSION` to v2.
- Whether sales-email-stub test row stays in DB or is created/torn down per test.

## Deferred Ideas

- Canonicalisation of handler agents that don't yet exist (payment-dispute, etc.).
- CHECK constraint on `orq_agents.swarm_type`.
- `swarms.entity_brand` audit/history table.
- Separate `entity_brands` normalised table.
- Removal of `inferLanguageFromEntity` if it has callers beyond the invoice-copy handler.
