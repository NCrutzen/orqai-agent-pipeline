---
phase: 36
slug: dashboard-graph
status: draft
nyquist_compliant: true
wave_0_complete: false
wave_0_planned: true
created: 2026-03-22
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.x |
| **Config file** | web/vitest.config.ts (updated in Plan 00 for jsdom + React) |
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
| 36-00-01 | 00 | 1 | ALL | infra | `npx vitest run lib/pipeline/__tests__/stages.test.ts -x` | Y (existing) | ⬜ pending |
| 36-00-02 | 00 | 1 | ALL | stubs | `npx vitest run --reporter=verbose` (all stubs pending) | W0 creates | ⬜ pending |
| 36-01-01 | 01 | 2 | DASH-01 | unit | `npx vitest run lib/supabase/__tests__/broadcast.test.ts -x` | W0 creates | ⬜ pending |
| 36-01-02 | 01 | 2 | DASH-02,03 | unit | `npx vitest run lib/pipeline/__tests__/graph-mapper.test.ts -x` | W0 creates | ⬜ pending |
| 36-02-01 | 02 | 3 | GRAPH-02,04 | unit | `npx vitest run components/graph/__tests__/agent-node.test.ts -x` | W0 creates | ⬜ pending |
| 36-02-02 | 02 | 3 | GRAPH-01,03 | unit | `npx vitest run components/graph/__tests__/swarm-graph.test.ts -x` | W0 creates | ⬜ pending |
| 36-03-01 | 03 | 4 | DASH-04 | unit | `npx vitest run components/dashboard/__tests__/run-list-live.test.ts -x` | W0 creates | ⬜ pending |
| 36-03-02 | 03 | 4 | ALL | e2e | Human checkpoint (14 verification steps) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (Plan 36-00)

- [ ] Verify vitest config exists at `web/vitest.config.ts` and supports jsdom + React plugin
- [ ] Install `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`
- [ ] Create `web/test-setup.ts` with jest-dom matcher registration
- [ ] `web/lib/supabase/__tests__/broadcast.test.ts` — stubs for DASH-01 (broadcast events trigger UI updates)
- [ ] `web/lib/pipeline/__tests__/graph-mapper.test.ts` — stubs for DASH-02, DASH-03 (graph data transformation)
- [ ] `web/components/graph/__tests__/agent-node.test.ts` — stubs for GRAPH-02, GRAPH-04 (agent node display, score rendering)
- [ ] `web/components/graph/__tests__/swarm-graph.test.ts` — stubs for GRAPH-01, GRAPH-03 (React Flow render, node status updates)
- [ ] `web/components/dashboard/__tests__/run-list-live.test.ts` — stubs for DASH-04 (run list live updates)
- [ ] Existing `lib/pipeline/__tests__/stages.test.ts` continues to pass

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 36-00 creates all 5 test files)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution of Plan 36-00
