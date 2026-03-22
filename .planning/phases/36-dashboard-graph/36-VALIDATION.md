---
phase: 36
slug: dashboard-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.x |
| **Config file** | web/vitest.config.ts (needs verification) |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | DASH-01 | unit | `npx vitest run tests/broadcast.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | DASH-02 | unit | `npx vitest run tests/step-log-panel.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-01-03 | 01 | 1 | DASH-03 | unit | `npx vitest run tests/step-log-panel.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-01-04 | 01 | 1 | DASH-04 | unit | `npx vitest run tests/run-list-live.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | GRAPH-01 | unit | `npx vitest run tests/swarm-graph.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 1 | GRAPH-02 | unit | `npx vitest run tests/agent-node.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-03 | 02 | 1 | GRAPH-03 | unit | `npx vitest run tests/swarm-graph.test.ts -x` | ❌ W0 | ⬜ pending |
| 36-02-04 | 02 | 1 | GRAPH-04 | unit | `npx vitest run tests/agent-node.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/tests/broadcast.test.ts` — stubs for DASH-01 (broadcast events trigger UI updates)
- [ ] `web/tests/step-log-panel.test.ts` — stubs for DASH-02, DASH-03 (step descriptions, timeline state indicators)
- [ ] `web/tests/run-list-live.test.ts` — stubs for DASH-04 (run list live updates)
- [ ] `web/tests/swarm-graph.test.ts` — stubs for GRAPH-01, GRAPH-03 (React Flow render, node status updates)
- [ ] `web/tests/agent-node.test.ts` — stubs for GRAPH-02, GRAPH-04 (agent node display, score rendering)
- [ ] Verify vitest config exists at `web/vitest.config.ts` and runs

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time Broadcast updates visible without refresh | DASH-01 | Requires live Supabase Broadcast connection | 1. Start pipeline run 2. Observe step status updates appear without page refresh |
| Confetti celebration animation | DASH-01 | Visual animation quality | 1. Complete a pipeline run 2. Verify confetti fires with summary stats |
| Node entrance animation | GRAPH-03 | Visual animation timing | 1. Start pipeline run 2. Watch graph nodes appear progressively |
| Zoom/pan/drag interactivity | GRAPH-01 | Browser interaction | 1. Open graph 2. Scroll to zoom, drag to pan, drag nodes to rearrange |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
