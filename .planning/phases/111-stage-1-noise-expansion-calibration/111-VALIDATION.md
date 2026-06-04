---
phase: 111
slug: stage-1-noise-expansion-calibration
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-03
---

# Phase 111 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <changed test file>` |
| **Full suite command** | `cd web && npx vitest run lib/inngest lib/classifier lib/swarms lib/automations/sales-email` |
| **Estimated runtime** | ~30–90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command on the touched test file
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run check:supabase` 0 ERROR
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 111-01-01 | 01 | 1 | STAGE1-01 | T-111-01/02/03 | RED contracts for both gates + debtor regression net | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts` | ⚠ extend | ⬜ pending |
| 111-01-02 | 01 | 1 | STAGE1-01 | T-111-01 | verdict-worker inline archive dry-run-gated (Finding 1) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts -x` | ⚠ extend | ⬜ pending |
| 111-01-03 | 01 | 1 | STAGE1-01 | T-111-02/03 | Wilson promotion gate generalized to Step 5; debtor unchanged (Finding 2) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.phase89.test.ts -x` | ⚠ extend | ⬜ pending |
| 111-03-01 | 03 | 1 | STAGE1-02 | T-111-16 | retro table RLS + service-role policy + idempotency key | structural | `test -f supabase/migrations/20260603_stage_1_retro_runs.sql && grep RLS+service_role+unique` | ❌ new | ⬜ pending |
| 111-03-02 | 03 | 1 | STAGE1-02 | T-111-10/11 | two-corpus, direction-normalized selection; cap fail-loud | unit | `cd web && npx vitest run lib/automations/sales-email/retro/__tests__/select-candidates.test.ts -x` | ❌ new | ⬜ pending |
| 111-03-03 | 03 | 1 | STAGE1-02 | T-111-08/09 | retro harness idempotent + side-channel isolated | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-email-stage-1-retro-classify.test.ts -x` | ❌ new | ⬜ pending |
| 111-02-01 | 02 | 2 | STAGE1-01 | T-111-05/06 | safe flip migration (3 archive, 2 review held) | structural | `grep category_key IN + NOT payment_admittance archive` | ❌ new | ⬜ pending |
| 111-02-02 | 02 | 2 | STAGE1-01 | T-111-06 | registry-assertion test encodes D-06 disposition | unit | `cd web && npx vitest run lib/swarms/__tests__/sales-noise-calibration.test.ts -x` | ❌ new | ⬜ pending |
| 111-04-01 | 04 | 2 | STAGE1-02 | T-111-12/14 | cluster miner reads retro unknown bucket; no hardcode; no auto-INSERT | structural | `grep stage_1_retro_runs && ! grep info@smeba.nl` | ❌ new | ⬜ pending |
| 111-04-02 | 04 | 2 | STAGE1-02 | T-111-13 | loopback false-archive rate measured; data-driven enable/disable | unit | `cd web && npx vitest run lib/automations/sales-email/retro/__tests__/loopback-validation.test.ts -x` | ❌ new | ⬜ pending |
| 111-04-03 | 04 | 2 | STAGE1-02 | — | stage-1-regex.md corrected (Finding 3) + D-08/D-09 recorded | structural | `grep call-time + own_outbound_invoice_loopback in docs/agentic-pipeline/stage-1-regex.md` | ⚠ edit | ⬜ pending |
| 111-05-01 | 05 | 3 | STAGE1-01,STAGE1-02 | T-111-15/18 | [BLOCKING] apply both migrations via MCP | manual/MCP | verified in 111-05-02 | n/a | ⬜ pending |
| 111-05-02 | 05 | 3 | STAGE1-01,STAGE1-02 | T-111-16/17 | live disposition + table + no codegen drift + RLS 0 ERROR | integration | `cd web && npm run codegen && git diff --exit-code && npm run check:supabase` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** No run of 3 consecutive tasks lacks an automated verify. The only non-`<automated>`-asserting task is 111-05-01 (MCP apply, no local CLI hook) — immediately followed by 111-05-02's integration gate. ✅

---

## Wave 0 Requirements

- [x] RED test: `classifier-verdict-worker` does NOT fire live Outlook archive for sales when `stage_1_archive` is dry-run-blocked (Finding 1) → Plan 01 Task 1 (Test A).
- [x] RED test: the auto-archive promotion gate (`gateClearsForAutoArchive` / Wilson) applies to the swarm-agnostic path, not only `@/lib/debtor-email/classify` (Finding 2) → Plan 01 Task 1 (Test B).
- [x] RED test: debtor Stage 1 behavior provably unchanged after gate generalization (regression net) → Plan 01 Task 1 (Test C).
- [x] Stage-1 retro harness + side-channel-isolation guard test → Plan 03 Task 3.
- [x] New retro output table migration (RLS + service-role policy) → Plan 03 Task 1.
- [x] Gate-generalization fixture for a `stage1_regex_module=null` swarm → Plan 01 Task 1 (Test B).
- [x] Direction-normalization helper + test → Plan 03 Task 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator approval of mined noise-rule candidates | STAGE1-02 | Human judgment on which clusters are genuinely noise | Run `scripts/sales-stage-1-cluster-mine.ts`; review the ranked candidate list; approve a subset (follow-up migration + seed re-fire lands the approved keys) |
| Live promotion of an `llm:*:high` rule after organic telemetry | STAGE1-01 | Requires accumulated operator feedback (n≥30) post-deploy; telemetry is empty until operators act in Bulk Review (Pitfall 6) | Verify `CLASSIFIER_CRON_MUTATE=true` in prod; Wilson-CI shadow report identifies ≥1 `shadow_would_promote` |
| Live loopback enable/disable for sales | STAGE1-02 | Decision derived from the live retro-run output via loopback-validation.ts recommendation | Run the retro-run live, read the recommendation, apply a follow-up registry change if 'disable' |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (2026-06-03)
