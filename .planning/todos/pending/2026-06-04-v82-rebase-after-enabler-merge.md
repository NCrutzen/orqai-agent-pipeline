---
captured: 2026-06-04
source: Phase 114-05 Task 3 — D-02 cross-track coordination note
status: pending
priority: H
target_milestone: v9.0
tags: [stage-2, resolution, v8.2, rebase, cross-track, d-02, enabler-pr, resl-03]
---

# v8.2 workspace MUST rebase after the Phase 114 enabler-PR merges to main

## Why (D-02)

Phase 114 (Stage 2 resolver reuse — cross-swarm generality proof) is shipping as
an **enabler-PR to main** (D-01): it cherry-picks the v8.2 RESL-03 resolver-seam
subset from `origin/workspace/v8.2-resolution-recall` and lands it on main so the
sales swarm can reuse it. That same seam still lives — un-rebased — on the v8.2
workspace branch.

After this Phase 114 enabler-PR merges to main, the v8.2 workspace branch
`origin/workspace/v8.2-resolution-recall` (**39 ahead / 233 behind main** as of
2026-06-04) **MUST rebase onto main**. On rebase, the cherry-picked subset
becomes a **no-op** — it is now upstream, so the v8.2 commits that introduced it
collapse to empty (or fast-forward) during the rebase.

## What becomes a no-op on rebase (the cherry-picked subset)

These are the files Phase 114-01 transplanted verbatim from the donor branch and
that the enabler-PR puts on main. On the v8.2 rebase they are already-present
upstream → no-op:

- `web/lib/swarms/dynamic.ts` (loadStage2Resolver seam, static dispatch map, 60s
  TTL cache, kill-switch via the `swarms.stage2_entity_resolver` registry column)
- `web/lib/agentic-pipeline/resolve/engine.ts` + `config.ts` (the generic engine)
- `web/lib/agentic-pipeline/resolve/body-source.ts` + `resolve/steps/*`
- the `web/lib/automations/debtor-email/resolve-debtor.ts` config+adapter refactor
  (behaviour-neutral; re-exports the locked public contract)

## What is NOT affected (stays in the debtor track)

The **HELD v8.2 SQL-substrate cutover stays in the debtor track and is NOT part
of the enabler-PR** — it does NOT become a no-op on rebase:

- `zapier.dbo` stored procedures (resolution recall substrate)
- the `20260601c` / `20260601f` cutover migration
- any debtor Stage 2 worker rewire that depends on the SQL substrate

These remain genuine v8.2 work after the rebase; only the resolver-seam subset
collapses.

## Coordination

**Operator self-coordinates** — author of both the sales (V9.0) and debtor (v8.2)
tracks. No cross-developer handoff. Action: after the Phase 114 enabler-PR lands
on main, `git fetch && git rebase origin/main` on the v8.2 workspace branch,
confirm the resolver-seam commits collapse to no-ops, and verify the held
SQL-substrate cutover commits survive the rebase intact.

## Cross-references

- Phase 114 CONTEXT D-01 (enabler-PR strategy) + D-02 (this coordination note)
- Phase 114-01 SUMMARY (the verbatim seam transplant)
- Phase 114-05 PLAN Task 3 (mandates this note)
- `origin/workspace/v8.2-resolution-recall` (the branch to rebase)
