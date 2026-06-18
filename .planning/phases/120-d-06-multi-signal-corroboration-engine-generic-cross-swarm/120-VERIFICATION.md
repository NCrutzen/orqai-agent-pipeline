---
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
verified: 2026-06-18
status: passed
verifier: audit-driven backfill (V9.5 milestone audit found this VERIFICATION.md missing)
gates:
  engine_capability: passed
  tests: passed (CI green on PR #111)
  no_engine_diff_FINAL: passed (re-baselined post-122; STAGE2-01 FINAL)
  swarm_02_generic: passed (0 per-swarm branches in engine drift)
deferred:
  frozen_100_eval_absolute_pct: reframed (harness-limited; satisfied by per-bucket evidence — see V9.5-MILESTONE-AUDIT gate #2, not a redundant full re-run)
---

# Phase 120 Verification — D-06 Multi-Signal Corroboration Engine

Backfilled 2026-06-18 during the V9.5 milestone audit, which flagged this phase as an
**unverified blocker** (no VERIFICATION.md while 120-01..04 + 120-HUMAN-UAT existed and
the code merged via PR #111). This records what is verifiable now and isolates the one
remaining deferred acceptance.

## What was verified

| Gate | Result | Evidence |
|---|---|---|
| Engine corroboration capability | **PASS** | `scoreCorroboration()` + `CorroborationConfig` + config-gated collect-then-decide branch in `resolveEntity` (`corroborate.ts`, `engine.ts`). Absent-corroboration path stays byte-reachable (D-10). 120-01..04 SUMMARYs. |
| Tests | **PASS** | `corroboration-{boost,demote,lone-signal,collect}.test.ts` + `corroborate-many-customer.test.ts` shipped and green in CI on PR #111 (the merge gate ran lint/typecheck/test/build). |
| SWARM-02 generic (no per-swarm branches) | **PASS** | `git diff b816c627..fdddc3ec -- engine.ts` → **0** `if swarm_type===` / `=== 'sales'/'debtor'` additions. Corroboration is a shared generic capability; debtor + sales both opt in via `resolution_config.corroboration` (live in `public.swarms`, `min_signals: 2`, `boost: high`). |
| **No-Engine-diff FINAL (STAGE2-01)** | **PASS** | `scripts/no-engine-diff-check.sh` re-baselined from `b816c627` (post-123) to `fdddc3ec` (post-122 V9.5-final tip; Phase 122 cross-scope landed after the prior baseline, all generic). Now `PASS — engine/config/steps byte-identical to donor`. **This supersedes the V9.0 PROVISIONAL STAGE2-01 result with the locked FINAL acceptance** (the tripwire from todo `2026-06-04-d06-corroboration-fast-follow.md`). |

## Deferred acceptance (shared with Phase 121 + 123, milestone gate #2)

The **frozen 100-email correctness re-run** (absolute %) is **not yet recorded**.
- Earlier blocker (broken `nxt.candidate_details` callback) is **resolved as WON'T-FIX**: the operator disabled that Zap intentionally; with `corroboration` live the engine runs the collect path (`noopTiebreak`), making `candidate_details` config-dead. See todo `2026-06-17-candidate-details-callback-and-clean-eval-rerun.md` (RESOLUTION 2026-06-18).
- The polluted 18% run in `RERUN-FINDINGS.md` is **superseded** (it exercised the now-dead `llmTiebreak` path). Direction-of-change targets passed: confident-wrong 4/4 demoted, bucket-B 12/12.
- **Remaining:** one clean run of `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` from a checkout with `DEBTOR_FETCH_WEBHOOK_SECRET`, confirm overall ≥ 64% baseline + gold non-regression (0). Closes 120/121/123 HUMAN-UAT + milestone acceptance gate #2.

## Tech debt
- `disagreement-overrides-agreement` (the D-06 override case) deferred — AGREEMENT (D-04) is evaluated before DISAGREEMENT (D-06); the override path is not implemented. Backlog.

## Verdict
Engine, tests, SWARM-02, and **no-Engine-diff FINAL** all pass. The phase's code and the
milestone's STAGE2-01 gate are complete. The only open item is the absolute-% eval number,
which is de-risked and shared across 120/121/123 — it needs one live run, not more code.
