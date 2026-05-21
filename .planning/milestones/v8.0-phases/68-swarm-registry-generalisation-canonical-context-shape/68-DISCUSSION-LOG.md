# Phase 68: swarm_registry generalisation + canonical context shape — Discussion Log

> **Audit trail only.** Decisions in `68-CONTEXT.md`.

**Date:** 2026-05-04
**Mode:** `--auto`
**Areas discussed:** Migration shape, module-loading mechanism, side_effects schema, swarm_intents schema, code-edit scope, cutover

---

## Migration shape (SWRM-01, SWRM-02)

| Option | Pros | Cons | Selected |
|---|---|---|---|
| Single migration: 4 new swarms columns + new swarm_intents table + backfill UPDATEs | Atomic; one operator-gated apply | Larger blast surface | ✓ |
| Two migrations (columns first, table second) | Smaller, easier to rollback | Doubles operator gates | |
| Add columns now; defer swarm_intents until Phase 73 | Phase 73 owns the table since sales-email needs it | Splits SWRM-02 across phases; breaks the "registry-only onboarding" claim | |

**Auto-selected:** single migration (option 1).
**Why:** Phase 67 proved the MCP apply_migration workflow works cleanly; one operator gate is fine. Splitting creates two mostly-empty migrations.

---

## stage1_regex_module / stage2_entity_resolver mechanism

| Option | Pros | Cons | Selected |
|---|---|---|---|
| Module path string + dynamic `import()` via cached helper | Zero new tooling; standard ES pattern; one cache | TypeScript loses static checking inside loader | ✓ |
| Class registry with each swarm registering at import time | Fully type-safe | Forces every swarm module to load on every cold start; defeats data-driven onboarding | |
| Database-stored TypeScript code | Pure data-driven | Massive security surface; sandbox required; rejected | |

**Auto-selected:** module path + dynamic import (option 1).
**Why:** Vite/Next.js dynamic imports are first-class; one cast at the loader boundary keeps downstream callers type-safe.

---

## stage3_coordinator_agent_key

| Option | Pros | Cons | Selected |
|---|---|---|---|
| `orq_agents.agent_key` reference | Coordinator agents already live in Orq.ai; existing `loadAgentSpec` helper | None — this is the established pattern | ✓ |

**Auto-selected:** Orq agent key. (No alternative considered.)

---

## canonical_context_shape storage

| Option | Pros | Cons | Selected |
|---|---|---|---|
| Versioned JSON Schema-like jsonb document with `version` + `fields` map | Flexible; readable; Phase 69 can consume | No runtime validation | ✓ |
| Strict JSON Schema (RFC 8927) | Validatable | Heavy for our use case; adds ajv dependency | |
| Reference to a TS type by string name | Type-safe at compile | Runtime can't read TS types | |

**Auto-selected:** versioned jsonb (option 1).

---

## side_effects[] schema

| Option | Pros | Cons | Selected |
|---|---|---|---|
| Array of `{event, trigger, gate, phase_origin}` descriptors | Generic enough for current 2 side-effects + future ones; gate is data-driven | Slightly verbose | ✓ |
| Per-side-effect column on swarms (`tag_in_icontroller_event`, `cleanup_event`) | Type-safe | Does not generalise; Phase 67's whole point was avoiding this | |
| External side_effects table | More normalisation | Overkill for ≤5 entries per swarm | |

**Auto-selected:** jsonb array of descriptors (option 1).

---

## swarm_intents schema (composite PK)

| Option | Pros | Cons | Selected |
|---|---|---|---|
| `(swarm_type, intent_key)` composite PK + ON DELETE CASCADE | Natural key; deletes cleanly with swarm | None | ✓ |
| Surrogate `id` PK + UNIQUE (swarm_type, intent_key) | More flexible | Adds id column for no functional gain | |

**Auto-selected:** composite PK.

---

## Defensive fallback (registry → hardcoded)

| Option | Pros | Cons | Selected |
|---|---|---|---|
| No fallback — throw on missing registry row | Phase 68's spirit; surfaces misconfig immediately | First production deploy is a hard cutover | ✓ |
| Try registry, fall back to hardcoded | "Safe" rollout | Hardcoded path lives forever; defeats SWRM-03 | |

**Auto-selected:** no fallback.
**Why:** the migration backfills debtor-email completely; there is no "missing row" scenario in production unless someone deletes data.

---

## Cutover sequencing

| Option | Pros | Cons | Selected |
|---|---|---|---|
| 6-wave PR (migration → helpers → swap call sites → sales-email-stub test → docs) | Clean dependency order; testable per wave | Single big PR | ✓ |
| Multi-PR rollout | Smaller diffs | More operator gates; harder to keep registry + callers in sync | |

**Auto-selected:** 6-wave single PR.

---

## Claude's Discretion

- Alias-export vs rename of `resolveDebtor` → `resolveEntity` — recommend alias.
- Migration column order — cosmetic.
- Seed `canonical_context_shape` in Phase 68 vs Phase 69 — recommend Phase 68.
- Add `swarms.entity_brand` jsonb in Phase 68 (Phase 69 needs it) — recommend YES.

## Deferred Ideas

- Phase 69 CANO-* (handler canonicalisation).
- Phase 70 TELE-* (`pipeline_events`).
- Phase 71 LERN-* (override learning).
- Phase 73 (actual sales-email implementation).
- Phase 66 carryover: Stage 1 worker.
- Phase 67 carryover: `findMessageRow` pagination.

---

*Generated by `/gsd-discuss-phase 68 --auto`. Each "Selected" mark reflects the recommended option Claude chose; user can revise `68-CONTEXT.md` directly before `/gsd-plan-phase`.*
