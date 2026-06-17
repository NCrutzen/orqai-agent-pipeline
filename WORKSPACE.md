# Workspace: phase-120-corroboration

Created: 2026-06-16
Strategy: worktree

## Member Repos

| Repo | Source | Branch | Strategy |
|------|--------|--------|----------|
| agent-workforce | /Volumes/Developer/agent-workforce | workspace/phase-120-corroboration | worktree |

## Base

Branched off `planning/v9.5-stage2-correctness` (PR #102), NOT plain `main`, so the
worktree carries the V9.5 milestone definition (`.planning/ROADMAP.md` phases
120/121/122 + the operator eval) that phase planning reads. When #102 merges to
main, this branch's planning commit becomes shared ancestry — no conflict.

## Scope

**Phase 120 — D-06 multi-signal corroboration engine (generic, cross-swarm).**
Give the resolution engine a config-expressible corroboration capability: collect
candidates across precedence steps instead of short-circuiting; ≥N independent
identifiers agreeing on the same `customer_account_id` → deterministic confidence,
no LLM call. Sender/domain-match must not auto-resolve at >1 candidate. Zero
per-swarm branch (SWARM-02). Re-run the no-Engine-diff measurement post-landing →
finalizes the PROVISIONAL V9.0 STAGE2-01 gate.

Acceptance baseline: the frozen 100-email operator eval
(`.planning/evals/2026-06-16-resolver-customer-eval/`), 64% → measurably reduce the
36 errors (esp. the 4 confident-wrong AUTO + bucket-B sender-ambiguity).

## Notes

- `.planning/` is tracked in git here, so this worktree's branch IS the isolated
  planning state — no workstream symlink needed (collaboration.md model).
- `web/.env.local` seeded from source. Dependencies NOT installed yet — run
  `cd web && pnpm install` when execution/tests are needed (not needed for planning).
- Sibling V9.5/V9.7 worktrees exist; all edit `.planning/ROADMAP.md` → reconcile on merge.
