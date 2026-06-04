---
phase: 116
slug: attachment-ingest-uniform-cross-swarm
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 116 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (repo standard, `web/`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --changed` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --changed`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | — | — | ATTACH-* | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Engine no-diff guard (STAGE2-01) must remain runnable: `npm run check:engine-diff` (or existing guard script) green before and after.
- [ ] If none beyond existing: "Existing infrastructure covers all phase requirements."

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backfill over live corpus (Graph reads) | ATTACH-backfill | External system, gated write pattern (Phase 112) | Dry-run on bounded slice, inspect counts, then gated full run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
