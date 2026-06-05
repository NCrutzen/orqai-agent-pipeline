---
phase: 113
slug: stage-3-sales-intent-agent-greenfield
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <affected test files>` |
| **Full suite command** | `cd web && npx vitest run --silent` |
| **Estimated runtime** | ~80 seconds (full suite, 2529 tests) |

---

## Sampling Rate

- **After every task commit:** Run the affected test files via `npx vitest run <paths>`
- **After every plan wave:** Run the full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner per plan/task breakdown) | | | STAGE3-01/02/03 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Filled by planner from RESEARCH.md §Validation Architecture (sales invoke-intent unit tests, retro-classify worker tests, swarm_intents seed migration checks, codegen drift gate)

*Existing infrastructure (vitest + codegen drift gate + no-engine-diff-check.sh) covers the harness; new test files accompany new modules.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Stage 3 verdict on real sales mail end-to-end (Orq call) | STAGE3-03 | Requires deployed worker + live Orq agent | Trigger a Stage-1-surviving sales mail; confirm verdict row + Kanban human-lane entry |
| Operator promotion flow on discovery surface | STAGE3-02 | Human-in-the-loop by design | Promote a proposed intent; confirm swarm_intents row + codegen + agent enum update path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
