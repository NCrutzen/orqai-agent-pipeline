---
phase: 89
slug: stage-1-llm-2nd-pass-auto-action-promotion-track
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-20
updated: 2026-05-20
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Populated post-revision per checker B1.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.0` (verified via `web/package.json`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` |
| **Full suite command** | `cd web && npm test` (alias for `vitest run`) |
| **Estimated runtime** | Quick: < 10s. Full: ~60-90s. |

---

## Sampling Rate

- **After every task commit:** Run `{quick}` (the targeted vitest invocation for the files touched in the task)
- **After every plan wave:** Run `cd web && npx vitest run lib/inngest/ "app/\(dashboard\)/automations/\[swarm\]/stage-1/"`
- **Before `/gsd:verify-work`:** Full suite (`cd web && npm test`) must be green PLUS `npx tsx scripts/phase-89-shadow-eval.ts` exits 0
- **Max feedback latency:** < 90s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 089-01 | 0 | SC-89-02, SC-89-03 | T-089-01-02 | Read-only probe of Supabase; no mutation | manual/SQL | `test -f .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md && grep -q 'DECISION-01' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md && grep -q 'DECISION-02' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md && grep -q 'Query A' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md && grep -q 'Query D' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md` | ❌ (Wave 0 creates) | ⬜ pending |
| 02-T1 | 089-02 | 1 | SC-89-02, SC-89-04, SC-89-05 | T-089-02-01..05 | LLM rule_key insert (success+failure paths); effectiveMatchedRule gate; debtor dispatch UNCHANGED | unit (RED stubs — expect FAIL) | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.phase89.test.ts 2>&1 | grep -E 'failed|FAIL'` (RED: tests must FAIL before 02-T2 implementation lands) | ❌ (02-T1 creates) | ⬜ pending |
| 02-T2 | 089-02 | 1 | SC-89-02, SC-89-04, SC-89-05 | T-089-02-01..05 | Implements worker edits → RED tests turn GREEN | unit (GREEN) | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.gate.test.ts lib/inngest/functions/__tests__/classifier-screen-worker.phase89.test.ts` | ✅ (edits existing source) | ⬜ pending |
| 03-T1 | 089-03 | 1 | SC-89-01, SC-89-05 | T-089-03-01..04 | Seed function excludes 'unknown'; ON CONFLICT idempotent; kind=agent_intent | TS compile | `cd web && npx tsc --noEmit -p . 2>&1 | grep -E 'classifier-llm-rules-seed' ; test $? -eq 1` | ❌ (03-T1 creates) | ⬜ pending |
| 03-T2 | 089-03 | 1 | SC-89-01, SC-89-05 | T-089-03-01..04 | Seed test asserts unknown-exclusion + onConflict + multi-swarm | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts` | ❌ (03-T2 creates) | ⬜ pending |
| 04-T1 | 089-04 | 1 | SC-89-03, SC-89-05 | T-089-04-01..05 | Idempotent UPDATE; never touches human_verdict | static lint | `test -f supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql && grep -c 'UPDATE public.agent_runs' supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql | grep -q '^1$' && grep -c "rule_key IS NULL" supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql | grep -q '^1$' && ! grep -q 'human_verdict' supabase/migrations/20260520_phase89_llm_rule_key_backfill.sql` | ❌ (04-T1 creates) | ⬜ pending |
| 05-T1 | 089-05 | 1 | SC-89-02 | T-089-05-01..03 | RSC row-loader synthesizes ruleKey for llm_2nd_pass rows; regex rows preserved | unit | `cd web && npx vitest run "app/\(dashboard\)/automations/\[swarm\]/stage-1/" 2>&1 | tail -30` | ✅ (extends existing page.tsx) | ⬜ pending |
| 05-T2 | 089-05 | 1 | SC-89-02 | T-089-05-01..02 | recordVerdict accepts llm:* rule_key + persists to agent_runs | unit | `cd web && npx vitest run "app/\(dashboard\)/automations/\[swarm\]/stage-1/__tests__/" 2>&1 | tail -20` | ✅ (extends sibling test) | ⬜ pending |
| 06-T1 | 089-06 | 2 | SC-89-03 | T-089-06-01..03 | Live db push + idempotency + human_verdict safety SELECT | checkpoint:human-action | `test -f .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-06-PUSH-LOG.md && grep -c 'Push 1\|Push 2\|rule_key distribution\|human_verdict' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-06-PUSH-LOG.md | head -1` | ❌ (06-T1 creates) | ⬜ pending |
| 07-T1 | 089-07 | 3 | SC-89-03 | T-089-07-01 | Read-only Wilson-CI shadow harness; no DB writes | static lint | `test -f scripts/phase-89-shadow-eval.ts && grep -c 'wilsonCiLower\|shouldPromote\|classifier_rule_telemetry\|rule_key LIKE\|like.*llm:%' scripts/phase-89-shadow-eval.ts | head -1` | ❌ (07-T1 creates) | ⬜ pending |
| 07-T2 | 089-07 | 3 | SC-89-01, SC-89-03, SC-89-04, SC-89-05 | T-089-07-01..03 | Seed fire + shadow-eval run + SC-89-05 git-diff gate + SC-89-04 UAT runbook | checkpoint:human-action | `test -f .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-SHADOW-REPORT.md && grep -cE 'Step 1|Step 2|Step 3|Step 4|Step 5|Step 6' .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-SHADOW-REPORT.md | head -1` | ❌ (07-T2 creates) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Coverage check:** Every SC-89-NN appears at least once in the Requirement column.
- SC-89-01 → 03-T1, 03-T2, 07-T2
- SC-89-02 → 01-T1 (probe), 02-T1, 02-T2, 05-T1, 05-T2
- SC-89-03 → 01-T1 (probe), 04-T1, 06-T1, 07-T1, 07-T2
- SC-89-04 → 02-T1, 02-T2, 07-T2 (UAT runbook)
- SC-89-05 → 02-T1, 02-T2, 03-T1, 04-T1, 07-T2 (git-diff gate, per B3)

---

## Wave 0 Requirements

- [ ] Wave 0 SELECT to verify whether `automation_runs.rule_key` is written today on predicted bulk-review rows (089-01 Query A/B)
- [ ] Wave 0 SELECT to size the backfill blast radius (089-01 Query C — will_backfill_count)
- [ ] Wave 0 SELECT to confirm `decision_details` field paths for LLM rows (089-01 Query D)
- [ ] DECISION-01 + DECISION-02 locked in 089-WAVE0-PROBE.md before Wave 1 starts
- [ ] Wave 0 test stubs (RED) for new LLM-path `rule_key` insert on `agent_runs` — created by 089-02 Task 1 (RED stub task)
- [ ] Wave 0 test stubs (RED) for `effectiveMatchedRule` derivation guarded by `llmInvoked && categoryKey && confidence` — created by 089-02 Task 1
- [ ] Shadow-mode runner harness (`scripts/phase-89-shadow-eval.ts`) — created by 089-07 Task 1

`wave_0_complete: false` until 089-01 SUMMARY commits with DECISION-01 + DECISION-02 populated and 089-02 Task 1 RED stub file exists.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Acceptance (d): post-promotion auto-archive E2E on debtor-email | SC-89-04 | Requires a real promoted LLM rule and a live noise email matching it; depends on operator-driven `human_verdict` accumulation + a separate CLASSIFIER_CRON_MUTATE flip (out of Phase 89 scope per CONTEXT) | After Wave 0 backfill + seed, run `classifier-promotion-cron` once; if any `llm:*:high` row promotes, observe next matching LLM noise email in `automation_runs` for `triggered_by='stage-1-worker', result.stage='categorize+archive'`. Captured in 089-SHADOW-REPORT.md Step 5 runbook. |
| Live db push (089-06) | SC-89-03 | `supabase db push` is interactive; idempotency + human_verdict safety SELECTs require service-role network access | 089-06-PUSH-LOG.md captures verbatim outputs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (including the `automation_runs.rule_key` SELECT)
- [x] No watch-mode flags
- [x] Feedback latency < target (< 90s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready (pending Wave 0 execution to flip `wave_0_complete`)
