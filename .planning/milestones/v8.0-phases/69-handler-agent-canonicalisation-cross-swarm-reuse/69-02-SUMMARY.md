---
phase: 69
plan: 02
wave: 2
status: complete
applied_at: 2026-05-04
operator: n.crutzen@icloud.com
---

# Phase 69 Wave 2 — Migrations Applied (Supabase MCP, operator-gated)

## What was applied

### A1 decision (operator, 2026-05-04)

**5 Benelux brands only** seeded in `swarms.entity_brand`. CONTEXT.md D-Discretion-3's proposal for 7 brands was pruned to today's go-live set. `iccafe` and `iccafe-france` deferred to a future onboarding phase via the CANO-04 zero-prompt-edit path. Captured in project memory: `project_brand_scope.md`.

Migration `20260505a_entity_brand_expansion.sql` was edited before apply to remove the `iccafe` / `iccafe-france` `jsonb_build_object` blocks; comment annotates the deferral.

### Migration `20260505a_entity_brand_expansion.sql` (CANO-02, D-01)

Applied via `mcp__supabase__apply_migration` (name `phase69_entity_brand_expansion`).

**Before (live state, jsonb-of-strings, n=5):**
```
["smeba", "smeba-fire", "sicli-noord", "sicli-sud", "berki"]
```

**After (jsonb-of-objects, n=5, first_kind=object, codes=`smeba,smeba-fire,sicli-noord,sicli-sud,berki`):**
Per-brand metadata with `code`, `display_name`, `register_language`, `register_dialect`, `signoff_phrase`, `formal_address`, `nxt_database_alias`, `icontroller_company`. `sicli-sud` carries `fr` / `fr-BE` / `Cordialement` / `vous`; the other four are `nl` / `nl-NL` (smeba/smeba-fire/berki) or `nl-BE` (sicli-noord) / `Met vriendelijke groet` / `u`.

Idempotency guard `jsonb_typeof((entity_brand)->0) = 'object'` confirmed — re-applying is a no-op. Sanity check (no element without `code`) passed.

### Migration `20260505b_orq_agents_cross_cutting.sql` (CANO-03, D-08)

Applied via `mcp__supabase__apply_migration` (name `phase69_orq_agents_cross_cutting`).

`public.orq_agents` row for `debtor-copy-document-body-agent`: `swarm_type` flipped from `debtor-email` to `cross-cutting`. Verified post-apply.

Runtime read-path keys on `agent_key` (`web/lib/automations/orq-agents/client.ts:35`) — flip is organisational/tagging only, no runtime semantic change.

## Verification

```sql
-- 20260505a verify:
select swarm_type, jsonb_array_length(entity_brand) as n,
       jsonb_typeof(entity_brand->0) as first_kind,
       (select string_agg(e->>'code', ',') from jsonb_array_elements(entity_brand) e) as codes
from public.swarms where swarm_type='debtor-email';
-- → debtor-email | 5 | object | smeba,smeba-fire,sicli-noord,sicli-sud,berki

-- 20260505b verify:
select agent_key, swarm_type from public.orq_agents
 where agent_key='debtor-copy-document-body-agent';
-- → debtor-copy-document-body-agent | cross-cutting
```

## Requirements satisfied

- **CANO-02** — Brand list now data-driven (jsonb-of-objects with per-brand register metadata).
- **CANO-03** — Cross-cutting handler agent flagged in registry.

## Out-of-scope — deferred to later waves

- Wave 3 (Plan 03): regenerate `entity.generated.ts` against the live shape; extend `web/lib/swarms/registry.ts`.
- Wave 4 (Plan 04): refactor `classifier-invoice-copy-handler` to consume `brand_register` input.
- Wave 5 (Plan 05): Orq.ai `update_agent` PATCH on the live `debtor-copy-document-body-agent` prompt.
- Wave 6 (Plan 06): Run 9 regression fixtures + LIVE_SMOKE=1.
- Wave 7 (Plan 07): docs + REQUIREMENTS.md check-off.
