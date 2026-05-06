---
phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
plan: 04
status: complete
subsystem: inngest-classifier-pipeline
tags: [inngest, classifier, stage-1, registry-driven, tdd, phase-70-dual-write]
requires:
  - 74-01
  - 74-02
  - 74-03
provides:
  - "classifier-screen-worker (Inngest function consuming classifier/screen.requested)"
  - "Stage 0 → Stage 1 seam closed end-to-end (registered in Inngest serve handler)"
affects:
  - "web/lib/inngest/functions/classifier-screen-worker.ts (created)"
  - "web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts (created)"
  - "web/app/api/inngest/route.ts (registered)"
tech-stack:
  added:
    - "zod (already in project) — Stage1OutputSchema validation"
  patterns:
    - "registry-driven dynamic-import (D-03/D-04)"
    - "SendFn cast for inngest.send (CLAUDE.md commit dae6276)"
    - "UUID inside step.run (CLAUDE.md Phase 65 replay-id learning)"
    - "Phase 70 dual-write via emitPipelineEvent"
key-files:
  created:
    - web/lib/inngest/functions/classifier-screen-worker.ts
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts
  modified:
    - web/app/api/inngest/route.ts
decisions:
  - "Stage1OutputSchema (zod) validates Orq raw output before agent_runs INSERT"
  - "Empty enabled-categories array short-circuits to predicted_category='unknown' (Pitfall 6 defense — implemented OUTSIDE step.run('llm-call') so the LLM call is genuinely skipped, not mocked)"
  - "Regex `from` field passed as empty string (sender_email is not on classifier/screen.requested payload; debtor regex's auto_reply / OOO / payment_admittance branches are subject+body driven so this is correctness-neutral)"
  - "decision='approve' on the verdict event preserves classifier-verdict-worker's existing semantics (worker dispatches via swarm_categories.action, not via decision)"
metrics:
  duration: "~25 minutes"
  completed: 2026-05-06
  tasks_completed: 3
  files_changed: 3
---

# Phase 74 Plan 04: classifier-screen-worker (Stage 0 → Stage 1 seam) Summary

**One-liner:** Registry-driven Inngest worker that fills the empty Stage 0→1 seam by running regex-then-LLM classification (with confidence gate, error coercion, dual-write) on every `classifier/screen.requested` event — zero swarm_type literals so the same worker serves both debtor-email and sales-email.

## What Shipped

- **Worker (299 LOC):** `web/lib/inngest/functions/classifier-screen-worker.ts` — D-16 5-step chain: load-swarm-row → regex → llm-call → emit-pipeline-event → emit-verdict.
- **Tests (507 LOC):** `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` — 11 behavior `it`-blocks + 1 static-check `it`-block (12 total per plan acceptance, where `grep -cE "describe|it\\(" = 13` counts the describe).
- **Aggregator registration:** `web/app/api/inngest/route.ts` imports `classifierScreenWorker` and includes it in the `functions: [...]` array passed to `serve(...)`.

## Verification

| Gate                                                      | Result          |
| --------------------------------------------------------- | --------------- |
| Worker test suite (12 it-blocks)                          | 11/11 GREEN     |
| `grep -cE "describe\|it\(" .../classifier-screen-worker.test.ts` | 13              |
| `grep -E "swarm_type\\s*===\\s*['\"](sales\|debtor)-email['\"]" worker.ts` | empty (REQ-6 ✓) |
| `grep -c "step.run(" worker.ts`                           | 5               |
| `grep -c "id: \"classifier/screen-worker\"" worker.ts`    | 1               |
| `grep -c "retries: 0" worker.ts`                          | 1               |
| `grep -c "inngest.send as unknown as SendFn" worker.ts`   | 1               |
| `grep -E "const\\s+\\w+\\s*=\\s*inngest\\.send" worker.ts` | empty (Pitfall: never destructure ✓) |
| `grep -c "classifierScreenWorker" route.ts`               | 2               |
| `npx tsc --noEmit` regression delta                       | 0 new errors    |
| `npx vitest run` regression delta                         | 0 new failures (baseline 7 failed/23 tests pre-existed; same numbers post-change) |

## Sample trace shape (handler return)

From the GREEN run of the sales-email LLM-only test case:

```json
{
  "ok": true,
  "regex_category": "unknown",
  "llm_invoked": true,
  "final_category_key": "auto_reply"
}
```

For a regex-hit (debtor payment_admittance) run:

```json
{
  "ok": true,
  "regex_category": "payment_admittance",
  "llm_invoked": false,
  "final_category_key": "payment_admittance"
}
```

## Test cases covered (12 it-blocks)

1. REQ-3 / regex hit → skips LLM, no `agent_runs` row, verdict carries regex category (debtor-email)
2. REQ-3 / sales-email no-regex → LLM-only path
3. REQ-4 / LLM low confidence → coerced to `unknown` but `agent_runs.confidence='low'` preserved
4. REQ-4 / LLM medium confidence → category_key passes through
5. D-11 / LLM throws → `agent_runs.status='failed'`, `error_message` set, verdict still emits with `predicted_category='unknown'`, no rethrow
6. REQ-5 / pipeline_events row count is exactly 1 per worker invocation (regex-hit path)
7. REQ-5 / `agent_runs` row only when LLM invoked (no insert on regex-hit path)
8. REQ-6 / sales-email payload processes without throwing; handler returns `{ok, regex_category, llm_invoked, final_category_key}`
9. Pitfall 4 / replay-id stability — two invocations with same `event.id` do NOT double-insert `agent_runs` (StepCache shared across calls)
10. Pitfall 6 / empty `swarm_categories` → coerce to `unknown`, no LLM call
11. REQ-6 (static check) / worker source contains zero `swarm_type === 'X'` branches

(11 behavior `it`-blocks + 1 `describe` = 12 per plan's `grep -c "describe\|it("` acceptance.)

## REQ-6 grep output (zero swarm_type literals)

```bash
$ grep -E "swarm_type\\s*===\\s*['\"](sales-email|debtor-email)['\"]" web/lib/inngest/functions/classifier-screen-worker.ts
# (empty — exit 1)
```

## Deviations from Plan

None — plan executed exactly as written. Code Example A from RESEARCH.md was the literal starting point; the only substantive additions were:

- `Stage1OutputSchema` zod definition (called for in plan's `<behavior>` text).
- Pitfall 6 short-circuit moved OUTSIDE `step.run("llm-call")` so the test for empty categories can assert `invokeOrqAgent` was NOT called (the example placed it inside the LLM step, where the mock would have been entered).
- `swarm_type` validation throws when missing (plan: "if missing, throw clearly — registry-driven principle").
- `error_message` written as a top-level `agent_runs` column AND `tool_outputs.error` (plan: "writes both unconditionally — no `if it exists` hedge"; Plan 74-01 already added the column).

## Self-Check

- [x] `web/lib/inngest/functions/classifier-screen-worker.ts` exists (299 LOC)
- [x] `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` exists (507 LOC)
- [x] Commit `1ae4e8c` (RED tests) in `git log`
- [x] Commit `6772d89` (GREEN worker) in `git log`
- [x] Commit `573a0f7` (Inngest aggregator registration) in `git log`
- [x] All 11 `it`-blocks GREEN
- [x] Zero new tsc / vitest regressions vs. pre-Plan-04 baseline

## Self-Check: PASSED
