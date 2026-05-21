---
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
status: phase-shipped-pending-uat-2-6
date: 2026-05-06
---

# Phase 71 — Handoff

## State

Phase 71 (4-axis Bulk Review + capability/regression eval split) is **shipped to production**. Verified end-to-end on `agent-workforce-eosin.vercel.app`. Code-complete with one operator UAT pass; UAT 2-6 remain.

## What landed (5 plans + 4 follow-up fixes)

| Plan | Scope |
|------|-------|
| 71-01 | Wave 0: `pipeline_events_email_summary` view, `OverrideAxis` types, shadcn primitives, brand-color helper, override-event fixtures |
| 71-02 | POST `/api/automations/debtor-email/override` + `debtor-email-override-handler` Inngest fan-out |
| 71-03 | `loadPageData` rewired to view; per-stage timeline still on raw `pipeline_events` |
| 71-04 | 11 new UI components (PipelineFlow, StageWidgets 1-4, EvalTypeRadio, OverrideConfirmDialog, IControllerInfoBanner) |
| 71-05 | Wired components into `detail-pane.tsx`, `row-list.tsx`, `page.tsx`, `keyboard-shortcuts.tsx` |
| 71-06 | Resolve `email_id` at Stage 1 ingest emit (SELECT-or-INSERT `email_pipeline.emails`) |
| 71-07 | Detail-pane fixes: full-width, body default-open, stage widgets always offer override, legacy "Set rule" form removed, `fetchReviewEmailBody` reads `email_pipeline.emails` first |
| 71-08 | View extended with subject/sender/recipient_mailbox; predicted-only filter; row-list filter mapping; bulk body preload; Outlook fallback (concurrency=8, persists) |
| 71-09 | `debtor-email-override-handler` axis-1 payload shape fix — sends verdict-worker the right keys |

## Verified working

- ✓ Override `b6a8d6fd` (Stage 1 → payment_admittance, regression) at 04:12:42 UTC produced `4eaf1f33` (icontroller_delete, status=deferred = waiting on async, by-design) at 04:12:51 UTC
- ✓ Mailbox config: `debiteuren@smeba.nl` has `icontroller_company='smebabrandbeveiliging'`. Other 4 mailboxes (berki, sicli-noord, sicli-sud, smeba-fire) have `icontroller_company=NULL` (intentionally not iController-integrated)

## Open items for next session

### UAT 2-6 (operator smoke, non-blocking)
- **UAT 2** Stage 2 customer override + re-run=ON
- **UAT 3** Stage 3 intent override
- **UAT 4** Stage 4 handler-output override + iController banner
- **UAT 5** Two-tab realtime sync
- **UAT 6** Submit-bar disable during in-flight POST

### Cosmetic / cleanup
- Sidebar duplicate "smeba" / "Smeba" buckets (case-inconsistent `automation_runs.topic`)
- Sidebar leaks numeric `mailbox 171` into entity tree
- 2 Phase 69 smoke-test rows (`triggered_by='phase69-smoke-curl-2'`, topic=`3949cc35-…`) safe to delete from `automation_runs`
- Empty body for historical Outlook-404 emails — degrade gracefully

### Stage-2 search source conflict
71-04 shipped option (a) `coordinator_runs DISTINCT`; 71-01 D-09 selected (b) Live NXT-via-Zapier. If D-09 is hard-locked, ship a NXT name-fragment Zap + `zapier_tools` registry row.

## Key files

- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` — server-side data load, body preload, Outlook fallback
- `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` — 4-axis override UI, body cache seeding
- `web/app/api/automations/debtor-email/override/route.ts` — POST endpoint, validates and dispatches
- `web/lib/inngest/functions/debtor-email-override-handler.ts` — per-axis fan-out (71-02 + 71-09)
- `web/app/api/automations/debtor-email/ingest/route.ts:286-365` — Stage 1 emit with email_id resolution (71-06)
- `supabase/migrations/20260507a_pipeline_events_email_summary.sql` — original view
- `supabase/migrations/20260507b_pipeline_events_email_summary_v2_email_meta.sql` — view + email metadata join

## Recent commit log (this phase)

```
e1c9dbe fix(71-08): batch Outlook fallback for all rows
052a5ec fix(71-08): show recipient_mailbox in detail pane; diag Outlook fallback
9bb88e1 fix(71-08): Outlook fallback for selected row
dd2f6cc fix(71-08): preload bodies for all rows
14cbcd3 fix(71-08): preload selected email body server-side
8564516 fix(71-08): bulk review filter mapping (?topic→decision, ?rule→regex_rule_id)
f00f143 fix(71-08): in-memory filter instead of .in(uuids[])
16c3ee5 fix(71-08+09): bulk review predicted filter, email metadata, override side-effects
da87e15 fix(71-06): resolve email_id at Stage 1 ingest emit
fd09e4f chore: untrack .claude/worktrees and node_modules
3c41e0d fix(71-07): finish Bulk Review wiring after Plan 05
9b4a4fe fix(71): remove duplicate OverrideAxis/OverrideJson from auto-merge
e7c1e36 chore: merge executor worktree (71-05 wire bulk review surfaces)
aef74cb chore: merge executor worktree (71-03 feed rewire)
7d2eea5 chore: merge executor worktree (71-02 override write path)
23b0a1d chore: merge executor worktree (71-01 foundation)
fe0e44b docs(71-04): complete bulk-review-ui-components plan
```

## To resume

1. `cd /Users/nickcrutzen/Developer/agent-workforce`
2. Read `.planning/phases/71-bulk-review-4-axis-redesign-capability-regression-eval-split/71-HUMAN-UAT.md` for the UAT smoke list
3. Read `71-VERIFICATION.md` for the original verifier output
4. Refresh production Bulk Review and smoke UAT 2 next
