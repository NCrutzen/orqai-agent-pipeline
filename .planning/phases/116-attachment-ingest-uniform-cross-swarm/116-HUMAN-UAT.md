---
status: partial
phase: 116-attachment-ingest-uniform-cross-swarm
source: [116-VERIFICATION.md]
started: 2026-06-05T10:45:00Z
updated: 2026-06-05T10:45:00Z
---

## Current Test

[awaiting human testing — all items gated on the Phase 116 code deploy to Vercel]

## Tests

### 1. Corpus backfill live run (post-deploy)
expected: Bounded dry-run (`{ dry_run: true, limit: 50 }`) → bounded live (`{ limit: 50 }`, idempotent on re-run) → full run over the 1,273-mail corpus completes without unexpected fail-loud cap; survivor mails get `extraction_status='extracted'` with non-empty text, non-survivors metadata only; Bulk Review Stage 2 Read column shows the AttachmentList for a backfilled email. Runbook: `.planning/todos/pending/2026-06-05-apply-20260605c-after-deploy.md`
result: [pending]

### 2. Apply 20260605c + live funnel routing (post-deploy)
expected: After deploy (Inngest shows `stage-1_5-attachment-extractor` registered), apply `20260605c_sales_unknown_dispatch_to_extractor.sql` to remote; a live sales `unknown` mail routes Stage 1 → extractor → Stage 2; `swarm_dispatch` for sales/unknown reads `sales-email/attachments.extract.requested`.
result: [pending]

### 3. Bulk Review attachment display after RLS tightening
expected: Migration `20260605d` is ALREADY APPLIED (2026-06-05, verified: only service_role policy on base table; `email_attachments_meta` view exists; advisor 0 ERROR). Post-deploy: confirm the Bulk Review Stage 2 Read attachment list renders normally (it reads server-side via service_role, so no impact expected).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
