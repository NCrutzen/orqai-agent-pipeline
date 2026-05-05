---
status: partial
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
source: [71-VERIFICATION.md]
started: 2026-05-05T11:23:02Z
updated: 2026-05-05T11:23:02Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Stage 1 override smoke (capability + regression)
expected: Submit category override on acceptance Bulk Review. Verify a new `pipeline_events` row lands with `axis='stage_1_category'`, the chosen `eval_type ∈ {capability,regression}`, and `triggered_by='operator-override'`. Original verdict preserved as audit. (REVW-01)
result: [pending]

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
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

(none — operator action items only)

## Known Deferrals (candidates for Plan 71-06)

- View extension `pipeline_events_email_summary.recipient_mailbox` + `entity_brand` columns to populate RecipientChipStrip and the full PredictedRow chrome (currently inline simplified strip).
- Stage-2 customer-search source: ship a NXT name-fragment Zap + `zapier_tools` registry row to honor 71-01 D-09's option (b) Live NXT-via-Zapier. Current shipped code uses option (a) coordinator_runs DISTINCT.
