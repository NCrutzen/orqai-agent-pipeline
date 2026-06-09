---
captured: 2026-06-04
source: Phase 114-04 Task 3 checkpoint — D-06 corroboration deferral
status: pending
priority: H
target_milestone: v9.0
tags: [stage-2, resolution, corroboration, d-06, stage2-01, engine, cto-requirement]
---

# D-06 multi-match corroboration — fast-follow before the no-Engine-diff gate is final

## The CTO requirement (D-06)

The CTO explicitly wants **multi-match corroboration** at Stage 2: multiple
independent signals (e.g. sender domain + offertenummer + Site postcode)
corroborate to RAISE confidence ("multi matchen om de zekerheid te verhogen").
This is a requirement, not an optimization afterthought (Phase 114 CONTEXT D-06).

## What iteration 1 (Phase 114-04) actually shipped

Phase 114-04 shipped the sales Stage 2 resolver **precedence-only + single-hit
short-circuit** (RESEARCH OQ-1 recommendation): the first precedence step that
yields a `customer_account_id` returns immediately. There is NO corroboration —
the generic engine (`web/lib/agentic-pipeline/resolve/engine.ts`) is
precedence-ordered + single-hit by construction, and `resolution_config` cannot
express corroboration today. A `corroborate` config field would be **silently
ignored** by the engine (Pitfall 3), so it was deliberately NOT added.

The sales `resolution_config` seeded by `20260604b_sales_resolution_config.sql`
sets `llm_tiebreaker: false` and a flat `precedence` array — single-hit only.

## The HARD constraint this todo exists to enforce

Multi-match corroboration is **ENGINE work** (the engine must gain a generic
corroboration capability — it cannot be expressed in config alone). Per D-06,
**any corroboration engine change MUST land BEFORE the no-Engine-diff
measurement is treated as the FINAL STAGE2-01 acceptance gate.**

Why: Plan 05 measures STAGE2-01 ("zero Engine code changes for the sales
onboarding") via a no-Engine-diff check. If we declare STAGE2-01 satisfied
against the current engine, we are measuring against an engine that **still owes
corroboration work**. When corroboration later lands, it WILL touch
`engine.ts` — at which point the "no Engine diff" claim is retroactively false
unless the corroboration capability was already in the engine baseline the
measurement was taken against.

So: the no-Engine-diff gate is only legitimately FINAL once either
(a) corroboration has landed in the engine, OR (b) corroboration is formally
descoped from STAGE2-01's definition by the operator. Until one of those, the
Plan 05 no-Engine-diff result is **provisional**.

## What to build (the fast-follow)

1. Add a **generic corroboration capability** to the resolution engine — config-
   expressible (e.g. `resolution_config.corroboration: { min_signals, boost }`),
   swarm-agnostic, no per-swarm branch. The engine collects candidate signals
   across precedence steps instead of short-circuiting on the first, and raises
   confidence when ≥N independent signals agree on the same `customer_account_id`.
2. Re-seed the sales `resolution_config` to opt into corroboration once the
   engine supports it.
3. Re-run the no-Engine-diff measurement AFTER this lands — that result is the
   one that legitimately gates STAGE2-01 as final.

## Cross-references

- Phase 114 CONTEXT D-06 (the CTO requirement + the engine-gap question)
- Phase 114-04 PLAN Task 3 checkpoint (this deferral decision)
- Phase 114-05 PLAN Task 3 (asserts THIS FILE exists when the defer path is taken)
- `web/lib/agentic-pipeline/resolve/engine.ts` (the precedence + single-hit
  short-circuit that must gain corroboration)
- `supabase/migrations/20260604b_sales_resolution_config.sql` (the single-hit
  sales config to revisit)
