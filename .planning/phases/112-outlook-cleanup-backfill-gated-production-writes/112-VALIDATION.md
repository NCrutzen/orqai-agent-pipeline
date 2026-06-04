---
phase: 112
slug: outlook-cleanup-backfill-gated-production-writes
status: planned
nyquist_compliant: true
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
| 112-01-T1 | 01 | 1 | CLEANUP-02 | T-112-01/02/04 | auto-set registry-derived excludes loopback + payment_admittance + unknown; loopback → 'skip'; Graph-id source_id resolution | unit | `cd web && npx vitest run lib/automations/sales-email/backfill/__tests__/disposition.test.ts` | ⬜ pending |
| 112-01-T2 | 01 | 1 | CLEANUP-02 | T-112-03/04/05 | backfill re-run ZERO duplicate archives (ledger no-op + already-archived); report mode writes nothing; archive uses source_id; replay-safe runId | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-email-stage-1-backfill.test.ts` | ⬜ pending |
| 112-02-T1 | 02 | 1 | CLEANUP-01 | T-112-08/10 | flip sets exactly stage_1_archive=false for sales via jsonb_set; no sibling clobber; sales-scoped; APPLY NOTE present | unit (SQL-assert) | `cd web && npx vitest run lib/swarms/__tests__/sales-stage1-archive-golive.test.ts` | ⬜ pending |
| 112-02-T2 | 02 | 1 | CLEANUP-01 | T-112-11 | inline archive fires Outlook archive + Stage-4 telemetry iff stage_1_archive=false (blocked → 0 archive, 0 emit) | unit (extend) | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` | ⬜ pending |
| 112-03-T1 | 03 | 2 | CLEANUP-02 | T-112-07/12 | report-mode dry-run produces counts and writes nothing live | human-check | (report-mode run; zero new stage=4 / automation_runs) | ⬜ pending |
| 112-03-T2 | 03 | 2 | CLEANUP-01/02 | T-112-12/13 | canary archives only intended noise; idempotent live re-run (0 new, 0 errors) | manual (canary) | operator inspects verkoop@smeba.nl Archive | ⬜ pending |
| 112-03-T3 | 03 | 2 | CLEANUP-01 | T-112-14/15/16 | flip applied via MCP only after approval; sales stage_1_archive=false; siblings + debtor intact; check:supabase 0 ERROR | manual ([BLOCKING] apply) | live swarms query + `npm run check:supabase` | ⬜ pending |

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
