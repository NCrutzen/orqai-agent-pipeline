---
phase: 68
slug: swarm-registry-generalisation-canonical-context-shape
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 68 — Validation Strategy

> Source: `68-RESEARCH.md` § Validation Architecture (line 543).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && pnpm exec vitest run lib/swarms/__tests__ lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts lib/inngest/functions/__tests__/classifier-label-resolver.test.ts lib/inngest/functions/__tests__/coordinator-orchestrator.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` |
| **Full suite command** | `cd web && pnpm exec vitest run` |
| **Estimated runtime** | ~30s quick / ~120s full |

---

## Sampling Rate

- **After every task commit:** quick command (registry helpers + 4 swap-site tests).
- **After every wave merge:** full suite + static-audit grep.
- **Before `/gsd-verify-work`:** full suite green + sales-email-stub SWRM-03 test green + Phase 67 regression smoke (the existing icontroller-tag.requested smoke event still tags correctly through the registry-driven dispatch path).
- **Max feedback latency:** 30s quick / 120s full.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-XX | 01 (migration) | 0-1 | SWRM-01, SWRM-02 | static + apply | applied migration: SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='swarms' AND column_name IN ('stage1_regex_module','stage2_entity_resolver','stage3_coordinator_agent_key','canonical_context_shape','entity_brand') returns 5 rows; `swarm_intents` exists with 8 backfill rows | ❌ W0 (migration file) | ⬜ pending |
| 68-02-XX | 02 (registry helpers) | 2 | SWRM-01, SWRM-02 | unit | `vitest run lib/swarms/__tests__/registry.test.ts lib/swarms/__tests__/dynamic.test.ts lib/swarms/__tests__/side-effects.test.ts` exits 0 | ❌ W0 (helpers + tests) | ⬜ pending |
| 68-03-XX | 03 (verdict-worker swap) | 3 | SWRM-04 | unit + static | grep returns 0 lines for `swarm_type === 'debtor-email'` literal in `classifier-verdict-worker.ts`; vitest test asserts the new `evaluateSideEffects("debtor-email", "stage1_categorize_archive", ...)` path produces an `automation_runs` insert with `icontroller='pending'` (kind: automation_run_insert) | ❌ W0 (test added) | ⬜ pending |
| 68-04-XX | 04 (label-resolver swap) | 3 | SWRM-04 | unit | label-resolver test: live-mode + matched + configured → `evaluateSideEffects("debtor-email", "stage2_match_live", ...)` returns the icontroller-tag inngest_event descriptor; assert `inngest.send` called with `debtor-email/icontroller-tag.requested` | ❌ W0 (test extended) | ⬜ pending |
| 68-05-XX | 05 (orchestrator swap) | 3 | SWRM-02 | unit | coordinator-orchestrator test: handler dispatch via `loadHandlerEvent("debtor-email", intent)` returns the same event names as the previous template-literal path; missing intent throws structured "no handler for intent X" error | ❌ W0 (test added) | ⬜ pending |
| 68-06-XX | 06 (coordinator single-shot swap) | 3 | SWRM-02 | unit | debtor-email-coordinator single-shot path test: registry-driven `loadHandlerEvent` lookup matches existing dispatch behaviour for invoice_copy_request; throws on missing intent | ❌ W0 (test extended) | ⬜ pending |
| 68-07-XX | 07 (sales-email-stub) | 4 | SWRM-03 | integration | `vitest run lib/swarms/__tests__/sales-email-stub.test.ts` — SQL-only test inserts a stub swarm + 3 intents, exercises `loadSwarmRegistry`, `loadHandlerEvent`, `evaluateSideEffects`, and `loadCanonicalContextShape`; cleanup via DELETE FROM swarms (CASCADE drops intents) | ❌ W0 (test added) | ⬜ pending |
| 68-08-XX | 08 (audit + docs) | 5 | SWRM-04 | static | `! grep -rn "swarm_type === 'debtor-email'\\|swarm_type == \"debtor-email\"" web/lib/inngest/functions/ web/lib/automations/ --include="*.ts" \| grep -v __tests__ \| grep -v "// "` (expect 0 lines); `! grep -rn '"debtor-email/${' web/lib/inngest/functions/ --include="*.ts" \| grep -v __tests__` (expect 0 template-literal handler-event sites) | ❌ W0 | ⬜ pending |
| 68-09-XX | 09 (regression smoke) | 5 | SWRM-01..04 | integration | Re-fire the Phase 67 icontroller-tag smoke event via `bash scripts/phase-67-smoke.sh`; assert `email_labels.icontroller_tag_status` transitions through the new registry-driven dispatch path; same outcome as Phase 67 baseline | ❌ W0 (regression report) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Plan numbers above are illustrative — planner assigns concrete `68-NN` plan ids in PLAN.md frontmatter.*

---

## Wave 0 Requirements

- [ ] **Migration file** `supabase/migrations/20260504b_swarms_registry_generalisation.sql` — letter-suffix convention (continues from Phase 67's `a` suffix).
- [ ] **Helper module skeletons** — `web/lib/swarms/dynamic.ts`, `web/lib/swarms/side-effects.ts`, `web/lib/swarms/__tests__/{registry,dynamic,side-effects}.test.ts` (all with `it.skip` placeholders).
- [ ] **Swap-site test scaffolds** — extensions to existing tests for verdict-worker, label-resolver, coordinator-orchestrator, debtor-email-coordinator.
- [ ] **`sales-email-stub` test scaffold** — `web/lib/swarms/__tests__/sales-email-stub.test.ts` with seed/exercise/cleanup structure (real Supabase, not mocked — proves SWRM-03 against the live schema).
- [ ] **Regression report skeleton** — `68-regression-report.md` adapted from Phase 67's structure.
- [ ] **No new framework install** — Vitest + Supabase JS already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phase 67 regression smoke through registry path | SWRM-04 | Requires Vercel preview deploy + real Inngest event flow | (1) Push Phase 68 branch; wait for Vercel deploy. (2) Run `bash scripts/phase-67-smoke.sh` (still valid — same event shape). (3) Verify the tagger executes the same way (Browserless run completes; row UPDATEd) — proves the registry-driven dispatch produces identical behaviour to Phase 67's hardcoded path. (4) Capture in `68-regression-report.md`. |
| Migration applied to production Supabase | SWRM-01, SWRM-02 | Production DDL change (operator gate); same MCP `apply_migration` workflow as Phase 67 | (1) Operator runs `apply_migration` via Supabase MCP OR `supabase db push`. (2) Verify columns + table + backfill rows present via `select * from swarms; select * from swarm_intents`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers MISSING refs (migration, helpers, swap-site test scaffolds, sales-email-stub test, regression template)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s quick / 120s full
- [ ] `nyquist_compliant: true` set in frontmatter (after planner approval)

**Approval:** pending
