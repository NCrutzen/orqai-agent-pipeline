---
phase: 74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis
plan: 01
subsystem: classifier-pipeline
tags: [phase-74, stage-1, classifier, registry, supabase, sales-email, mailboxes]
status: complete
requires:
  - public.swarms (Phase 56.7)
  - public.swarm_categories (Phase 56.7)
  - public.orq_agents (Phase 56-02 wave 3)
  - public.agent_runs (Phase 60-00)
provides:
  - public.agent_runs.entity nullable + error_message column
  - public.swarms row swarm_type='sales-email' (LLM-only Stage 1)
  - 5 public.swarm_categories rows for sales-email
  - public.orq_agents row stage-1-category-classifier (enabled=false placeholder)
  - ICONTROLLER_MAILBOXES extended with administratie@fire-control.nl (12) and debiteuren@smeba-fire.be (5)
affects:
  - web/lib/inngest/functions/classifier-screen-worker.ts (Plan 04)
  - web/lib/inngest/functions/classifier-label-resolver.ts (isKnownMailbox gate now sees Phase 74 mailboxes)
tech-stack:
  added: []
  patterns: [supabase-migration, registry-driven-routing, idempotent-on-conflict]
key-files:
  created:
    - supabase/migrations/20260506_phase74_agent_runs_entity_nullable.sql
    - supabase/migrations/20260506_phase74_sales_email_seed.sql
    - supabase/migrations/20260506_phase74_stage1_classifier_agent.sql
    - .planning/phases/74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis/deferred-items.md
  modified:
    - web/lib/automations/debtor-email/mailboxes.ts
decisions:
  - "sales-email entity_brand defaulted to '[]'::jsonb (cross-brand) — operator did not override; SPEC line 73 reflects this"
  - "Existing debiteuren@smeba-fire.nl: 5 entry preserved alongside new debiteuren@smeba-fire.be: 5 (additive, non-destructive); operator confirmed only the additions"
  - "on-conflict clause for orq_agents OMITS orqai_id and enabled so re-applies do not stomp Plan 03's Studio-ritual activation"
metrics:
  duration: ~25 minutes
  tasks_completed: 5/5 (Task 1 was a checkpoint resolved pre-execution)
  files_changed: 5
  commits: 4
  completed: 2026-05-06
---

# Phase 74 Plan 01: DB Foundation Summary

Three Supabase migrations + one TS edit landing the schema and registry rows the Plan 04 worker reads. One-liner: makes `agent_runs.entity` nullable, seeds the sales-email swarm + 5 categories, registers the cross-cutting Stage-1 classifier orq_agent (disabled placeholder), and extends `ICONTROLLER_MAILBOXES` with two operator-confirmed Phase 74 mailboxes.

## Commits

| # | Commit  | Task                                                                          |
| - | ------- | ----------------------------------------------------------------------------- |
| 2 | 67dd923 | feat(74-01): drop agent_runs.entity CHECK + NOT NULL; add error_message col   |
| 3 | 48a464f | feat(74-01): seed sales-email swarm + 5 swarm_categories (Phase 74 D-17)      |
| 4 | f8d2774 | feat(74-01): seed orq_agents row for stage-1-category-classifier (enabled=false) |
| 5 | 1be474a | feat(74-01): extend ICONTROLLER_MAILBOXES with operator-confirmed Phase 74 mailboxes |

## Operator Answers (verbatim, recorded 2026-05-06)

| Original SPEC ref | Actual address                  | Swarm        | iController mailbox ID |
|-------------------|---------------------------------|--------------|------------------------|
| "SMEBA fire@"     | `debiteuren@smeba-fire.be`      | debtor-email | 5                      |
| "firecontrol@"    | `administratie@fire-control.nl` | debtor-email | 12                     |
| "+1 sales-email"  | `verkoop@smeba.nl`              | sales-email  | n/a                    |

**sales-email entity_brand:** Operator did not override → applied default `'[]'::jsonb` per RESEARCH Open Question 5 recommendation.

## Migration Apply Status

**No `mcp__supabase__apply_migration` tool available in this session's environment** (Supabase MCP not registered). All three migration files are committed to disk and ready for apply via Supabase Studio SQL editor:

1. `supabase/migrations/20260506_phase74_agent_runs_entity_nullable.sql`
2. `supabase/migrations/20260506_phase74_sales_email_seed.sql`
3. `supabase/migrations/20260506_phase74_stage1_classifier_agent.sql`

All three are idempotent (uses `if exists` / `add column if not exists` / `on conflict ... do update`). Safe to re-apply.

**Required SQL probes after apply (per plan acceptance criteria):**

```sql
-- Task 2 probes
select column_name, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='agent_runs' and column_name='entity';
-- Expect: entity, YES

select conname from pg_constraint
 where conrelid='public.agent_runs'::regclass and conname='agent_runs_entity_check';
-- Expect: 0 rows

select column_name from information_schema.columns
 where table_schema='public' and table_name='agent_runs' and column_name='error_message';
-- Expect: error_message

-- Task 3 probes
select count(*) from public.swarms where swarm_type='sales-email';
-- Expect: 1

select count(*) from public.swarm_categories where swarm_type='sales-email';
-- Expect: 5  (SPEC REQ-6 acceptance)

select category_key from public.swarm_categories
 where swarm_type='sales-email' order by display_order;
-- Expect: auto_reply, ooo_temporary, ooo_permanent, payment_admittance, unknown

select stage1_regex_module from public.swarms where swarm_type='sales-email';
-- Expect: NULL

-- Task 4 probes
select agent_key, swarm_type, enabled
  from public.orq_agents where agent_key='stage-1-category-classifier';
-- Expect: stage-1-category-classifier, cross-cutting, false
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Pre-existing tsc noise documented, not fixed]**
- **Found during:** Task 5 verification (`tsc --noEmit`)
- **Issue:** 4 pre-existing tsc errors in `app/(dashboard)/automations/[swarm]/review/actions.ts:358`, `app/api/automations/debtor-email/ingest/route.ts:634`, and two test files
- **Why not fixed:** Confirmed pre-existing by `git stash`-bisect of mailbox edit — same 4 errors with or without my change. Errors are scope of Plan 74-02 (event-payload `swarm_type` field threading) and unrelated test fixture drift, not Plan 74-01 territory. Documented in `.planning/phases/74-.../deferred-items.md`.
- **Verification of no regression:** Stash-pop bisect confirmed mailbox edit caused zero new errors.

**2. [Rule 2 — additive, non-destructive] Kept stale `debiteuren@smeba-fire.nl: 5` entry**
- **Found during:** Task 5
- **Issue:** Operator confirmed canonical address is `.be` (not `.nl`). Existing entry maps `.nl → 5` (likely typo from 2026-04-23 manual capture).
- **Decision:** Added `.be → 5` alongside `.nl` rather than replacing. Both point to mailbox 5 in iController; either inbound source matches `isKnownMailbox`. Removing `.nl` is destructive without operator-confirmed go-ahead and was not part of the operator's confirmation set ("only the three additions").
- **Risk:** Minimal — `isKnownMailbox` is a pre-write gate; an extra valid key cannot misroute.

## Authentication Gates

None — all work is migration files + a TS const edit.

## Self-Check: PASSED

- File `supabase/migrations/20260506_phase74_agent_runs_entity_nullable.sql` exists.
- File `supabase/migrations/20260506_phase74_sales_email_seed.sql` exists.
- File `supabase/migrations/20260506_phase74_stage1_classifier_agent.sql` exists.
- `web/lib/automations/debtor-email/mailboxes.ts` contains `administratie@fire-control.nl` and `debiteuren@smeba-fire.be`.
- All 4 commit hashes (67dd923, 48a464f, f8d2774, 1be474a) present in `git log`.
- All `grep -c` checks from `<acceptance_criteria>` returned the expected counts.
- on-conflict clause for orq_agents excludes `orqai_id` and `enabled` (verified by awk-grep returning 0).

**SQL probes** (against live DB) deferred until operator applies the three migration files via Studio SQL editor — no Management API token available in this session.
