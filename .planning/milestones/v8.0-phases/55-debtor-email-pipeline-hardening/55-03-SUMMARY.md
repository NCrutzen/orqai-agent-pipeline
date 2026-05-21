---
phase: 55-debtor-email-pipeline-hardening
plan: 03
status: superseded
landed_at: docs/agentic-pipeline/README.md (Phase 69 handler-canonicalisation)
---

Superseded by Phase 69. Centralised `icontroller_drafts` table + `drafts-repository.ts` + HTML-comment marker pattern was obsoleted: Stage-4 handlers now manage their own per-handler idempotency keys. No `icontroller_drafts` migration shipped. See `55-CLOSURE.md`.
