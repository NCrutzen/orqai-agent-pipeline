---
phase: 68
plan: 01
status: complete
date: 2026-05-04
---

# Plan 68-01 — Swarm registry migration

## What was built

`supabase/migrations/20260504b_swarms_registry_generalisation.sql` — applied to project `mvqjhlxfvtqqubqgdvhz` via Supabase MCP `apply_migration`.

- 5 new columns on `public.swarms`: `stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `canonical_context_shape` (jsonb), `entity_brand` (jsonb).
- New table `public.swarm_intents` (composite PK `(swarm_type, intent_key)`, FK ON DELETE CASCADE → `swarms`, `handler_event` index, `updated_at` trigger).
- Backfill: `debtor-email` swarms row populated with all 5 stage bindings + 2-element `side_effects[]` carrying the `kind` discriminator (`inngest_event` for icontroller-tag, `automation_run_insert` for cleanup).
- Backfill: 8 `swarm_intents` rows for the V2 INTENT enum; only `copy_document_request` carries a non-null `handler_agent_key` (`debtor-copy-document-body-agent`).

## Verification (live SQL probe)

| Probe | Expected | Actual |
|-------|----------|--------|
| New columns on swarms | 5 | 5 |
| swarm_intents rows for debtor-email | 8 | 8 |
| stage1_regex_module | `@/lib/debtor-email/classify` | ✓ |
| stage2_entity_resolver | `@/lib/automations/debtor-email/resolve-debtor` | ✓ |
| stage3_coordinator_agent_key | `debtor-intent-agent` | ✓ |
| side_effects length | 2 | 2 |
| entity_brand length | 5 | 5 |

## Requirements satisfied

- **SWRM-01** — Schema in place (5 columns + new table).
- **SWRM-02** — `swarm_intents` seeded with 8 V2 intents.
- **SWRM-04** (partial) — `side_effects[]` carries `kind` discriminator.
