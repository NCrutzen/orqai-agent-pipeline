---
phase: 55
slug: debtor-email-pipeline-hardening
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-24
updated: 2026-04-24
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Plan 01 Task 2 scaffolds `web/vitest.config.ts` if missing) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run <path>` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run <test-file-touched>`
- **After every plan wave:** Run `cd web && npm test && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite + tsc must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-T1 | 01 | 0 | schema migrations | migration | `psql "$SUPABASE_DB_URL" -c "select table_schema, table_name from information_schema.tables where table_name in ('agent_runs','icontroller_drafts','labeling_settings') order by 1,2;"` | ⬜ (created in task) | ⬜ pending |
| 55-01-T2 | 01 | 0 | test scaffolding | unit | `cd web && npx vitest run` | ⬜ (created in task) | ⬜ pending |
| 55-02-T1 | 02 | 1 | REQ-55-a (cleanup-worker + EmailIdentifiers) | unit | `cd web && npx vitest run web/lib/inngest/__tests__/cleanup-worker-multi-mailbox.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-02-T2 | 02 | 1 | REQ-55-a (catchup + review-actions + ingest) | unit | `cd web && npx vitest run web/lib/debtor-email/__tests__/catchup-multi-mailbox.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-03-T1 | 03 | 2 | REQ-55-b-idempotency + marker | unit | `cd web && npx vitest run web/lib/automations/icontroller/__tests__/drafts-idempotency.test.ts web/lib/automations/icontroller/__tests__/draft-marker.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-03-T2 | 03 | 2 | REQ-55-b-reconcile | unit | `cd web && npx vitest run web/lib/automations/icontroller/__tests__/drafts-reconcile.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-04-T1 | 04 | 1 | REQ-55-c-provenance + hygiene | unit+component | `cd web && npx vitest run web/lib/automations/swarm-bridge/__tests__/provenance-chips.test.ts web/components/v7/kanban/__tests__/kanban-job-card.test.tsx` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-04-T2 | 04 | 1 | REQ-55-c-verdict-route + REQ-55-d-verdict-UI | integration | `cd web && npx vitest run "web/app/(dashboard)/automations/review/[runId]/__tests__/review-page.test.tsx" web/app/api/automations/debtor/verdict/__tests__/route.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |
| 55-05-T1 | 05 | 2 | REQ-55-d-swarm-type + git-sha | unit | `cd web && npx vitest run web/lib/inngest/functions/__tests__/debtor-agent-run-write.test.ts` | ✅ (stub in Plan 01) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (Plan 55-01)

- [x] `web/vitest.config.ts` created/verified (Task 2)
- [x] `web/lib/__tests__/fixtures/phase55.ts` shared factories (Task 2)
- [x] Test stub files (10) with `it.todo(...)` placeholders wired to downstream plan+task (Task 2)
- [x] Three migrations written + applied: public.agent_runs + icontroller_drafts + labeling_settings.icontroller_mailbox_id (Task 1)
- [x] TS `ICONTROLLER_MAILBOXES` map synced with correct `.be` TLDs + firecontrol=12 added (Task 1)

*If any Wave 0 item fails, Waves 1 cannot start — all 4 parallel plans depend on Plan 01.*

---

## Manual-Only Verifications (phase-gate)

| Behavior | Plan | Why Manual | Test Instructions |
|----------|------|------------|-------------------|
| Zapier whitelist intra-company forward | 04 | Zap config lives in Zapier UI, not repo | Trigger forward from company A → company B mailbox; confirm Zap fires only for whitelisted pair; confirm `forward:intra-company` chip appears on resulting card |
| iController draft creation with HTML-comment marker | 03 | Requires live iController session | Run create-draft against acceptance credentials with an agent_run_id; inspect draft HTML source for `<!-- MR-AUTOMATION-DRAFT v1 run=<uuid> do-not-edit-above -->` marker |
| Idempotent second create-draft call | 03 | Requires acceptance iController + fresh messageId | Call create-draft twice with same (graph_message_id, entity); expect second response `{skipped: "already_drafted"}` within 1s (no Browserless) |
| 👍/👎 verdict-UI on `/automations/review/[runId]` | 04 | Visual/interaction check | Load route for a real runId, click verdict, confirm row updated in `public.agent_runs` with verdict_set_at + verdict_set_by |
| Multi-mailbox cleanup-worker against Smeba-Fire (mailbox_id=5) | 02 | Requires live Smeba-Fire ingest + acceptance iController credentials | Queue a pending automation_run with icontroller_mailbox_id=5; trigger cleanup-worker; confirm screenshots land under `delete-5` (not `delete-smebabrandbeveiliging`) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (10 tasks, all automated)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (10 test stub files created in Plan 01)
- [x] No watch-mode flags (all `vitest run`)
- [x] Feedback latency < 60s (vitest ~30s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-ready; pending execution.
