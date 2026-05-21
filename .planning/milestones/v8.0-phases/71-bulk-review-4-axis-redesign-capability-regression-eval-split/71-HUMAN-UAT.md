---
status: partial
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
source: [71-VERIFICATION.md]
started: 2026-05-05T11:23:02Z
updated: 2026-05-06T04:30:00Z
---

## Current Test

[UAT 1 passed; UAT 2-6 pending operator smoke]

## Tests

### 1. Stage 1 override smoke (capability + regression)
expected: Submit category override on acceptance Bulk Review. Verify a new `pipeline_events` row lands with `axis='stage_1_category'`, the chosen `eval_type ∈ {capability,regression}`, and `triggered_by='operator-override'`. Original verdict preserved as audit. (REVW-01)
result: passed (2026-05-06)
  - override row `b6a8d6fd-78c4-4006-987e-b646290eec31` (axis=stage_1_category, decision=payment_admittance, eval=regression) at 04:12:42
  - verdict-worker dispatched `4eaf1f33-fa86-40a2-82d7-26ca15e9b936` (stage=icontroller_delete, status=deferred — by-design async pending) at 04:12:51
  - mailbox `debiteuren@smeba.nl` has `icontroller_company='smebabrandbeveiliging'` set; other 4 mailboxes intentionally have `icontroller_company=NULL`

### 2. Stage 2 override with re-run=ON smoke
expected: Submit Stage-2 customer correction with re-run toggle ON. Verify a `coordinator-complete` dispatch fires and downstream Stage 3 + Stage 4 `pipeline_events` rows arrive within ~5s. With re-run=OFF, only the Stage 2 override row appears. (REVW-02)
result: [pending]

### 3. Stage 3 override smoke
expected: Submit Stage-3 intent override. Verify `debtor-email/<intent>.requested` event appears in Inngest dashboard with the corrected intent, and downstream Stage 4 row reflects re-handling. (REVW-03)
result: [pending]

### 4. Stage 4 override + iController banner smoke
expected: Submit Stage-4 handler-output override. Verify emit-only behavior (no new Stage 3 / Stage 4 dispatch), `draft_quality` + reason persist on the override row, and `IControllerInfoBanner` is visible during the override. (REVW-04)
result: [pending]

### 5. Realtime two-tab smoke
expected: Open Bulk Review in two browser tabs (A and B). Submit any override in tab A. Within 2s the corresponding row update / new event timeline entry appears in tab B without manual reload. (REVW-06 freshness contract)
result: [pending]

### 6. Submit-bar disable smoke
expected: While a POST `/api/automations/debtor-email/override` is in flight, the submit button is disabled and shows the in-flight state. Re-enables after response (success OR error). No double-submit possible. (REVW-05 audit integrity)
result: [pending]

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(none — operator action items only)

## Known Deferrals

- **Resolved by Plan 71-06**: email_id resolution at Stage 1 emit (SELECT-or-INSERT into email_pipeline.emails).
- **Resolved by Plan 71-07**: detail-pane wiring (fetchReviewEmailBody fallback, body default-open, full-width layout, legacy "Set rule" form removed, stage widgets render override controls when stage didn't run).
- **Resolved by Plan 71-08**: pipeline_events_email_summary view extended with subject/sender/recipient_mailbox/email_received_at; predicted-only filter so auto-actioned emails don't pollute the queue; row-list filter mapping (?topic→decision, ?rule→regex_rule_id); preload bodies for all rows; Outlook fallback for empty bodies (concurrency=8, persists for next time).
- **Resolved by Plan 71-09**: debtor-email-override-handler axis-1 payload shape now matches classifier-verdict-worker (sends automation_run_id, swarm_type, message_id, source_mailbox, predicted_category, override_category) — verified end-to-end via UAT 1.

### Still open (cosmetic / non-blocking)

- Sidebar QueueByTopic shows "smeba" + "Smeba" duplicate buckets (case-inconsistent topic values somewhere upstream).
- Sidebar shows "mailbox 171" — a numeric mailbox_id leaking into the entity tree.
- A handful of historical emails return empty bodies because Outlook 404s them (likely archived). Operators see metadata; body silently empty.
- 2 Phase 69 smoke-test rows (`triggered_by='phase69-smoke-curl-2'`, topic=UUID `3949cc35-…`) clutter the sidebar with no real action — safe to delete from `automation_runs` whenever convenient.
- Stage-2 customer-search source: 71-04 shipped option (a) `coordinator_runs DISTINCT`; 71-01 D-09 selected (b) Live NXT-via-Zapier. If D-09 is hard-locked, ship a NXT name-fragment Zap + `zapier_tools` registry row.
