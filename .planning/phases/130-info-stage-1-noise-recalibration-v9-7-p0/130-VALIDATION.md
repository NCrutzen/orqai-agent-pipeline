---
phase: 130
slug: info-stage-1-noise-recalibration-v9-7-p0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-16
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | {vitest / node test — confirm at plan time from web/} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{quick command}` |
| **Full suite command** | `{full command}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 0 | NOISE-02 | — | info-routing agent_runs INSERT succeeds (no 23514) | integration | `{command}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Planner fills this map. Key validation anchors from RESEARCH.md:
> - **Wave 0 / NOISE-02:** a successful `agent_runs` INSERT for `swarm_type='info-routing'` (the CHECK-constraint unblock) — this gates every downstream task.
> - **NOISE-03:** before/after "unknown" pool true-noise share per mailbox from `pipeline_events` (needs a labelled baseline sample).
> - **NOISE-04:** actionable-token carve-out + word-boundary matching verified on a sample (zero false-archive).

---

## Wave 0 Requirements

- [ ] Widen `public.agent_runs.swarm_type` CHECK to include `info-routing` (migration) — unblocks all shadow telemetry.
- [ ] Verify a live `agent_runs` INSERT for `swarm_type='info-routing'` returns no `23514` violation.

*Planner expands per task map.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Baseline true-noise labelling of "unknown" pool sample | NOISE-03 | Human judgement of noise-vs-routable on a sample | Label sample, compute noise fraction + CI per mailbox |

*Planner refines.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
