---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 01
subsystem: data-foundation
tags: [migration, rls, storage-bucket, registry, attachments, swarm-agnostic]
requires:
  - public.swarms registry (Phase 68) with dry_run_config precedent (Phase 110)
  - email_pipeline schema + resolution_audit generic-table precedent (Phase 114 D-12)
provides:
  - email_pipeline.email_attachments generic table (one row per attachment)
  - private email-attachments Supabase Storage bucket (public=false)
  - public.swarms.attachment_config jsonb (capture/extract switches + caps + stage2_dispatch_event)
  - seeded: sales-email=capture+extract on; debtor-email=capture-only (D-13)
affects:
  - Plan 02 ingest metadata capture (reads attachment_config.capture)
  - Plan 03/04 extractor worker (reads attachment_config.extract + caps + stage2_dispatch_event)
  - Stage 2 concat, Bulk Review detail-pane (reads email_attachments via authenticated SELECT)
tech-stack:
  added: []
  patterns:
    - swarm-agnostic generic table (mirrors resolution_audit) — registry-row onboarding, no per-swarm table
    - free-text status column (no codegen / no literal-union)
    - jsonb registry switch on swarms (mirrors dry_run_config)
    - registry-derived downstream dispatch (stage2_dispatch_event read from registry, not code literal)
    - private Storage bucket via SQL migration + service_role-only storage.objects policy
key-files:
  created:
    - supabase/migrations/20260605_email_attachments.sql
    - supabase/migrations/20260605b_swarms_attachment_switches.sql
  modified: []
decisions:
  - "extraction_status is free text (no enum/codegen) — valid values documented in column comment"
  - "stage2_dispatch_event seeded byte-for-byte from stage-2-customer-resolver.ts triggers (lines 56-57)"
  - "global caps (25 MiB, 20 attachments, 15 vision pages, 200k chars) live in attachment_config.caps — registry, not code"
  - "private bucket + storage.objects RLS defined via SQL migration (no in-repo precedent; bucket-policy SQL is new to this repo's migration history)"
metrics:
  duration: ~8m
  completed: 2026-06-04
---

# Phase 116 Plan 01: Attachment Ingest Data Foundation Summary

Swarm-agnostic data foundation for attachment ingest: a generic `email_pipeline.email_attachments` table (one row per attachment — metadata + extraction status + extracted text + storage key), a private `email-attachments` Supabase Storage bucket, and the D-04 `attachment_config` registry switches on `public.swarms` (capture/extract + caps + registry-derived `stage2_dispatch_event`) — seeded sales=both-on, debtor=capture-only (D-13).

## What Was Built

### Task 1 — `20260605_email_attachments.sql` (commit `9f551e92`)
- `CREATE TABLE IF NOT EXISTS email_pipeline.email_attachments` with D-06 columns: `id`, `created_at`, `swarm_type`, `email_id` (soft nullable ref), `attachment_id` (Graph id), `filename`, `content_type`, `size_bytes`, `is_inline`, `extraction_status` (free text, default `pending`, valid values documented in comment: pending/not_requested/extracted/needs_vision/extraction_failed/skipped_cap/unsupported/source_gone), `extracted_text`, `storage_key`, `updated_at`.
- `UNIQUE (email_id, attachment_id)` for idempotent ingest/backfill upserts.
- RLS: `ENABLE ROW LEVEL SECURITY` + `email_attachments_service_all` (FOR ALL, service_role) + `email_attachments_auth_select` (FOR SELECT, authenticated, D-08 Bulk Review read). No anon policy.
- Indexes: `(swarm_type, created_at DESC)` and `(email_id)`.
- Private Storage bucket `email-attachments` via `INSERT INTO storage.buckets ... public=false ON CONFLICT DO NOTHING` + `storage.objects` policy `email_attachments_objects_service_all` (FOR ALL, service_role, scoped to `bucket_id='email-attachments'`). No anon/public storage policy.
- Structure copies `20260604_generic_resolution_audit.sql` (BEGIN/CREATE/ENABLE-RLS/policies/indexes/COMMIT); fully idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING).

### Task 2 — `20260605b_swarms_attachment_switches.sql` (commit `aae7be09`)
- `ALTER TABLE public.swarms ADD COLUMN IF NOT EXISTS attachment_config jsonb NOT NULL DEFAULT '{}'::jsonb`.
- sales-email UPDATE: `capture=true, extract=true, stage2_dispatch_event='sales-email/stage-2.customer-resolve.requested', caps={max_size_bytes:26214400, max_attachments_per_mail:20, max_vision_pages:15, max_extracted_chars:200000}`.
- debtor-email UPDATE (D-13): `capture=true, extract=false, stage2_dispatch_event='debtor-email/stage-2.customer-resolve.requested', caps={...same...}`.
- `stage2_dispatch_event` literals verified byte-for-byte against `web/lib/inngest/functions/stage-2-customer-resolver.ts` lines 56-57 (the actual worker triggers).
- ALTER-only on the existing RLS-enabled `swarms` table — no new policy, no anon grant.
- Flag polarity TRUE = ON, documented in header (contrast with dry_run_config's TRUE = BLOCKED).

## Verification

- Task 1 automated grep: exactly one `ENABLE ROW LEVEL SECURITY`, no `TO anon` → **OK**.
- Task 2 automated grep: `attachment_config` present, debtor `'extract', false`, `stage2_dispatch_event` present → **OK**.
- `npm run codegen` → no writes for all three generators (`gen-entity-types`, `gen-tenant-domains`, `gen-intent-types` all "already up-to-date"); `git diff` shows no change under `web/` → **codegen drift-free** (confirms free-text jsonb adds no literal-union column).

## Deviations from Plan

None — plan executed exactly as written. The migration filenames match the plan's `files_modified` (`20260605_email_attachments.sql`, `20260605b_swarms_attachment_switches.sql`).

Note: the plan's interface reference said "support-tickets-frames as the precedent private bucket" — that bucket exists in code (`web/lib/automations/support-tickets/*`) but was created out-of-band (no migration in repo). This phase's bucket-policy SQL is therefore the first storage.objects policy committed to this repo's migration history; it follows the CLAUDE.md private-bucket / no-anon rule.

## Checkpoint Status (Task 3 — CLEARED 2026-06-05)

Task 3 (`checkpoint:human-verify gate="blocking"`) was cleared by the orchestrator with explicit user approval. Remote apply went via the Supabase Management API (MCP token was expired; Cloudflare 1010 required a browser User-Agent on curl):

1. ✅ Both migrations applied to remote `mvqjhlxfvtqqubqgdvhz` in order (20260605 → HTTP 201, 20260605b → HTTP 201).
2. ✅ `cd web && npm run check:supabase` → **0 ERROR**, 6 WARN, 23 INFO (warnings pre-existing).
3. ✅ `storage.buckets` → `email-attachments` exists with `public=false`.
4. ✅ `public.swarms.attachment_config` seeded: sales-email capture=true/extract=true, debtor-email capture=true/extract=false (D-13); `stage2_dispatch_event` values byte-match the Stage 2 worker triggers.
5. ✅ `pg_class.relrowsecurity=true` for `email_pipeline.email_attachments`.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260605_email_attachments.sql
- FOUND: supabase/migrations/20260605b_swarms_attachment_switches.sql
- FOUND commit: 9f551e92 (Task 1)
- FOUND commit: aae7be09 (Task 2)
