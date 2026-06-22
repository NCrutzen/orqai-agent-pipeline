---
phase: 122-cross-brand-scope-customer-resolution
plan: 04
type: execute
status: complete
---

# Plan 122-04 Summary — Debtor Cross-Scope Production Activation

## Outcome
Tasks 1-2 complete. Task 3 (live apply) executed; the eval-gate portion surfaced a confident-wrong defect that was root-caused and fixed in gap-closure Plan **122-05** (XSCOPE-03 now PASS). This SUMMARY was written by the orchestrator after the Task-3 executor hit an API connection error mid-run (the live apply had already succeeded; verified independently via the live row).

## Tasks
- **Task 1** (`243646b0`): cross_scope opt-in migration (`20260618a_debtor_cross_scope_optin.sql`, jsonb || concat, ADD-only, UPDATE-only on `public.swarms` WHERE swarm_type='debtor-email') + `debtorP0Config.cross_scope` lockstep + RED-first lockstep test (`debtor-cross-scope-config.test.ts`). check:supabase 0 ERROR; resolve suite green.
- **Task 2 [BLOCKING]**: operator approved the production migration apply.
- **Task 3**: migration applied **live** to `mvqjhlxfvtqqubqgdvhz` (verified: `resolution_config -> cross_scope -> enabled = true`, `updated_at` 2026-06-18 11:36; **no drift** — `precedence` + `auto_safe_kinds` unchanged, Pitfall 5 satisfied). The eval re-run is owned by Plan 122-05 (the original run exposed the leaf-vs-root bug).

## Live row (drift check)
`cross_scope = {enabled:true, auto_resolve_kinds:[invoice_no,customer_no,site_no], allow_corroboration_auto:true}`; `precedence=[thread_inheritance,sender_match,identifier_match]`, `auto_safe_kinds=[]` — both unchanged from pre-apply.

## Operator decision (deferred from this plan, resolved in 122-05 Task 4)
**Keep-live + fast deploy.** The cross_scope opt-in stays enabled on the live row; the leaf-vs-root fix (122-05) ships via merge+deploy of this branch. No kill-switch applied.

## Commits
- `243646b0` feat(122-04): cross_scope opt-in migration + debtorP0Config lockstep
