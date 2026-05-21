---
phase: 68
plan: 02
status: complete
date: 2026-05-04
---

# Plan 68-02 — Registry helper modules

## What was built

- **`web/lib/swarms/types.ts`** — `SwarmRow` extended with 5 new nullable fields (`stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `canonical_context_shape`, `entity_brand`). New `SwarmIntentRow` and `CanonicalContextShape` types. `side_effects` retyped from `Record<string, unknown> | null` → `unknown[] | null` to match the new array shape (concrete union lives in `side-effects.ts` to keep types module taxonomy-free).
- **`web/lib/swarms/registry.ts`** — added `INTENTS_CACHE` (60s TTL), `loadSwarmIntents`, `loadHandlerEvent`, `loadCanonicalContextShape`. `__resetCacheForTests` clears the new cache.
- **`web/lib/swarms/side-effects.ts`** *(new)* — `SideEffectDescriptor` discriminated union (`inngest_event` | `automation_run_insert`), `SideEffectTrigger` taxonomy, `evaluateSideEffects(admin, swarmType, trigger, ctx)` filters by trigger then equality-matches gate against ctx.
- **`web/lib/swarms/dynamic.ts`** *(new)* — `MODULE_CACHE`, `loadStage1Classifier`, `loadStage2Resolver`. Throws structured errors when path missing or expected symbol absent. `__resetModuleCacheForTests` for tests.
- **`web/lib/automations/debtor-email/resolve-debtor.ts`** — appended `export { resolveDebtor as resolveEntity }` (re-export preserves identity for `MODULE_CACHE`).
- **Test fixture updates** — `tests/queue/page.test.tsx` and `lib/swarms/__tests__/registry.test.ts` `sampleSwarm` extended with the 5 new nullable fields.

## Tests

`npx vitest run lib/swarms/__tests__/registry.test.ts lib/swarms/__tests__/side-effects.test.ts lib/swarms/__tests__/dynamic.test.ts`
→ **3 files, 25 tests, all green.**

Coverage:
- registry: TTL hit/miss, last-known-good on error, `__resetCacheForTests`, intents loader, handler-event lookup (known + unknown), canonical-shape lookup (present + absent).
- side-effects: trigger+gate match, gate mismatch, wrong trigger, kind discriminator (both branches), null swarm, empty side_effects[].
- dynamic: missing path → throw, real module load + cache identity for stage1, stage2 resolveEntity alias resolves.

## Requirements satisfied

- **SWRM-01** — registry surface exposes the new columns/types.
- **SWRM-02** — `loadSwarmIntents` + `loadHandlerEvent` operational.
- **SWRM-04** — `SideEffectDescriptor.kind` discriminator + dispatcher contract in place.

## Wave 3 contract

Wave 3 plans (68-03..06) can `import { loadHandlerEvent, evaluateSideEffects, loadStage1Classifier, loadStage2Resolver }` from `@/lib/swarms/{registry,side-effects,dynamic}` — all symbols exported, typed, unit-tested.
