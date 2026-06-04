---
phase: 111-stage-1-noise-expansion-calibration
plan: 01
subsystem: stage-1-noise-filter
tags: [dry-run-gate, wilson-promotion, swarm-agnostic, classifier]
requires:
  - "web/lib/pipeline-gating/dry-run-gate/index.ts (isStageBlocked)"
  - "web/lib/classifier/cache.ts (readWhitelist, swarm-scoped)"
  - "web/lib/swarms/registry.ts (loadSwarm)"
provides:
  - "verdict-worker inline Outlook archive gated behind isStageBlocked(swarmRow,'stage_1_archive')"
  - "swarm-agnostic Wilson promotion gate in classifier-screen-worker Step 5"
affects:
  - "Phase 02 calibration flip (now safe — flip is inert + gated)"
  - "Phase 112 go-live (un-blocks dry_run_config.stage_1_archive to fire)"
tech-stack:
  added: []
  patterns:
    - "per-stage dry-run gate (Phase 110-04) extended to the inline verdict-worker path"
    - "Wilson-CI promotion gate generalized from debtor-only Step 4.5 to swarm-agnostic Step 5"
key-files:
  created: []
  modified:
    - "web/lib/inngest/functions/classifier-verdict-worker.ts"
    - "web/lib/inngest/functions/classifier-screen-worker.ts"
    - "web/lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts"
    - "web/lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts"
    - "web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts"
decisions:
  - "Gate the verdict-worker inline Outlook calls (Option a from RESEARCH Finding 1) rather than nulling outlook_label — swarm-agnostic and dovetails with the dry-run gate."
  - "Generalize the promotion gate into Step 5 (RESEARCH Open Q1 recommendation) — keeps the verdict-worker a pure dispatcher; the debtor block (settings present) returns before Step 5 so debtor behavior is unchanged."
metrics:
  duration: "~25m"
  completed: "2026-06-03"
  tasks: 3
  files: 5
requirements: [STAGE1-01]
---

# Phase 111 Plan 01: Stage-1 Gate Hardening Summary

Closed the two CRITICAL architecture gaps (RESEARCH Findings 1 & 2) so the Phase 111 sales noise-category flip is both inert (no live Outlook archive) and gated (auto-archive only behind a promoted Wilson rule) — swarm-agnostically, with zero per-swarm branches, and debtor Stage 1 provably unchanged.

## What Was Built

**Finding 1 — verdict-worker inline Outlook archive dry-run gate** (`classifier-verdict-worker.ts`)
- Imported `isStageBlocked` (`@/lib/pipeline-gating/dry-run-gate`) and `loadSwarm`.
- Added a `load-swarm-row` step.run to obtain the full swarm row (with `dry_run_config`) alongside the existing `swarm_noise_categories` load.
- Changed the `case "categorize_archive"` guard from `if (category.outlook_label)` to `if (category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive"))`. TRUE/MISSING = blocked (dry-run, skip), FALSE = LIVE (fire). Sales is all-blocked → stays inert until Phase 112.
- The `evaluateSideEffects("stage1_categorize_archive")` dispatch is left untouched (sales `side_effects=[]` already suppresses it).

**Finding 2 — swarm-agnostic Wilson promotion gate in Step 5** (`classifier-screen-worker.ts`)
- Before computing `gateClearsForAutoArchive`, when `llmInvoked && llmConfidence === "high" && finalCategoryKey !== "unknown"`, the worker now reads `readWhitelist(admin, swarm_type)` (wrapped in `step.run("read-whitelist-step5")` for replay-safety) and checks `llm:{finalCategoryKey}:high` membership.
- `gateClearsForAutoArchive` now requires that promoted match for high-confidence LLM verdicts; non-promoted → `classifier/screen.requires_review` (no subscriber → row stays `predicted`).
- `finalCategoryKey === "unknown"` keeps its short-circuit to `verdict.recorded` (Anti-Pattern A2: unknown is never a promotable noise rule).
- The debtor Step 4.5 block (settings present) returns before Step 5, so debtor's existing upstream gate is unchanged; the Step 5 gate is a no-op superset for the debtor fall-through path.

## Tasks & Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED — failing tests for both gates + debtor regression net | `cc0f1ce8` | dry-run-gate-preservation.test.ts, classifier-screen-worker.gate.test.ts |
| 2 | GREEN — gate verdict-worker inline Outlook archive (Finding 1) | `80fa6e8f` | classifier-verdict-worker.ts, classifier-verdict-worker.test.ts |
| 3 | GREEN — generalize Wilson promotion gate into Step 5 (Finding 2) | `5bb257dd` | classifier-screen-worker.ts, classifier-screen-worker.gate.test.ts, dry-run-gate-preservation.test.ts |

## Verification

- `npx vitest run` on the four named suites: **25 passed | 1 skipped**.
  - Test A (verdict-worker dry-run gate): blocked → not called, live → called, missing → not called (fail-closed).
  - Test B (sales Step 5 promotion gate): non-promoted high-conf → requires_review, promoted → verdict.recorded, unknown → verdict.recorded.
  - Test C (phase89 debtor regression): green, unchanged.
- `npx tsc --noEmit`: clean.
- Swarm-literal grep `grep -c "swarm_type === 'sales-email'\|swarm === 'sales'"` on both workers: **0** in the gate paths (SWARM-02 / Anti-Pattern A3 satisfied).
- `grep -n "readWhitelist(admin, swarm_type)"` in screen-worker: hit at Step 5 (line 939), not only the debtor block.
- `grep -n "isStageBlocked"` in verdict-worker: import + guard wrapping the inline calls.

## Threat Mitigations Applied

| Threat ID | Disposition | Applied |
| --------- | ----------- | ------- |
| T-111-01 (verdict-worker live Outlook on noise verdict) | mitigate | Task 2 — `isStageBlocked(swarmRow,'stage_1_archive')` guard; sales all-blocked → inert |
| T-111-02 (auto-archive clearance without promotion) | mitigate | Task 3 — Step 5 requires promoted `llm:{cat}:high` before clearing |
| T-111-03 (debtor regression) | mitigate | phase89 regression net green; debtor block returns before Step 5 |
| T-111-04 (unknown auto-archive) | accept/mitigate | unknown short-circuit preserved (Anti-Pattern A2) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verdict-worker registry mock missing `loadSwarm`**
- **Found during:** Task 2
- **Issue:** `classifier-verdict-worker.test.ts` mocked `@/lib/swarms/registry` with only `loadSwarmNoiseCategories`; the worker now also calls `loadSwarm`, throwing "No 'loadSwarm' export is defined on the mock".
- **Fix:** Added `loadSwarm` to that test's registry mock returning a LIVE `stage_1_archive` (preserves the pre-111 inline-call behavior the existing side-effect-dispatch assertions assume).
- **Commit:** `80fa6e8f`

**2. [Rule 1 - Test correctness] Pre-existing confidence-gate test broke under the new promotion gate**
- **Found during:** Task 3
- **Issue:** The Phase 999.8 test "LLM high confidence → emits verdict.recorded" exercises the debtor *fall-through* path (settings=null) and predates the promotion gate. Under Finding 2 a high-confidence verdict now also needs a promoted rule, so it routed to requires_review.
- **Fix:** Seeded `gateWhitelistSet` with `llm:payment_admittance:high` in that test so it isolates the confidence gate (its original intent) rather than the new promotion gate. This is a test-fixture correction, not a behavior change to the debtor block (settings-present path returns before Step 5).
- **Commit:** `5bb257dd`

**3. [Rule 3 - Blocking] tsc spread-arg error in Test A Outlook mock**
- **Found during:** Task 3 (tsc verification)
- **Issue:** `categorizeEmailMock`/`archiveEmailMock` declared `async () => ...` but were spread `...args` into; TS2556.
- **Fix:** Gave the mocks `(..._args: unknown[])` rest params.
- **Commit:** `5bb257dd`

## Known Stubs

None — both fixes wire real data paths (`loadSwarm` → `dry_run_config`; `readWhitelist` → promoted set). No placeholder/empty-value stubs introduced.

## Notes for Downstream

- The `readWhitelist` interface returns `Set<string>` (not `string[]` as the plan's interfaces block stated); the implementation reconstructs `new Set(Array.from(...))` to match the debtor block's step-memo discipline.
- Sales promotion is operator-driven (RESEARCH Pitfall 6): the gate is now in place but no sales `llm:*:high` rule promotes until operator feedback accrues telemetry — exactly D-05's organic-accumulation intent. The Phase 02 flip remains inert (dry_run all-blocked) and gated (promotion required) as a result.

## Self-Check: PASSED

All modified files present on disk; all three task commits (`cc0f1ce8`, `80fa6e8f`, `5bb257dd`) exist in git history.
