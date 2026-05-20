---
phase: 089
plan: 02
subsystem: stage-1-classifier-worker
tags: [stage-1, classifier, llm, worker, inngest, rule-key, whitelist-gate]
requires: [089-01]
provides: [llm-path-rule-key-writes, effective-matched-rule-gate]
affects:
  - web/lib/inngest/functions/classifier-screen-worker.ts
  - web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts
  - web/lib/inngest/functions/__tests__/classifier-screen-worker.phase89.test.ts
tech-stack:
  added: []
  patterns: [replay-safe-rule_key-synthesis, regression-guarded-whitelist-gate]
key-files:
  created:
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.phase89.test.ts
  modified:
    - web/lib/inngest/functions/classifier-screen-worker.ts
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts
decisions:
  - "Edit Site 4 (automation_runs.rule_key) DEFERRED — DECISION-01=NO from 089-WAVE0-PROBE: the column does not exist on public.automation_runs. Threading deferred to a separate latent-defect followup."
  - "Bulk-review + auto-action audit rows' result.predicted.rule now reflect effectiveMatchedRule (regex matchedRule OR synthesized llm:{cat}:{conf}) so audit logs distinguish regex vs LLM dispatch signals."
metrics:
  duration: ~10 min
  completed: 2026-05-20
requirements: [SC-89-02, SC-89-04, SC-89-05]
---

# Phase 089 Plan 02: Stage 1 worker LLM rule_key + effectiveMatchedRule Summary

Stage 1 classifier-screen-worker now threads a synthetic `llm:{category_key}:{confidence}` rule_key onto every LLM-path `agent_runs` row (success + failure) and synthesizes `effectiveMatchedRule` so the existing whitelist gate auto-archives promoted `llm:*:high` verdicts without touching the L401 dispatch gate.

## What was built

- **Success-path agent_runs.insert** (worker L265-286): added `rule_key: \`llm:${parsed.category_key}:${parsed.confidence}\``. Deterministic from `parsed.*` inside the existing `step.run("llm-call")` so Phase 65 replay-id semantics are preserved.
- **Failure-path agent_runs.insert** (worker L306-325): added sentinel `rule_key: "llm:unknown:low"`. Failure rows carry `human_verdict=NULL` by default → excluded from `classifier_rule_telemetry` promotion aggregates by construction.
- **effectiveMatchedRule synthesis** (worker L501-512): when `llmInvoked && llmCategoryKey && llmConfidence`, synthesize `llm:{cat}:{conf}`; else preserve `regexOutcome.matchedRule ?? ""`. `whitelistSet.has(effectiveMatchedRule)` is now the gate. Pitfall 2 regression-safe (regex llmInvoked=false branch unchanged).
- **Audit rows** (worker L586, L747): `result.predicted.rule` now passes `effectiveMatchedRule || null` instead of raw `regexOutcome.matchedRule`, so bulk-review + auto-action audit logs distinguish regex vs LLM dispatch.
- **Tests**: new `classifier-screen-worker.phase89.test.ts` with 4 active + 1 skipped (DECISION-01=NO) test cases. `classifier-screen-worker.gate.test.ts` extended with one Pitfall 2 regression-guard case verifying regex-hit predicted.rule remains the literal regex key.

## What was NOT built (deviation from plan)

**Edit Site 4 (automation_runs.insert rule_key)** — skipped per 089-WAVE0-PROBE DECISION-01=NO. The `rule_key` column does not exist on `public.automation_runs` (verified via information_schema). Adding writes would crash the worker. Test 5 in phase89.test.ts is `it.skip(...)` with an explicit reference to the probe. Filed as separate latent-defect followup (Wave 0 probe §"Out-of-scope findings" item 1+2).

## Test results

```
Test Files  3 passed (3)
     Tests  30 passed | 1 skipped (31)
```

Scoped to: classifier-screen-worker.phase89.test.ts, classifier-screen-worker.test.ts, classifier-screen-worker.gate.test.ts.

## Commits

- `6edbe49` — `test(089-02): [RED] add Phase 89 phase89.test.ts for LLM rule_key + effectiveMatchedRule`
- `80dd786` — Task 2 worker edits + gate.test.ts regression guard. **Note:** the GREEN-step worker edits and gate.test.ts extension were swept into a Plan 05 docs commit by the parallel-wave orchestrator's auto-stash mechanism (the commit title reads `docs(089-05): …` but the diff includes my classifier-screen-worker.ts + gate.test.ts edits — verified via `git show --stat 80dd786`). Functionally correct; commit-grouping is a parallel-wave artifact, not a content issue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test 5 marked `.skip` instead of `.skip()`-with-fail**
- **Found during:** Task 1 RED authoring
- **Issue:** 089-WAVE0-PROBE DECISION-01=NO made automation_runs.rule_key threading impossible — but the plan still wanted Test 5 stubbed for documentation continuity.
- **Fix:** `it.skip(...)` with inline comment referencing the probe.

### Process anomaly (parallel-wave commit grouping)

The Task 2 GREEN edits committed correctly to the working tree but got absorbed into the Plan 05 summary commit (`80dd786`) by the orchestrator's auto-stash mechanism running in parallel. Content is correct, attribution is wrong. Future parallel-execution runs should serialize commit windows or use worktree isolation.

## Self-Check

- File `.../classifier-screen-worker.phase89.test.ts` exists: FOUND
- File `.../classifier-screen-worker.ts` contains `effectiveMatchedRule`: FOUND (6 occurrences)
- File `.../classifier-screen-worker.ts` contains `llm:${parsed.category_key}:${parsed.confidence}`: FOUND
- File `.../classifier-screen-worker.ts` contains `llm:unknown:low`: FOUND
- L401 `DEBTOR_REGEX_MODULE_KEY` dispatch gate: 2 references preserved (SC-89-05 negative invariant holds)
- Commits 6edbe49 + 80dd786 exist in `git log --all`: FOUND
- vitest run on the three target files: 30 passed | 1 skipped

## Self-Check: PASSED
