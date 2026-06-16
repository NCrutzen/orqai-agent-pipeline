---
phase: 130
slug: info-stage-1-noise-recalibration-v9-7-p0
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-16
updated: 2026-06-16
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`web/__tests__/`, `web/lib/**/__tests__/`, `*.test.ts`) |
| **Config file** | `web/vitest.config.ts` (existing — no Wave-0 install) |
| **Quick run command** | `cd web && npx vitest run <file>` |
| **Full suite command** | `cd web && npm test` |
| **Migration lint** | `npm run check:supabase` (pre-push hook; fails on ERROR-level advisor) |
| **Codegen drift gate** | `cd web && npm run codegen && git diff --exit-code` (noise keys are NOT codegen'd — expect no drift) |
| **Estimated runtime** | ~5–15 seconds per quick file run |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` quick command.
- **After every plan wave:** Run `cd web && npm test` (full suite) + `npm run check:supabase`.
- **Before `/gsd:verify-work`:** Full suite green + check:supabase 0 ERROR.
- **Max feedback latency:** ~15 seconds (unit/integration vitest or grep — no watch mode, no E2E).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 130-01-01 | 01 | 0 | NOISE-02 | T-130-01-01 | CHECK widened to include info-routing (union of swarm_type values preserved) | static/grep | `grep -q "drop constraint if exists agent_runs_swarm_type_check" supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql` | ❌ W0 | ⬜ pending |
| 130-01-02 | 01 | 0 | NOISE-02 | T-130-01-02 | info-routing agent_runs INSERT succeeds (no 23514) | integration | `cd web && npx vitest run __tests__/migrations/agent-runs-info-routing-insert.test.ts` | ❌ W0 | ⬜ pending |
| 130-01-03 | 01 | 0 | NOISE-02 | T-130-01-01 | Operator applies CHECK-widen; smoke passes live | checkpoint | (manual: apply_migration + check:supabase 0 ERROR + smoke PASS) | n/a | ⬜ pending |
| 130-02-01 | 02 | 1 | NOISE-01, NOISE-05 | T-130-02-03 | 6 info-routing noise categories seeded, swarm-isolated, no swarm_intents | static/grep | `grep -c "'info-routing'" supabase/migrations/20260616b_phase130_info_routing_noise_categories.sql` (>=6) | ❌ W1 | ⬜ pending |
| 130-02-02 | 02 | 1 | NOISE-01 | T-130-02-04 | 6 paired classifier_rules candidates, kind=agent_intent, status=candidate (no promoted/regex) | static/grep | `grep -q agent_intent supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql && ! grep -q "'regex'" supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql` | ❌ W1 | ⬜ pending |
| 130-02-03 | 02 | 1 | NOISE-04 | T-130-02-01, T-130-02-02 | hasActionableToken carve-out wins over noise; word-boundary + compound-word exclusion; ReDoS-safe | unit | `cd web && npx vitest run __tests__/stage-1/info-routing-actionable-carveout.test.ts` | ❌ W1 | ⬜ pending |
| 130-03-01 | 03 | 1 | NOISE-03 | T-130-03-01 | composition view created security_invoker=true (never SECURITY DEFINER) | static/grep | `grep -q "security_invoker = true" supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql && ! grep -qi "security definer" supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql` | ❌ W1 | ⬜ pending |
| 130-03-02 | 03 | 1 | NOISE-01 | — | 6 info-routing categories reach the LLM call-time closed list | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts` | ❌ W1 | ⬜ pending |
| 130-03-03 | 03 | 1 | NOISE-03 | T-130-03-02 | baseline script arg-guarded; pure fraction+Wilson-CI; manual labelling documented | smoke | `cd web && npx tsx scripts/eval/info-unknown-pool-noise-baseline.ts` (no args → usage error, non-zero) | ❌ W1 | ⬜ pending |
| 130-03-04 | 03 | 1 | NOISE-02, NOISE-03 | T-130-03-02, T-130-03-03 | migrations applied; telemetry flowing; BEFORE baseline captured; promotion stays shadow | checkpoint | (manual: apply 20260616b/c/d + check:supabase + codegen drift + live telemetry + baseline) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Widen `public.agent_runs.swarm_type` CHECK to include `info-routing` (migration `20260616_phase130_...`) — unblocks all shadow telemetry.
- [ ] Verify a live `agent_runs` INSERT for `swarm_type='info-routing'` returns no `23514` violation (smoke test 130-01-02, passes after operator applies the migration).

Wave 0 covers all MISSING references: the smoke test (`__tests__/migrations/agent-runs-info-routing-insert.test.ts`) is created in Wave 0 (130-01 Task 2); no other task references a missing test fixture.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Baseline true-noise labelling of "unknown" pool sample | NOISE-03 | Human judgement of noise-vs-routable on a per-mailbox sample | Run `info-unknown-pool-noise-baseline.ts` to draw the seeded sample; label each row noise-vs-routable; feed labels back; script computes the true-noise fraction + Wilson CI per mailbox, before AND after promotion. |
| Migration apply + live telemetry confirm | NOISE-02 | Supabase MCP apply_migration is operator-gated; live Stage-1 trigger needs production traffic | Checkpoints 130-01-03 and 130-03-04: apply migrations in order, run check:supabase, trigger one live info-routing unknown email, confirm an agent_runs row lands (no 23514). |
| Carve-out sample-verification before promotion | NOISE-04 | Human review of a shadow-telemetry sample before flipping CLASSIFIER_CRON_MUTATE | Review shadow `classifier_rule_evaluations` + a labelled sample; confirm zero actionable false-archives before any promotion. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoints / Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (each auto task carries a quick command)
- [x] Wave 0 covers all MISSING references (the smoke test is created in Wave 0)
- [x] No watch-mode flags (all `vitest run` / grep / single tsx invocation)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-16
