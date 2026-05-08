---
phase: 80
slug: swarm-agnostic-stage-3-classifier-dispatcher-split-predicted
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30s quick / ~3 min full |

---

## Sampling Rate

- **After every task commit:** Run quick (classifier + dispatcher tests)
- **After every plan wave:** Run full suite (catches cross-file regressions in swarm-bridge/sync.ts, escalation-gate.ts)
- **Before `/gsd-verify-work`:** Full suite must be green AND backfill script must run successfully against acceptance creds
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Filled in by planner — each task gets a row mapping to automated test command.*

| Task ID | Plan | Wave | Requirement / must_have | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------------------|-----------|-------------------|-------------|--------|
| 80-XX-XX | XX | N | must_have N | unit / integration | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` — RED test scaffolds for placeholder-route, registered-route, idempotency, replay-safety
- [ ] `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — assertion that classifier no longer dispatches inline (negative test on Kanban INSERT) + asserts status flip to `predicted` + emits `<swarm>/predicted`
- [ ] `web/lib/inngest/functions/__tests__/fixtures/stage-3-dispatcher-events.ts` — synthetic `<swarm>/predicted` event fixtures for each `handler_status` branch
- [ ] `web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` — RED test for idempotency, dry-run, status-precondition guard

---

## Manual-Only Verifications

| Behavior | must_have | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Live `<swarm>/predicted` event flow on acceptance | must_have #3 | Inngest dashboard observation; not assertable inside vitest | After deploy to acceptance: send fixture email, watch Inngest dashboard for classifier→dispatcher event chain, verify in <60s |
| Backfill script behavior on production-shaped data | must_have #2 | 407 rows live in production; dry-run on prod, manual review of report before live run | Run with `--dry-run` against prod creds; review row report; require explicit `--confirm-prod` to execute |
| `coordinator-orchestrator.ts` defensive seam still works | must_have #5 | Dormant code path; not exercised in unit tests | Manual code review during plan-checker pass: confirm `if (intentRow.handler_status === "placeholder")` branch (lines 93–123) is unchanged and reachable if `debtor-email/orchestrator.requested` is re-emitted |
| Sales-email cross-swarm compatibility | must_have #6 | Phase 78 owns sales-email registry; verified via integration test using a synthetic test swarm with populated `swarm_intents` rows | Integration test inserts a `swarm_type='test-swarm'` row with both `placeholder` and `registered` intents; full pipeline traversal verified end-to-end |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
