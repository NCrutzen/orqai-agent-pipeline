---
status: partial
phase: 132-forward-side-effect-bulk-review-v9-7-p2
source: [132-VERIFICATION.md]
started: 2026-06-18
updated: 2026-06-18
---

## Current Test

[awaiting human testing — these are live/operational checks, deferred until a bucket is released and live pipeline data exists]

## Tests

### 1. Bulk Review routing pane renders with live data
expected: With a real info-routing pipeline run that produced `coordinator_runs.decision_details.routing`, the info-routing Bulk Review surface renders the RoutingDetailPane (6 verdict fields + forward-status badge + controls). RTL tests cover the logic; this confirms live hydration.
result: [pending]

### 2. End-to-end forward smoke (after releasing one bucket)
expected: Release a single bucket (one-line jsonb UPDATE of `stage_4_forward_buckets.<bucket>=true`), send a test email that resolves to that bucket, and verify: forward delivered to the department mailbox, the forward comment contains the original sender, the routing category is stamped on the source mail, `info_routing_forwards.status='sent'`, and a replay does NOT double-send (D-02 idempotency).
result: [pending]

### 3. Operator re-route action (live authenticated session)
expected: In a live authenticated Bulk Review session, `rerouteBucket` writes a new `operator_sourced:true` routing verdict to the DB for the selected row.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
