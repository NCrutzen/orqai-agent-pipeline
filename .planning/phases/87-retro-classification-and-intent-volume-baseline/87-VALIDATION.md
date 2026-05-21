---
phase: 87
slug: retro-classification-and-intent-volume-baseline
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-20
updated: 2026-05-20
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled in by gsd-planner during PLAN.md generation. Wave 0 task IDs land in the per-task verification map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run --no-coverage <file>` |
| **Full suite command** | `cd web && npm run test` |
| **Estimated runtime** | ~30s (focused), ~3min (full) |

---

## Sampling Rate

- **After every task commit:** Run focused vitest on the touched file(s)
- **After every plan wave:** Run `cd web && npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green + 50-email smoke run logged
- **Max feedback latency:** ~30s for focused runs

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 01 | 1 | REQ-87-02 | T-87-05 | RLS + service-role policy on stage_3_retro_runs; UNIQUE (run_id, email_id) | structural | `test -f supabase/migrations/20260521_phase87_stage_3_retro_runs.sql && grep -q "ENABLE ROW LEVEL SECURITY" $_ && grep -q "stage_3_retro_runs_run_email_uniq" $_` | ✅ on emit | ⬜ |
| 01-T2 | 01 | 1 | REQ-87-03 | T-87-05 | RLS + service-role policy on intent_volume_baselines; intent_source CHECK constraint | structural | `test -f supabase/migrations/20260521_phase87_intent_volume_baselines.sql && grep -q "CHECK (intent_source" $_` | ✅ on emit | ⬜ |
| 01-T3 | 01 | 1 | REQ-87-02/03 | T-87-05 | Migrations applied; check:supabase green | manual | `npx supabase db push --linked && cd web && npm run check:supabase` | n/a | ⬜ |
| 02-T1 | 02 | 2 | REQ-87-01 | T-87-01a | selectCandidates throws on >5000 (D-03 fail-loud) | unit | `cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts` | ❌ Wave 0 | ⬜ |
| 02-T2 | 02 | 2 | REQ-87-01 | T-87-03a | reconstructInput.assembled_input byte-identical to live coordinator | unit | `cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts` | ❌ Wave 0 | ⬜ |
| 02-T3 | 02 | 2 | REQ-87-03/04 | — | aggregateBaseline produces share=1.0 ± ε | unit | `cd web && npx vitest run --no-coverage lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts` | ❌ Wave 0 | ⬜ |
| 03-T1 | 03 | 2 | REQ-87-06 | T-87-regression | invokeIntentAgent surfaces usage non-breakingly | unit + tsc | `cd web && npx vitest run --no-coverage lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts && npx tsc --noEmit` | ❌ Wave 0 | ⬜ |
| 04-T1 | 04 | 3 | REQ-87-07 | T-87-02/03 | Precondition gate (R-04) + cache-bypass + side-channel-isolation guards | unit (Wave 0, RED until 04-T2) | `cd web && npx vitest run --no-coverage lib/automations/debtor-email/__tests__/retro-classify-*.test.ts` | ❌ Wave 0 | ⬜ |
| 04-T2 | 04 | 3 | REQ-87-01/02/06/07 | T-87-02/03/Replay | Inngest function honours all 5 hard rules; spec covers happy path + idempotent re-run + precondition short-circuit | unit | `cd web && npx vitest run --no-coverage lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts && npx tsc --noEmit` | ❌ Wave 0 | ⬜ |
| 04-T3 | 04 | 3 | REQ-87-01 | T-87-04 | CLI calls inngest.send inline; no destructure | structural | `cd web && test -f scripts/run-retro-classify.ts && grep -q "inngest.send" scripts/run-retro-classify.ts && ! grep -q "const send = inngest" scripts/run-retro-classify.ts` | ✅ on emit | ⬜ |
| 04-T4 | 04 | 3 | REQ-87-01 | T-87-02 | 50-email production smoke run completes with zero step failures; agent_runs untouched | manual (production) | Inngest dashboard + SQL sanity check (see Plan 04 Task 4 step 7) | n/a | ⬜ |
| 05-T1 | 05 | 4 | REQ-87-01 | T-87-01 | Full 5000-email run completes; total_tokens reported | manual (production) | Inngest run URL + token telemetry | n/a | ⬜ |
| 05-T2 | 05 | 4 | REQ-87-04 | — | 20-row hand-grading completed | manual (operator judgement) | Inline markdown table in 87-BASELINE-REPORT.md | n/a | ⬜ |
| 05-T3 | 05 | 4 | REQ-87-05 | — | 87-BASELINE-REPORT.md authored with all 4 D-04 sections + SC-1..SC-4 checklist filled | manual (operator deliverable) | `test -f .planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md` | n/a | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per-PLAN Wave 0 test stubs (all five RED before implementation lands):

- [ ] `web/lib/automations/debtor-email/retro/__tests__/select-candidates.test.ts` — REQ-87-01 (Plan 02 Task 1) + D-03 5000-cap
- [ ] `web/lib/automations/debtor-email/retro/__tests__/reconstruct-input.test.ts` — REQ-87-01 (Plan 02 Task 2) + byte-identity to live coordinator
- [ ] `web/lib/automations/debtor-email/retro/__tests__/aggregate-baseline.test.ts` — REQ-87-03/04 (Plan 02 Task 3)
- [ ] `web/lib/automations/debtor-email/retro/__tests__/fixtures/sample-emails.ts` — shared fixture + `buildMockAdmin` helper
- [ ] `web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-usage.test.ts` — REQ-87-06 (Plan 03)
- [ ] `web/lib/automations/debtor-email/__tests__/retro-classify-precondition.test.ts` — R-04 gate (Plan 04 Task 1)
- [ ] `web/lib/automations/debtor-email/__tests__/retro-classify-cache-isolation.test.ts` — Pitfall 3 / cache bypass (Plan 04 Task 1)
- [ ] `web/lib/automations/debtor-email/__tests__/retro-classify-side-channel-isolation.test.ts` — Side-Channel Isolation hard rule (Plan 04 Task 1)
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-stage-3-retro-classify.test.ts` — function spec (Plan 04 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migrations applied to linked Supabase (Plan 01 Task 3) | REQ-87-02/03 | `supabase db push --linked` may prompt for auth | Operator runs push + `npm run check:supabase`; resume on green |
| 50-email production smoke (Plan 04 Task 4) | REQ-87-01 | Live production Inngest + Orq.ai call | Plan 04 Task 4 instructions: dashboard URL + SQL sanity check including agent_runs untouched |
| Full 5000-email retro run (Plan 05 Task 1) | REQ-87-01 | ~6h production batch | Operator launches via CLI, monitors Inngest dashboard, records run_id + total_tokens |
| Hand-graded 20-row diff precision ≥ 70% (D-04 step 3 / SC-4) | REQ-87-04 | Human judgement on reclassification correctness | Operator grades 20 random diff rows inline in `87-BASELINE-REPORT.md` |
| `87-BASELINE-REPORT.md` hypotheses checklist (SC-1, SC-2, SC-3) | REQ-87-05 / D-04 step 4 | Narrative synthesis from multiple SQL outputs | Operator writes report from queries in Plan 05 Task 3 |
| Full-run cost telemetry sanity check | D-03 | $-budget judgement | Operator inspects total `token_usage_total` aggregate per `run_id`, confirms within budget |
| `/gsd-audit-milestone v8.1` closure narrative (SC-6) | — | Cross-phase milestone close | Operator runs after this phase's verification passes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (manual-only items justified above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s for unit tests
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
