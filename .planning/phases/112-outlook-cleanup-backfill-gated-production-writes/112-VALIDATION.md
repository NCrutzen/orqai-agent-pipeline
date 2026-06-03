---
phase: 112
slug: outlook-cleanup-backfill-gated-production-writes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 112 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <changed test file>` |
| **Full suite command** | `cd web && npx vitest run lib/inngest lib/automations/sales-email lib/swarms lib/outlook` |
| **Estimated runtime** | ~30–90 seconds |

---

## Sampling Rate

- **After every task commit:** quick command on the touched test file
- **After every plan wave:** full suite command
- **Before `/gsd:verify-work`:** full suite green + `npm run check:supabase` 0 ERROR
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

*Populated by the planner. Skeleton (key behaviors to pin):*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 112-0X | — | 1 | CLEANUP-02 | — | backfill re-run produces ZERO duplicate archives (pipeline_events ledger no-op) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-email-stage-1-backfill.test.ts` | ⬜ pending |
| 112-0X | — | 1 | CLEANUP-02 | — | auto-set excludes loopback + payment_admittance + unknown; loopback skipped entirely | unit | `cd web && npx vitest run lib/automations/sales-email/__tests__/backfill-disposition.test.ts` | ⬜ pending |
| 112-0X | — | 1 | CLEANUP-02 | — | archive call resolves Graph id (source_id), not internet_message_id (Pitfall 4) | unit | (same backfill suite) | ⬜ pending |
| 112-0X | — | 1 | CLEANUP-02 | — | mode='report' dry-run writes NO live archive + NO ledger row | unit | (same backfill suite) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Planner-defined. Likely RED contracts:*
- [ ] RED: backfill idempotency — second run over the same corpus archives nothing new (ledger dedup).
- [ ] RED: backfill disposition — auto-set = {7 non-loopback AP keys + 3 flipped safe keys}; loopback skipped; ambiguous → predicted/Bulk-Review.
- [ ] RED: Graph-id resolution — `archiveEmail` receives `emails.source_id`, not `internet_message_id`.
- [ ] RED: `mode='report'` dry-run performs no live Graph write and no ledger insert.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| **[BLOCKING] go-live flip** | CLEANUP-01 | Flips live customer-mail archiving; human pulls the trigger (D-02) | Operator reviews canary results in verkoop@smeba.nl, then approves the `stage_1_archive=false` migration apply via MCP |
| Canary batch inspection | CLEANUP-01 | Requires eyeballing real archived mail | After canary, confirm only intended noise left the inbox; no false-archives |
| Graph already-archived no-op (A1) | CLEANUP-02 | Live Graph behavior unverifiable offline | Canary: re-run a just-archived message; confirm no error / no duplicate |
| Bulk Review renders backfill predicted rows (A5) | CLEANUP-02 | UI surface check | Confirm ambiguous backfill matches appear in the Stage-1 Bulk Review lane |

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
