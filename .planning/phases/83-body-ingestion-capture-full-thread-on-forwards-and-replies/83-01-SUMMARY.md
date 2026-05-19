---
phase: 83
plan: 01
subsystem: email_pipeline / supabase schema
tags: [supabase, ddl, migration, email-pipeline, phase-83, body-ingestion]
requires:
  - email_pipeline schema exists (pre-existing)
  - email_pipeline.emails(id) UUID PK (pre-existing)
provides:
  - email_pipeline.emails.body_full_text TEXT NULL
  - email_pipeline.emails.body_unique_text TEXT NULL
  - email_pipeline.conversation_context (8 cols, PK email_id+position, FK CASCADE)
affects:
  - downstream Plan 83-03 (client.ts dual-body write)
  - downstream Plan 83-04 (conversation fetch writer)
  - downstream Plan 83-05 (backfill script)
  - downstream Plan 83-06 (Stage 3 input adapter / coordinator)
tech-stack:
  added: []
  patterns:
    - "Raw-SQL migration applied via Supabase Management API (per CLAUDE.md §Supabase)"
    - "Idempotent ALTER/CREATE with IF NOT EXISTS guards"
    - "Dual-write column strategy (D-10) — legacy body_text preserved"
key-files:
  created:
    - supabase/migrations/20260519_phase83_body_columns.sql
    - supabase/migrations/20260519_phase83_conversation_context.sql
  modified: []
decisions:
  - "D-03: separate body_full_text (full thread) and body_unique_text (new part only) — see CONTEXT"
  - "D-04: conversation_context as separate table, not JSONB on emails — clean JOIN for Phase 87 retro-classification"
  - "T-83-02 mitigated: ON DELETE CASCADE + PK(email_id, position) prevent orphan rows and dup writes"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
  completed_date: 2026-05-19
---

# Phase 83 Plan 01: Schema Foundation Summary

DDL-only foundation for Phase 83 full-thread ingestion: adds `body_full_text` + `body_unique_text` columns to `email_pipeline.emails` (D-03) and creates the `email_pipeline.conversation_context` table (D-04). Both migrations applied via Supabase Management API and verified on the live `mvqjhlxfvtqqubqgdvhz` project.

## What Shipped

### Task 1 — Body columns (commit `575b033`)

`supabase/migrations/20260519_phase83_body_columns.sql` adds two TEXT NULL columns to `email_pipeline.emails`:

- `body_full_text` — plain-text rendering of Graph `body.content` (full thread, quoted history included)
- `body_unique_text` — plain-text rendering of Graph `uniqueBody.content` (new part only)

Legacy `body_text` column preserved per D-10 dual-write policy. COMMENTs document source.

**Verification (live):** `information_schema.columns` returns `body_full_text`, `body_text`, `body_unique_text` for `email_pipeline.emails`.

### Task 2 — conversation_context table (commit `bb52b80`)

`supabase/migrations/20260519_phase83_conversation_context.sql` creates `email_pipeline.conversation_context` with the locked D-04 schema:

```
email_id          UUID NOT NULL → emails(id) ON DELETE CASCADE
position          SMALLINT NOT NULL (CHECK 1..5)
source_message_id TEXT NOT NULL
sender_email      TEXT
subject           TEXT
received_at       TIMESTAMPTZ
body_text         TEXT
fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (email_id, position)
INDEX conversation_context_email_id_idx ON (email_id)
```

CHECK widens to position 1..5 for future-proofing; current writer uses 1..2.

**Verification (live):** 8 columns present in `information_schema.columns`; FK `conversation_context_email_id_fkey` confirmed with `delete_rule = CASCADE`; PK and CHECK constraints in place.

## Acceptance Criteria

- [x] `supabase/migrations/20260519_phase83_body_columns.sql` exists with literal `ADD COLUMN IF NOT EXISTS body_full_text   TEXT NULL`
- [x] Same file contains `ADD COLUMN IF NOT EXISTS body_unique_text TEXT NULL`
- [x] Migration applied; both columns present in live DB
- [x] `body_text` column still present (legacy NOT dropped)
- [x] `grep -c "DROP COLUMN"` on body-columns migration → 0
- [x] `supabase/migrations/20260519_phase83_conversation_context.sql` exists with `CREATE TABLE IF NOT EXISTS email_pipeline.conversation_context`
- [x] File contains `PRIMARY KEY (email_id, position)` and `REFERENCES email_pipeline.emails(id) ON DELETE CASCADE`
- [x] Table exists in `email_pipeline` schema with all 8 columns
- [x] FK to `email_pipeline.emails(id)` confirmed (CASCADE delete)
- [x] No `JSONB` in conversation_context migration (separate-table choice per D-04)

## Deviations from Plan

None — plan executed exactly as written. Migration SQL is the literal contents specified in the plan body.

## Threat Flags

None. Surface introduced (two columns + one table) sits entirely inside the existing `email_pipeline` server-only schema posture documented in T-83-01 / T-83-03.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260519_phase83_body_columns.sql
- FOUND: supabase/migrations/20260519_phase83_conversation_context.sql
- FOUND commit: 575b033 (feat(83-01): add body_full_text + body_unique_text)
- FOUND commit: bb52b80 (feat(83-01): create email_pipeline.conversation_context table)
- Live DB verified via Management API: columns + table + FK CASCADE all present.
