---
phase: 60
plan: "03"
subsystem: classifier
tags: [wave-2, cron, promotion, shadow-mode, wilson-ci]
requires:
  - public.classifier_rule_telemetry (60-00 migration, applied 60-01)
  - public.classifier_rule_evaluations (60-00 migration, applied 60-01)
  - public.classifier_rules (seeded 60-02 backfill)
  - web/lib/classifier/wilson.ts (60-00)
  - classifier-promotion-cron stub (60-02)
provides:
  - classifierPromotionCron daily Inngest cron (real implementation)
  - evaluateRule(admin, telemetry, rule, mutate) exported helper -- per-rule pure-ish decision logic
  - Shadow-mode default behaviour (D-19): writes evaluation rows, never flips classifier_rules.status until CLASSIFIER_CRON_MUTATE='true'
affects:
  - web/lib/inngest/functions/classifier-promotion-cron.ts (stub -> full impl)
  - web/lib/classifier/__tests__/cron-shadow.test.ts (it.todo -> 9 real tests)
  - web/lib/classifier/__tests__/promotion-gates.test.ts (added boundary + hysteresis cases)
tech_stack:
  added: []
  patterns:
    - Per-rule step.run("eval-${swarm}-${rule}") for replay-safe Inngest isolation
    - Exported pure-ish helper extracted from cron body for unit-testability without Inngest harness
    - Fluent admin-client stub (.from().upsert / .from().update().eq().eq()) for mocking Supabase JS in vitest
    - ON CONFLICT(swarm_type, rule_key, evaluated_at) upsert for same-day idempotency (T-60-03-03)
key_files:
  created: []
  modified:
    - web/lib/inngest/functions/classifier-promotion-cron.ts
    - web/lib/classifier/__tests__/cron-shadow.test.ts
    - web/lib/classifier/__tests__/promotion-gates.test.ts
decisions:
  - D-02 satisfied: shouldPromote(n>=30, ci_lo>=0.95) reused from wilson.ts, no duplication
  - D-03 satisfied: shouldDemote(ci_lo<0.92) -- 5pp hysteresis gap; demotion path additionally console.warn-alerts with rule_key + n + ci_lo
  - D-09 satisfied: cron string TZ=Europe/Amsterdam 0 6 * * 1-5 (weekdays 06:00 Amsterdam); single-line `//` comment only, never JSDoc per CLAUDE.md learning eb434cfd
  - D-19 satisfied: CLASSIFIER_CRON_MUTATE !== 'true' (default) writes shadow_would_* evaluation rows but NEVER mutates classifier_rules; ready for 60-07 flag-flip
  - D-23 satisfied: cron treats kind='regex' and kind='agent_intent' identically -- both flow through the same telemetry view by rule_key
  - D-29 satisfied: classifier-promotion-cron is one of the two new Inngest functions Phase 60 ships (stub from 60-02 now real)
  - Helper extraction: evaluateRule() exported separately so vitest can drive per-rule logic without an Inngest test harness. Cron body becomes a thin orchestrator (load telemetry, load rules, loop with step.run).
  - manual_block early-return placed BEFORE the gate check so a manual_block rule still gets an evaluation row written (audit trail) but classifier_rules is never touched even in live mode (T-60-03-05).
metrics:
  duration_minutes: ~15
  completed_date: 2026-04-28
  tasks_completed: 1
  files_changed: 3
---

# Phase 60 Plan 03: classifier-promotion-cron Summary

Daily promotion cron with Wilson CI-lo evaluator, shadow-mode default, and per-rule step.run isolation. Replaces the 60-02 stub. CLASSIFIER_CRON_MUTATE controls live vs shadow; hysteresis gates come straight from `wilson.ts`. Tests cover all five action paths plus manual_block exception and same-day idempotency.

## Tasks Completed

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | classifier-promotion-cron full impl + cron-shadow + promotion-gates tests | `692af05` |

## Acceptance Evidence

| Criterion | Result |
|-----------|-------:|
| `grep -c 'id: "classifier/promotion-cron"'` | **1** (== 1) ✓ |
| `grep -c 'TZ=Europe/Amsterdam 0 6 \* \* 1-5'` | **2** (>= 1; both single-line `//`) ✓ |
| `grep -c 'CLASSIFIER_CRON_MUTATE'` | **2** (>= 2) ✓ |
| `grep -cE 'shadow_would_promote\|shadow_would_demote'` | **3** (>= 2) ✓ |
| `grep -cE 'wilsonCiLower\|shouldPromote\|shouldDemote'` | **6** (>= 3) ✓ |
| `grep -c 'classifier_rule_telemetry'` | **2** (>= 1) ✓ |
| `grep -c 'classifier_rule_evaluations'` | **4** (>= 1) ✓ |
| `grep -c 'onConflict: "swarm_type,rule_key,evaluated_at"'` | **2** (>= 1) ✓ |
| `grep -c 'manual_block'` | **3** (>= 1) ✓ |
| `grep -c 'console.warn'` | **3** (>= 1) ✓ |
| `grep -cE '/\*.*\*/.*1-5'` (Pitfall 6, JSDoc cron leak) | **0** (== 0) ✓ |
| cron-shadow.test.ts has real `expect(...)` (no `it.todo`) | ✓ (9 tests) |
| `pnpm vitest run lib/classifier` | **33 passed / 4 files** ✓ |
| `pnpm tsc --noEmit -p .` | **exit 0** ✓ |

## Behavioural Coverage

`cron-shadow.test.ts` (9 tests, all green):

1. Shadow mode: candidate + ci_lo>=0.95 -> evaluation row written, classifier_rules.update NEVER called.
2. Shadow mode: candidate + crossing gate -> action='shadow_would_promote'.
3. Shadow mode: promoted + ci_lo<0.92 -> action='shadow_would_demote'.
4. Shadow mode: candidate + N below floor -> action='no_change'.
5. Live mode: promote path -> action='promoted' AND classifier_rules.update({status:'promoted'}).
6. Live mode: demote path -> action='demoted' AND classifier_rules.update({status:'demoted'}) AND console.warn(rule_key, n, ci_lo).
7. Live mode: no-change path -> counter refresh only (no `status` in update payload).
8. manual_block: never promoted or demoted regardless of telemetry -- always 'no_change'.
9. Same-day re-trigger: both upserts use the (swarm,rule,evaluated_at) onConflict target.

`promotion-gates.test.ts` adds:
- `shouldPromote(30, 0.949)` === false (boundary just below)
- `shouldPromote(1000, 0.94)` === false (high N can't compensate)
- `shouldDemote(0.999)` === false
- 5pp hysteresis sequencing assertion: promote@0.95 -> hold@0.93 -> demote@0.91.

## Wilson math sanity (used to pick test fixtures)

| n | k | ci_lo | gate decision |
|---|---|-------|---------------|
| 169 | 169 | 0.97777 | promote (above 0.95) |
| 151 | 151 | 0.97519 | promote |
| 50  | 49  | 0.8951 | NOT promote (below 0.95) -- replaced in test fixtures |
| 100 | 85  | ~0.768 | demote (below 0.92) |
| 200 | 196 | >0.95 | hold (already promoted, no transition) |

The 50/49 fixture from the plan's <action> example would NOT clear the 0.95 promote gate (Wilson punishes small N). Tests were rewritten to use 169/169 and 151/151 (matching the historical seeds in 60-02 backfill) for the promote-gate cases. This is a Rule 1 fix on the plan's example values, not a behaviour change.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 -- Bug in plan example] Test fixtures n=50, agree=49 do NOT clear the 0.95 promote gate**
- **Found during:** Task 1 -- first vitest run failed `expected 'no_change' to be 'shadow_would_promote'`.
- **Issue:** The plan's <action> §2 prescribes `n=50, agree=49 -> action='shadow_would_promote'`. Wilson CI-lo for (50, 49) is ~0.8951 -- comfortably below the 0.95 promote floor. The test correctly asserted the math, but the example fixture chosen by the planner was wrong.
- **Fix:** Rewrote the three impacted promote-path tests to use the historical seed values (169, 169) and (151, 151), both of which clear the gate (ci_lo 0.978 / 0.975). Demote test (100, 85) was correct as written -- ci_lo ~0.768 < 0.92.
- **Files modified:** `web/lib/classifier/__tests__/cron-shadow.test.ts` (3 fixture changes).
- **Commit:** `692af05`.

**2. [Rule 3 -- Tooling] vitest@4 dropped the `--reporter=basic` alias**
- **Found during:** Running the plan's `<verify>` command.
- **Issue:** `pnpm vitest run lib/classifier --reporter=basic` errors with `Failed to load url basic` on vitest 4.1.5 (the `basic` reporter was the v2/v3 pre-default; v4 ships its own default which is equivalent).
- **Fix:** Documented here -- ran without the flag (`pnpm vitest run lib/classifier`); same coverage and output. No code change.
- **Files modified:** none.

**3. [Tracking note] 60-04 in-progress UI files swept into 60-03 docs commit `9d02eb2`**
- **Found during:** post-commit `git show --stat`.
- **Issue:** The `docs(60-03)` commit unexpectedly captured 7 already-on-disk 60-04 files (`web/app/(dashboard)/automations/classifier-rules/*` and a test file mod). I ran `git add` with the SUMMARY path only -- they appear to have been pre-staged by a prior session/tool. The 60-03 substantive work (cron + tests) lives cleanly in `692af05` and is untouched by this.
- **Fix:** Not reverting -- the files are valid 60-04 GREEN-phase work (paired with the `test(60-04)` RED commit `0107752` already on main). 60-04 should reference these as already-landed and add only its impl/glue commits on top. No content of those files was authored by this plan.
- **Files affected:** `web/app/(dashboard)/automations/classifier-rules/{actions.ts,block-rule-modal.tsx,ci-lo-sparkline.tsx,page.tsx,rule-status-badge.tsx,rules-table.tsx}`, `web/tests/classifier-rules/rules-table.test.tsx`.
- **Commit:** `9d02eb2`.

No other deviations. Pure additions to the cron file plus an exported helper for testability (called out in the plan's Task 1 §2 as a permitted "small refactor -- fine").

## Authentication Gates

None -- all work was filesystem + local typecheck + vitest. The cron will be exercised live by Inngest scheduler post-deploy; no manual auth steps.

## Threat Model -- Mitigations Realized

| Threat | Disposition | Realized in 60-03 |
|--------|-------------|-------------------|
| T-60-03-01 (Premature live mutation during shadow window) | mitigate | Default branch is shadow (`process.env.CLASSIFIER_CRON_MUTATE !== 'true'`); flag-flip is a deliberate Vercel env edit deferred to 60-07 |
| T-60-03-02 (Demotion happens silently) | mitigate | `console.warn("[classifier-cron] DEMOTION", { rule_key, n, ci_lo })` + permanent classifier_rule_evaluations row with action='demoted' |
| T-60-03-03 (Same-day re-trigger doubles rows) | mitigate | Every upsert uses `{ onConflict: "swarm_type,rule_key,evaluated_at" }` -- DB unique index collapses re-fires |
| T-60-03-05 (manual_block rule auto-overwritten) | mitigate | Explicit early-return in `evaluateRule()` -- `status === 'manual_block'` writes 'no_change' eval row and skips both update branches |

T-60-03-04 (DoS via slow telemetry view JOIN) accepted per plan -- cron runs once/day, perf irrelevant.
T-60-03-06 (reviewer toggles flag) deferred to 60-07 -- env-var lives in Vercel admin panel, out of band from app DB.

## TDD Gate Compliance

This plan is `type: execute` with Task 1 carrying `tdd="true"`:
- **RED:** `cron-shadow.test.ts` already on disk from 60-00 with 5 `it.todo` blocks -- effectively the failing test surface.
- **GREEN:** commit `692af05` ships the impl + flips all `it.todo` to real `expect(...)` assertions in one commit. The test file mocks the admin client via fluent stubs so it fails independently of any DB.
- **REFACTOR:** none needed -- helper extraction was part of the GREEN commit per plan §Task 1 step 2.

Single GREEN commit (no separate `test:`) because the plan-frontmatter is `type: execute`, not `type: tdd` -- the strict RED/GREEN gate sequence applies only to `type: tdd` plans per CLAUDE.md.

## Self-Check: PASSED

- `[ -f web/lib/inngest/functions/classifier-promotion-cron.ts ]` ✓
- `git log --oneline | grep 692af05` ✓ (`feat(60-03): implement classifier promotion cron with shadow-mode default`)
- `grep -c 'id: \"classifier/promotion-cron\"'` → 1 ✓
- `grep -c 'TZ=Europe/Amsterdam 0 6 \* \* 1-5'` → 2 ✓
- `grep -cE '/\*.*\*/.*1-5'` → 0 ✓ (no JSDoc cron leak)
- `pnpm vitest run lib/classifier` → 33 passed / 4 files ✓
- `pnpm tsc --noEmit -p .` → exit 0 ✓

## Ready for Wave 3

60-04..60-06 (queue UI, verdict-worker, mailbox-overrides) can now rely on:
- `classifier_rule_evaluations` rows accumulating daily during shadow window -- gives operators 14 days of "what would the cron have done" data before flipping the flag in 60-07.
- `evaluateRule()` exported helper -- if any other surface (admin panel "evaluate now" button, on-demand POST endpoint) needs to re-run the per-rule decision, it can import the helper directly without re-implementing the gate logic.
- The cron loop registered against `public.classifier_rule_telemetry` -- decoupled from the underlying `automation_runs` JSONB structure, so 60-04+ JSON shape changes don't break the cron.
