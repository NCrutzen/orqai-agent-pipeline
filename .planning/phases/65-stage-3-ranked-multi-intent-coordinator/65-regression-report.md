# Phase 65 Regression Backfill Report

**Generated:** 2026-05-04 (placeholder; awaiting operator-triggered live run)
**Sample window:** N/A
**Limit (CLI):** N/A
**Candidate rows queried:** 0
**Successfully processed:** 0
**Skipped (missing body or LLM error):** 0

## Top-1 Agreement (v1 single-label vs v2 ranked[0].intent)

- **Total:** 0
- **Agreement:** 0 (—)
- **Disagreement:** 0

## Escalation Distribution (CORD-04 success criterion: ~80% single_shot)

- **single_shot:** 0 (—)
- **orchestrator:** 0 (—)

### Escalation reason breakdown

(awaiting live run)

## Disagreement detail (top 20)

(awaiting live run)

## Acceptance Gate

- [ ] ≥70% top-1 agreement (sanity check)
- [ ] ≥70% single_shot rate (loose lower bound for CORD-04 ~80% target)

**N=0 — no production sample executed yet. Gate is N/A; the manual-emit
verification (Plan 65-05 Task 3) is the substitute evidence per the plan's
explicit acceptance-criteria allowance.**

## Sample notes

- Script: `scripts/phase-65-regression-backfill.ts` (committed; ready to run).
- Reason for N=0 placeholder: running the script triggers ~200 real Orq LLM
  calls against production credentials (cost-bearing, shared-system action).
  Per `auto_mode` rules, that requires explicit operator confirmation —
  surfaced in the Plan 65-05 Task 3 checkpoint alongside the four synthetic
  Inngest dev-server events.
- To run the script (operator instructions):
  ```bash
  cd /Users/nickcrutzen/Developer/agent-workforce
  tsx scripts/phase-65-regression-backfill.ts --limit 200 --days 14
  ```
  The script reads `web/.env.local` for `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `ORQ_API_KEY`. It is read-only against
  Supabase (no writes to `coordinator_runs`, no Inngest events emitted).
- After the live run lands, this file will be overwritten with the real
  numbers and the Acceptance Gate boxes will be auto-checked.
- Source query: `public.agent_runs` filtered on `swarm_type='debtor-email'`
  AND `intent IS NOT NULL` AND `created_at >= now() - DAYS`.
- v1 intent compared = `agent_runs.intent` column (back-compat top-1,
  persisted by both v1 and v2 coordinator).
- LLM throttle: ~5 req/s.
