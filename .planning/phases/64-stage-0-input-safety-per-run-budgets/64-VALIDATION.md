---
phase: 64
slug: stage-0-input-safety-per-run-budgets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) — to be confirmed by planner |
| **Config file** | web/vitest.config.ts (or "none — Wave 0 installs" if missing) |
| **Quick run command** | `cd web && npx vitest run --reporter=dot` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30 seconds (TBD) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Filled in by planner during PLAN.md creation. One row per task with `<automated>` verify or Wave 0 dependency.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | SAFE-01..04, BUDG-01..03 | TBD | TBD | unit/integration | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Planner fills in. Likely candidates from RESEARCH:*

- [ ] vitest config + first test file under `web/lib/stage-0/`
- [ ] Test fixtures: sample injection-pattern emails (Dutch + English)
- [ ] Mock `automation_runs` row + `swarm_categories.key` fixture
- [ ] Wave 0 probe: confirm `claude-haiku-4-5` available in Orq.ai Router (assumption A2 from RESEARCH)
- [ ] Wave 0 probe: query last 30 days of `automation_runs.result.cost_cents` to validate ceiling defaults (assumption A3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator sees injection-flagged email in Bulk Review with trigger pattern surfaced | SAFE-02 | UI rendering + operator workflow | Trigger Stage 0 with seed regex pattern; open `/automations/debtor-email/review`; confirm "Safety Review" tab shows row with regex hit visible |
| Cost outlier appears as override axis | BUDG-03 | Requires real or seeded historical cost data for median | Run pipeline 10× with normal cost, then 1× synthetic 4× cost; confirm outlier surfaces as own override axis in Bulk Review |
| Budget breach routes to human queue (not retry storm) | BUDG-01 | Inngest event-vs-exception is observable end-to-end only | Set ceiling to 1¢; trigger pipeline; confirm single `pipeline/budget_breached` event, no retries, run lands in human queue with breach reason |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
