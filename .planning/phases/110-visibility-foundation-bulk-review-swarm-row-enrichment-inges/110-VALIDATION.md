---
phase: 110
slug: visibility-foundation-bulk-review-swarm-row-enrichment-inges
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 110 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run --changed` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~TBD (planner to confirm from existing suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --changed`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + `npm run codegen && git diff --exit-code` clean + `npm run check:supabase` green
- **Max feedback latency:** TBD

---

## Per-Task Verification Map

> Populated by the planner. Each task must map to a requirement (REVIEW-01 / SWARM-01 / SWARM-02 / VERIFY-01) and an automated command. The highest-risk tasks (coordinator SWARM_TYPE refactor, per-stage dry-run replacing the debtor boolean) MUST carry a debtor-regression test command, per CONTEXT D-09.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | SWARM-02 | — | debtor Stage-3 coordinator behavior unchanged after swarm_type generalization | unit | `cd web && npx vitest run <coordinator-test>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] A debtor Stage-3 coordinator regression test that pins current behavior BEFORE the `SWARM_TYPE` generalization (D-07/D-09 — highest-risk change).
- [ ] A SWARM-02 static grep gate asserting no `swarm_type === '<name>'` conditional branches in shared workers (extends the existing `classifier-screen-worker.test.ts` guard to coordinator + dispatcher).
- [ ] A codegen drift test (`npm run codegen && git diff --exit-code`) covering the generalized entity/intent generators.
- [ ] A per-stage dry-run preservation test pinning debtor's current effective gating (Stage 1 cleanup live, intent labeling gated — the Phase 82.8 reality).

*Planner refines this list against RESEARCH.md §Validation Architecture.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sales Bulk Review surface renders rows + detail pane + per-stage tabs + feedback form for sales-email | REVIEW-01 | UI surface rendering against live ingested corpus; visual confirmation | Open `/automations/sales-email/review`, confirm rows load (not 404, not empty), detail pane shows Stage 0–3 evidence, feedback form renders |
| ~33/day throughput for verkoop@smeba.nl visible in pipeline-health monitor | VERIFY-01 | Depends on live ingest cadence + monitor cron tick | Inspect `pipeline_health_snapshots` per-mailbox rows for sales-email / verkoop@smeba.nl |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
