---
phase: 111
slug: stage-1-noise-expansion-calibration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 111 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <changed test file>` |
| **Full suite command** | `cd web && npx vitest run lib/inngest lib/classifier` |
| **Estimated runtime** | ~30–90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command on the touched test file
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

*Populated by the planner during PLAN.md authoring (one row per task). Skeleton:*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 111-01-01 | 01 | 1 | STAGE1-01 | — | gate generalization preserves debtor behavior | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Planner-defined. Likely RED contracts for the two critical findings:*
- [ ] RED test: `classifier-verdict-worker` does NOT fire live Outlook archive for sales when `stage_1_archive` is dry-run-blocked (CRITICAL FINDING 1).
- [ ] RED test: the auto-archive promotion gate (`gateClearsForAutoArchive` / Wilson) applies to the swarm-agnostic path, not only `@/lib/debtor-email/classify` (CRITICAL FINDING 2).
- [ ] RED test: debtor Stage 1 behavior provably unchanged after gate generalization (regression net).

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator approval of mined noise-rule candidates | STAGE1-02 | Human judgment on which clusters are genuinely noise | Run the cluster-mining script; review the ranked candidate list; approve subset |
| Live promotion of an `llm:*:high` rule after organic telemetry | STAGE1-01 | Requires accumulated operator feedback (n≥30) post-deploy | Wilson-CI shadow report identifies ≥1 `shadow_would_promote`; verify post `CLASSIFIER_CRON_MUTATE=true` |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
