---
phase: 66
slug: pipeline-consolidation-retire-triage-path
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `66-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing — `web/vitest.config.ts`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && pnpm exec vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts lib/automations/debtor-email/coordinator/__tests__` |
| **Full suite command** | `cd web && pnpm exec vitest run` |
| **Estimated runtime** | ~30s quick / ~120s full (Phase 65 baseline) |

---

## Sampling Rate

- **After every task commit:** Run quick command (coordinator + handler tests).
- **After every plan wave:** Run full suite + the static-audit grep block (see Wave 0).
- **Before `/gsd-verify-work`:** Full suite green + Vercel-preview synthetic-emit smoke (4 paths) green.
- **Max feedback latency:** 30s (quick), 120s (full).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 66-01-XX | 01 (rename + dir move) | 1 | CONS-02 | — | N/A (no auth-touching changes) | unit | `cd web && pnpm exec vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` | ✅ (renamed from `debtor-email-triage.test.ts`) | ⬜ pending |
| 66-01-XX | 01 | 1 | CONS-02 | — | N/A | static | `! grep -rn "debtor-email-triage\|debtorEmailTriage" web/ --include="*.ts" --include="*.tsx" \| grep -v ".next/"` (expect 0 lines) | ❌ W0 (audit checklist) | ⬜ pending |
| 66-01-XX | 01 | 1 | CONS-02 | — | N/A | static | `grep -c "debtorEmailCoordinator" web/app/api/inngest/route.ts` (expect ≥ 2 — import + array entry) | ❌ W0 | ⬜ pending |
| 66-02-XX | 02 (trigger retarget) | 2 | CONS-01 | — | N/A | unit | coordinator test fires `debtor-email/coordinator.requested` and asserts intent-agent invocation | ❌ W0 (test rewrite) | ⬜ pending |
| 66-02-XX | 02 | 2 | CONS-01 | — | N/A | unit | label-resolver test asserts `inngest.send({ name: "debtor-email/coordinator.requested", ... })` after `email_labels` insert | ❌ W0 (test added) | ⬜ pending |
| 66-02-XX | 02 | 2 | CONS-01 | — | N/A | static | `! grep -rn "debtor/email.received" web/ --include="*.ts" \| grep -v ".next/"` (expect 0 lines after Option A retarget) | ❌ W0 | ⬜ pending |
| 66-03-XX | 03 (CONS-03 audit) | 2 | CONS-03 | — | N/A | static | `! grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ --include="*.ts" \| grep -v __tests__` (expect 0 lines) | ❌ W0 | ⬜ pending |
| 66-03-XX | 03 | 2 | CONS-03 | — | N/A | static | every `debtor-email/<intent>.requested` emit site present in allowlist (`debtor-email-coordinator.ts`, `coordinator-orchestrator.ts`, `coordinator-complete.ts`) | ❌ W0 (manual checklist) | ⬜ pending |
| 66-04-XX | 04 (live smoke) | 3 | CONS-01 | — | N/A | integration | Vercel-preview synthetic-emit: send `debtor-email/coordinator.requested` 4 times, verify exactly one `coordinator_runs` row per email; no rows on old function id | ❌ W0 (`66-regression-report.md`) | ⬜ pending |
| 66-04-XX | 04 | 3 | CONS-01 | — | N/A | integration | SQL query: `select email_id, count(*) from coordinator_runs where created_at > deploy_ts group by email_id having count(*) > 1` (expect 0 rows) | ❌ W0 (SQL block in regression report) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — planner assigns concrete `66-NN-NN` ids in PLAN.md frontmatter.*

---

## Wave 0 Requirements

- [ ] **`66-regression-report.md`** — adapted from Phase 65's `65-regression-report.md` template; captures the 4-path synthetic-emit smoke results.
- [ ] **Static-audit checklist** — 4 grep commands inline in the verification plan:
  1. `! grep -rn "debtor-email-triage\|debtorEmailTriage" web/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" | grep -v ".next/" | grep -v ".planning/"` (CONS-02 lock)
  2. `! grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ --include="*.ts" | grep -v __tests__` (CONS-03 lock)
  3. `! grep -rn "debtor/email.received" web/ --include="*.ts" --include="*.tsx" | grep -v ".next/"` (D-03 retarget lock)
  4. Manual allowlist review: every `debtor-email/.*\\.requested` emit site is in the allowlist.
- [ ] **Existing test renames** — `debtor-email-triage.test.ts` → `debtor-email-coordinator.test.ts`; tests under `triage/__tests__/` move to `coordinator/__tests__/` per the directory move (D-02).
- [ ] **No new framework install** — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel-preview synthetic emit covering 4 regression paths | CONS-01 | Requires deployed preview + Inngest dev-server; cannot run in CI without infra | (1) Deploy PR to Vercel preview. (2) From the Inngest dashboard preview environment, manually emit `debtor-email/coordinator.requested` for the 4 prepared smoke email rows (one per regression path). (3) Verify expected `coordinator_runs` and `automation_runs` row counts via the SQL queries in `66-regression-report.md`. (4) Capture screenshots into the regression report. |
| Inngest dashboard shows old function id (`automations/debtor-email-triage`) absent and new (`automations/debtor-email-coordinator`) present | CONS-02 | Inngest dashboard, not file-based | Operator opens Inngest dashboard for the deployed preview env, confirms function list. |
| Doc reads — `docs/debtor-email-pipeline-architecture.md` and `docs/agentic-pipeline/stage-3-coordinator.md` describe the coordinator with new terminology | D-10 | Semantic check, not grep-able (existing matches are about *human* triage, not the function) | Reviewer reads both docs end-to-end and confirms no leftover references to the legacy function/pipeline. |

---

## Production Path (Stage 1 gap)

> **Important note carried from research:** the live ingest pipeline currently breaks at Stage 0 → Stage 1 (`classifier/screen.requested` has no subscriber in `web/app/api/inngest/route.ts`). Phase 66 cannot exercise the *full* live chain (Outlook → Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4) until that worker exists. **Acceptance for Phase 66 is therefore Vercel-preview synthetic-emit verification of the Stage 2 → 3 → 4 path** — same verification class Phase 65 used. The Stage 1 gap is captured as a deferred follow-up (see `66-CONTEXT.md` § Deferred Ideas — to be added by planner) and does NOT block Phase 66 closure.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (regression report template, static-audit checklist, test rename map)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for quick / 120s for full
- [ ] `nyquist_compliant: true` set in frontmatter (after planner approval)

**Approval:** pending
