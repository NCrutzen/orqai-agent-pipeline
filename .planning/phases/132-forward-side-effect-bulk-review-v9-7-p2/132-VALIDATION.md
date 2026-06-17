---
phase: 132
slug: forward-side-effect-bulk-review-v9-7-p2
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <changed-file>` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~targeted runs < 30s; full suite multi-minute |

---

## Sampling Rate

- **After every task commit:** Run quick run command on the changed file
- **After every plan wave:** `cd web && npm test && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite green + `npm run codegen && git diff --exit-code` + `npm run check:supabase` (after Plan 04 apply)
- **Max feedback latency:** < 30s per task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| P01-T1 | 01 | 1 | FWD-01/02 (D-01) | T-132-01/02 | live send-scope + reply-to honored; arg-guarded test mailbox | manual smoke | runbook `scripts/smoke/info-routing-forward-scope.ts` (BLOCKING) | ❌ Wave 0 | ⬜ pending |
| P01-T2 | 01 | 1 | FWD-01/02/06 | T-132-02 | forwardMessage never throws; category strings pinned | unit | `cd web && npx vitest run lib/outlook/__tests__/routing-category.test.ts` | ❌ Wave 0 | ⬜ pending |
| P01-T3 | 01 | 1 | FWD-03 (D-04) | T-132-03 | fail-closed per-bucket gate | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate` | partial (extend) | ⬜ pending |
| P02-T1 | 02 | 2 | FWD-01/02/04/05/06 (D-02) | T-132-04/06/07 | three skips, replay no-op, dedup honored, strip-merge | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts lib/automations/info-routing/__tests__/forward-state.test.ts` | ❌ Wave 0 | ⬜ pending |
| P02-T2 | 02 | 2 | FWD-07 | T-132-08 | zero swarm literal; held gate untouched | static + unit | `cd web && npx vitest run lib/inngest/functions/__tests__/coordinator-swarm-branch-guard.test.ts lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` | exists (extend) | ⬜ pending |
| P02-T3 | 02 | 2 | FWD-03 | T-132-14 | RLS table + held-by-default seed | structural | `test -f` + RLS greps (see plan) | ❌ Wave 0 | ⬜ pending |
| P03-T1 | 03 | 2 | FWD-08 | — | forward-status derivation; no swarm literal | unit | `cd web && npx vitest run lib/bulk-review/__tests__/hydrate-routing.test.ts` | ❌ Wave 0 | ⬜ pending |
| P03-T2 | 03 | 2 | FWD-08 | — | 6-field pane + placeholder + disabled forward-now | RTL | `cd web && npx vitest run "app/(dashboard)/automations/[swarm]/_shell/components/__tests__/routing-detail-pane.test.tsx"` | ❌ Wave 0 | ⬜ pending |
| P03-T3 | 03 | 2 | FWD-09 | T-132-09/10/11/12 | auth gate; forward-now refuses unrouted/null/dedup; re-route re-resolves | unit | `cd web && npx vitest run "app/(dashboard)/automations/[swarm]/_shell/actions/__tests__/routing-actions.test.ts"` | ❌ Wave 0 | ⬜ pending |
| P04-T1 | 04 | 3 | FWD-03/08 | T-132-13/14 | migration applied; advisor 0 ERROR; codegen drift clean | manual gate | `npm run codegen && git diff --exit-code` + `npm run check:supabase` + `cd web && npm test` (BLOCKING) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **BLOCKING live smoke (A1):** confirm Outlook connection `56014785` has Graph **send** scope via `createForward → PATCH replyTo → send` against an info@ test mailbox before any per-bucket release (Plan 01 Task 1).
- [ ] `lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts` — RED scaffold created in Plan 01 Task 2, filled in Plan 02 Task 1 (FWD-01/02/04/05, D-02).
- [ ] `lib/outlook/__tests__/routing-category.test.ts` — vocabulary builder + strip-merge (Plan 01 Task 2, FWD-06).
- [ ] extend `lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts` — `isForwardBucketReleased` (Plan 01 Task 3, FWD-03/D-04).
- [ ] extend `coordinator-swarm-branch-guard.test.ts` SHARED_WORKERS to cover the forward worker (Plan 02 Task 2, FWD-07).
- [ ] `lib/bulk-review/__tests__/hydrate-routing.test.ts` + `routing-detail-pane.test.tsx` + `routing-actions.test.ts` (Plan 03, FWD-08/09).
- [ ] migration RLS + `npm run check:supabase` green (Plan 02 written, Plan 04 applied).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Graph send-scope / live forward + reply-to | FWD-01/02 (D-01) | Requires live Outlook tenant + test mailbox | Plan 01 Task 1 smoke: createForward→PATCH replyTo→send against info@ test box; confirm delivery + reply-to = original sender |
| Category appears on source mail | FWD-06 (D-05) | Requires live Outlook mailbox inspection | Inspect source mail categories after a released-bucket forward; expect `AI: routed → <bucket>` |
| Migration applied + advisor + drift gates | FWD-03/08 | Production DB apply + operator confirmation | Plan 04 Task 1: apply 20260617e, SELECT-verify held seed + RLS, codegen drift clean, check:supabase 0 ERROR, full suite green |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / manual-smoke dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only the two BLOCKING checkpoints are manual, each isolated in its own plan)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (targeted runs)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned
