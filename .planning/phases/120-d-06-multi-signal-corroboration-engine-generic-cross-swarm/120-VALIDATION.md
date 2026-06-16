---
phase: 120
slug: d-06-multi-signal-corroboration-engine-generic-cross-swarm
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-16
---

# Phase 120 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed validation architecture lives in `120-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run lib/agentic-pipeline/resolve lib/automations/sales-email` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~30-60 seconds (unit); correctness-gate harness is a separate live integration run |

---

## Sampling Rate

- **After every task commit:** `cd web && npx vitest run lib/agentic-pipeline/resolve lib/automations/sales-email`
- **After every plan wave:** `cd web && npm test` (+ `./scripts/no-engine-diff-check.sh` POST-rebaseline only)
- **Before `/gsd:verify-work`:** full suite green + no-engine-diff PASS (post-rebaseline) + correctness-gate RERUN-FINDINGS recorded
- **Max feedback latency:** ~60 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 120-01-01 | 01 | 1 | CORR-02, CORR-03 | T-120-01/02/03/05 | Lone/forged signal cannot reach AUTO; demote never raises confidence; stopped status not boosted | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/corroboration-boost.test.ts lib/agentic-pipeline/resolve/__tests__/corroboration-demote.test.ts lib/agentic-pipeline/resolve/__tests__/corroboration-lone-signal.test.ts` | ❌ W0 | ⬜ pending |
| 120-01-02 | 01 | 1 | CORR-01, CORR-04 | T-120-04 | No-corr swarm byte-identical; collect path pure/replay-safe | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/corroboration-collect.test.ts lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts lib/agentic-pipeline/resolve/__tests__/precedence-inversion.test.ts` | ❌ W0 (collect) / ✅ (port,precedence) | ⬜ pending |
| 120-02-00 | 02 | 2 | CORR-05 | T-120-09 | Zap URL live + sales in allowlist (else fail-closed) | checkpoint | manual (operator) | n/a | ⬜ pending |
| 120-02-01 | 02 | 2 | CORR-05 | T-120-06/08 | SQL back-search exact (is_unique_in_scope); 512887 false-positive class eliminated | unit | `cd web && npx vitest run lib/automations/sales-email/lookups` | ❌ W0 | ⬜ pending |
| 120-02-02 | 02 | 2 | CORR-04 | T-120-07 | Sales uses shared helper, zero swarm-name branch; _match.ts guard preserved | unit | `cd web && npx vitest run lib/automations/sales-email/__tests__/corroboration-sales.test.ts lib/automations/sales-email/__tests__/resolve-customer.test.ts lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts` | ❌ W0 (corr-sales) / ✅ (others) | ⬜ pending |
| 120-03-01 | 03 | 3 | CORR-05 | T-120-10/11 | Seed↔constant lockstep; min_signals floor-guarded; no field clobber | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/debtor-corroboration-config.test.ts` | ❌ W0 | ⬜ pending |
| 120-03-02 | 03 | 3 | CORR-05 | T-120-12/13 | Live re-seed; RLS green; sales stays dry-run-gated | checkpoint | `cd web && npm run check:supabase` (0 ERROR) | n/a | ⬜ pending |
| 120-04-01 | 04 | 4 | CORR-05 | T-120-14/16 | 4 confident-wrong demote; gold-signal non-regression | integration | `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` | ❌ W0 | ⬜ pending |
| 120-04-02 | 04 | 4 | CORR-05 | T-120-15 | no-engine-diff PASS post-rebaseline → FINAL STAGE2-01 | script | `./scripts/no-engine-diff-check.sh` | ✅ (script exists; donor re-pointed) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/agentic-pipeline/resolve/__tests__/corroboration-collect.test.ts` — CORR-01
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/corroboration-boost.test.ts` — CORR-02 agreement
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/corroboration-demote.test.ts` — CORR-02 disagreement (4 confident-wrong)
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/corroboration-lone-signal.test.ts` — CORR-03 (12 ambiguity + gold non-regression)
- [ ] `web/lib/automations/sales-email/__tests__/corroboration-sales.test.ts` — CORR-04 SWARM-02
- [ ] `web/lib/automations/sales-email/lookups/__tests__/{offerte,order,sites}-backsearch.test.ts` — D-09 transport
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/debtor-corroboration-config.test.ts` — seed↔constant lockstep
- [ ] `web/scripts/eval/resolver-correctness-gate.ts` — correctness gate harness (build per A5)
- vitest present — no framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| resolve_candidates Zap URL live + sales in allowlist | CORR-05 | Live registry/operator state (OQ-3/A1/A2) | Plan 02 Task 0 checkpoint — SELECT zapier_tools target_url + allowed_for_intents |
| Live re-seed applied + RLS green | CORR-05 | Production Supabase write | Plan 03 Task 2 [BLOCKING] — apply_migration + check:supabase + SELECT verify |
| Correctness re-run verdicts match operator expectation | CORR-05 | Hand-validated ground-truth + live substrate | Plan 04 checkpoint — review RERUN-FINDINGS.md (4-row demotion + gold non-regression) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoints excepted)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (unit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-16
