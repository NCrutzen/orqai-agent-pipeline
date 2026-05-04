---
phase: 69
plan: 01
subsystem: handler-agent-canonicalisation
tags: [scaffold, wave-0, registry, brand-register, codegen, migrations, tests]
requires: []
provides:
  - supabase/migrations/20260505a_entity_brand_expansion.sql
  - supabase/migrations/20260505b_orq_agents_cross_cutting.sql
  - web/lib/swarms/brand-register.ts
  - web/scripts/gen-entity-types.ts
  - web/scripts/verify-entity-brand-shape.mjs
  - Wave 0 test scaffolds (10 files)
affects:
  - web/lib/swarms/types.ts (SwarmRow.entity_brand widened)
tech_stack:
  added: []
  patterns:
    - per-process Map cache (Phase 68 D-15 precedent)
    - structured-error class per failure mode (UnknownBrandError, MalformedRegistryError)
    - migration letter-suffix convention (20260505a, 20260505b)
    - LIVE_SMOKE=1 env-gated test pattern
key_files:
  created:
    - supabase/migrations/20260505a_entity_brand_expansion.sql
    - supabase/migrations/20260505b_orq_agents_cross_cutting.sql
    - web/lib/swarms/brand-register.ts
    - web/scripts/gen-entity-types.ts
    - web/scripts/verify-entity-brand-shape.mjs
    - web/__tests__/migrations/20260505a.test.ts
    - web/__tests__/migrations/20260505b.test.ts
    - web/lib/swarms/__tests__/brand-register.test.ts
    - web/lib/swarms/__tests__/brand-register-no-fallback.test.ts
    - web/__tests__/codegen/entity-types.test.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts
    - web/__tests__/canonicalisation/debtor-fixtures.test.ts
    - web/__tests__/canonicalisation/uk-ie-fixture.test.ts
    - web/__tests__/canonicalisation/sales-fixtures.test.ts
    - web/__tests__/canonicalisation/live-smoke.test.ts
    - .planning/phases/69-handler-agent-canonicalisation-cross-swarm-reuse/69-01-SUMMARY.md
  modified:
    - web/lib/swarms/types.ts
decisions:
  - Honour D-01 jsonb-of-objects shape; idempotent guard via jsonb_typeof
  - Honour D-08 swarm_type='cross-cutting' UPDATE for body agent only
  - Honour D-11 brand-register loader contract; per-process Map cache
  - Honour D-03 codegen-from-DB pattern; tsx execution
  - Distinguish UnknownBrandError vs MalformedRegistryError (operator action differs)
  - Widen SwarmRow.entity_brand union (string[] | object[] | null) so Wave 0/1 TS compiles
  - Live-smoke sentinel describe block keeps the file passing when LIVE_SMOKE!=1
metrics:
  duration_minutes: 18
  completed: 2026-05-04
  tasks_completed: 4
  commits: 4
---

# Phase 69 Plan 01: Wave 0 Scaffolding Summary

Stage 4 handler-agent canonicalisation Wave 0 — file-only scaffolding for the
brand-register migration, the loader module, the codegen script, and ten test
stubs that the later waves (1–5) will fill in. No live Supabase or Orq.ai
calls were made in this wave; the wave_context contract for parallel
executor agent-a1a49456ac6f99108 was respected.

## What Shipped

### Migrations (file-only — applied in Wave 1 by orchestrator)
- `supabase/migrations/20260505a_entity_brand_expansion.sql` — rewrites
  `swarms.entity_brand` for `swarm_type='debtor-email'` from a flat jsonb
  string array (Phase 68 D-Discretion-3 seed) into a jsonb array of
  `BrandRegister` metadata objects (7 brands seeded: smeba, smeba-fire,
  sicli-noord, sicli-sud, berki, iccafe, iccafe-france). Idempotent through a
  `jsonb_typeof((entity_brand)->0)='object'` guard; raises if any element
  ends up missing a `code` key (assertion DO block).
- `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` — UPDATE
  `public.orq_agents` setting `swarm_type='cross-cutting'` for
  `agent_key='debtor-copy-document-body-agent'`. Idempotent
  (`is distinct from` clause). No CHECK constraint added (D-Specific-7 / YAGNI).

### Brand-register loader skeleton
- `web/lib/swarms/brand-register.ts` — exports:
  - `BrandRegister` interface (8 fields: code, display_name,
    register_language, register_dialect, signoff_phrase, formal_address,
    nxt_database_alias, icontroller_company)
  - `loadBrandRegister(admin, swarm_type, brand_code)` — happy path returns
    the matching object; throws `UnknownBrandError` on miss; throws
    `MalformedRegistryError` if the registry is still in legacy string-array
    shape or any element fails the typeguard.
  - `loadAllBrandRegisters(admin, swarm_type)` — full list reader.
  - Per-process `Map` cache keyed on `(swarm_type, brand_code)` (Phase 68
    D-15 precedent). `__resetBrandRegisterCacheForTests` test helper.
- `web/lib/swarms/types.ts` — widened `SwarmRow.entity_brand` to the
  transition union `string[] | Record<string, unknown>[] | null` so the TS
  compile is clean during Wave 0/1 (legacy string seed) and Wave 2+
  (jsonb-of-objects).

### Scripts
- `web/scripts/gen-entity-types.ts` — codegen runner. Reads
  `swarms.entity_brand` via `loadAllBrandRegisters` and writes
  `web/lib/automations/debtor-email/coordinator/entity.generated.ts` exporting
  `type Entity = "smeba" | "sicli-noord" | ...` plus a sorted readonly
  `ENTITY_CODES` tuple. Wave 2 wires the `npm run codegen` script entry and
  CI hook.
- `web/scripts/verify-entity-brand-shape.mjs` — Wave 1 post-migration smoke.
  Asserts every element of `swarms.entity_brand` is an object carrying all 8
  required `BrandRegister` string fields. Exits with distinct codes for each
  failure mode (legacy shape, missing field, no row, etc).

### Wave 0 test stubs (10 files)
| File | Coverage in Wave 0 |
|------|--------------------|
| `web/__tests__/migrations/20260505a.test.ts` | 5 `it.todo` |
| `web/__tests__/migrations/20260505b.test.ts` | 3 `it.todo` |
| `web/lib/swarms/__tests__/brand-register.test.ts` | **8 real tests** + 2 `it.todo` |
| `web/lib/swarms/__tests__/brand-register-no-fallback.test.ts` | **3 real tests** (T-69-01 lock-in) |
| `web/__tests__/codegen/entity-types.test.ts` | 5 `it.todo` |
| `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler-isolation.test.ts` | 4 `it.todo` (T-69-02) |
| `web/__tests__/canonicalisation/debtor-fixtures.test.ts` | 6 brand `it.todo` + 2 invariants |
| `web/__tests__/canonicalisation/uk-ie-fixture.test.ts` | 5 `it.todo` (CANO-04) |
| `web/__tests__/canonicalisation/sales-fixtures.test.ts` | 6 `it.todo` |
| `web/__tests__/canonicalisation/live-smoke.test.ts` | LIVE_SMOKE=1-gated stubs + sentinel |

The two brand-register test files contain 11 real assertions exercising the
already-implemented loader skeleton (happy path for nl + fr brands,
UnknownBrandError, MalformedRegistryError for legacy shape, missing fields,
missing row; T-69-01 no-fallback lock-in including the operator-friendly
"known codes" message in the error).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `2791857` | feat(69-01): scaffold entity_brand expansion + cross-cutting migrations |
| 2 | `3f2b533` | feat(69-01): scaffold brand-register loader + widen SwarmRow.entity_brand |
| 3 | `3ff4827` | feat(69-01): scaffold codegen + entity_brand shape verifier scripts |
| 4 | `6246add` | test(69-01): scaffold Wave 0 test stubs for Phase 69 |

## Wave-Boundary Checks

- **No `mcp__supabase__apply_migration` calls** — confirmed.
- **No `mcp__orqai-mcp__update_agent` calls** — confirmed.
- **No edits to `STATE.md` / `ROADMAP.md`** — confirmed (orchestrator owns those).
- **No edits to runtime call sites** (`classifier-invoice-copy-handler.ts`,
  `coordinator/types.ts ENTITY enum`, `output-adapter.ts`) — confirmed; those
  changes are Wave 3 (D-13).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Type compatibility] Widened `SwarmRow.entity_brand` union**
- **Found during:** Task 2 (brand-register module wiring)
- **Issue:** `SwarmRow.entity_brand` was typed `string[] | null` (Phase 68
  shape). Adding the strictly-typed `BrandRegister[]` reader would break TS
  compile in Wave 0/1 because the registry is still string-array on disk
  until the migration applies.
- **Fix:** Widened to `string[] | Record<string, unknown>[] | null`. The
  brand-register loader is the canonical reader and rejects the legacy shape
  with `MalformedRegistryError` at runtime — TS doesn't need to encode the
  invariant.
- **Files modified:** `web/lib/swarms/types.ts`
- **Commit:** `3f2b533`

**2. [Rule 2 — Critical functionality] Distinct error classes per failure mode**
- **Found during:** Task 2
- **Issue:** D-11 only specified "throws structured error if `brand_code` not
  found" — but the legacy-shape failure (registry not migrated) and the
  unknown-code failure require different operator actions. A single error
  class would conflate them.
- **Fix:** Split into `UnknownBrandError` (data: code list mismatch) and
  `MalformedRegistryError` (infra: migration not applied / shape wrong).
  The brand-register-no-fallback test locks in that the unknown-code path
  surfaces `UnknownBrandError`, never a defensive fallback (T-69-01).
- **Files modified:** `web/lib/swarms/brand-register.ts`,
  `web/lib/swarms/__tests__/brand-register.test.ts`
- **Commit:** `3f2b533`, `6246add`

**3. [Rule 3 — Test discoverability] Sentinel block in `live-smoke.test.ts`**
- **Found during:** Task 4
- **Issue:** A `describe.skipIf(!LIVE_SMOKE)` block on its own with only
  `it.todo` cases reports "no tests found" when LIVE_SMOKE is unset, which
  some vitest reporters surface as a warning.
- **Fix:** Added a paired `describe.skipIf(LIVE_SMOKE)` sentinel describe
  with one passing `it` so the file always reports at least one collected
  test. No behavioural impact.
- **Files modified:** `web/__tests__/canonicalisation/live-smoke.test.ts`
- **Commit:** `6246add`

### Out-of-scope discoveries (not fixed; logged for orchestrator)
- Worktree's `web/node_modules` is not installed; running vitest in the
  worktree fails at config-load (missing `vitest/config`, `@vitejs/plugin-react`).
  Wave 0 doesn't require running the suite; Wave 2 will need `npm install` in
  the worktree. Not fixed here per scope-boundary rule.
- The plan filename `69-01-PLAN.md` referenced in the prompt's
  `<files_to_read>` does not exist on disk — only `69-CONTEXT.md`,
  `69-RESEARCH.md`, `69-VALIDATION.md`, `69-DISCUSSION-LOG.md`,
  `orq-baseline-prompt.txt`. Execution proceeded against the wave_context
  + CONTEXT.md decisions + VALIDATION.md Wave 0 list, which together fully
  specify the file-only scope.

## Authentication Gates
None. Wave 0 is file-only.

## Known Stubs
The following are intentionally stubs that **later waves will resolve**:
- Test files in `web/__tests__/migrations/`, `web/__tests__/codegen/`,
  `web/__tests__/canonicalisation/` and the `*-isolation.test.ts` are
  predominantly `it.todo` placeholders. They are discoverable today and Wave
  2/3/5 fills the assertions. This is the agreed Wave 0 deliverable per
  VALIDATION.md "Wave 0 Requirements".
- `loadBrandRegister` and `loadAllBrandRegisters` will throw
  `MalformedRegistryError` against any current production database because
  Wave 1 hasn't applied the expansion migration yet. The skeleton is wired
  end-to-end; only the on-disk shape is the missing piece.

## Threat Flags
None new. Phase 69 threat register (T-69-01 cross-brand register leak,
T-69-02 cross-brand input contamination) is acknowledged and exercised by
the brand-register no-fallback + invoice-copy-isolation test scaffolds.

## Self-Check: PASSED

Verified:
- All 16 created files exist on disk:
  - `supabase/migrations/20260505a_entity_brand_expansion.sql` ✓
  - `supabase/migrations/20260505b_orq_agents_cross_cutting.sql` ✓
  - `web/lib/swarms/brand-register.ts` ✓
  - `web/scripts/gen-entity-types.ts` ✓
  - `web/scripts/verify-entity-brand-shape.mjs` ✓
  - 10 test files (see table above) ✓
- All 4 commits exist:
  - `2791857` ✓
  - `3f2b533` ✓
  - `3ff4827` ✓
  - `6246add` ✓
- No deletions in any commit
  (`git diff --diff-filter=D --name-only HEAD~4 HEAD` is empty)
- No untracked files outside the worktree-bookkeeping `.claude/worktrees`
  (which pre-existed at session start)
