---
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
plan: 03
subsystem: database
tags: [stage-2, resolver, corroboration, supabase, migration, registry]

# Dependency graph
requires:
  - phase: 120-01
    provides: engine corroboration capability (reads config.corroboration)
  - phase: 120-02
    provides: sales SQL back-search transport + shared scoreCorroboration adapter
provides:
  - "LIVE debtor + sales resolution_config carry corroboration (applied to production mvqjhlxfvtqqubqgdvhz)"
  - "Sales transport seam switched to nxt.resolve_candidates in the live registry"
  - "Dedicated 'sales_resolution' intent on nxt.resolve_candidates.allowed_for_intents + lookups wired to it"
  - "debtorP0Config corroboration lockstep (constant ↔ seed)"
affects: [120-04-correctness-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "W1 live-verbatim seeding: build the seed from the ACTUAL live row, not the in-tree migration (caught a plan-vs-reality drift)"
    - "Lockstep scoped to a sub-object (corroboration only); the test never asserts full deep-equality"

key-files:
  created:
    - supabase/migrations/20260616a_debtor_corroboration_optin.sql
    - supabase/migrations/20260616b_sales_corroboration_and_sql.sql
    - web/lib/agentic-pipeline/resolve/__tests__/debtor-corroboration-config.test.ts
  modified:
    - web/lib/automations/debtor-email/resolve-debtor.ts
    - web/lib/automations/sales-email/lookups/offerte.ts
    - web/lib/automations/sales-email/lookups/order.ts
    - web/lib/automations/sales-email/lookups/sites.ts

key-decisions:
  - "W1 plan-vs-reality drift: live debtor resolution_config is the P0 config (precedence thread_inheritance/sender_match/identifier_match, auto_safe_kinds []), NOT the inverted Phase-91 row the plan assumed. Operator-approved (AskUserQuestion) to seed LIVE-VERBATIM + corroboration → no AUTO-tier regression. The plan's self_auth acceptance grep is intentionally unsatisfiable."
  - "allowed_for_intents is text[] (not jsonb) — section 4 uses array_append + ANY(), idempotent."
  - "Dedicated 'sales_resolution' intent ADDED (operator request) and WIRED: the 3 sales back-search lookups call with it (per-swarm audit), not debtor's 'unknown'. Additive to the allowlist."

patterns-established:
  - "Production registry seed via Supabase MCP apply_migration after an explicit operator confirm + before/after verification (CLAUDE.md production-write protocol)"

requirements-completed: [CORR-05]

# Metrics
duration: ~40min
completed: 2026-06-17
---

# Phase 120-03: Live Corroboration Re-Seed Summary

**Both swarms' LIVE resolution_config now carry D-06 corroboration (applied to production); sales transport switched to nxt.resolve_candidates with a dedicated 'sales_resolution' allowlist intent; debtorP0Config kept in corroboration-lockstep.**

## Performance
- **Duration:** ~40 min (incl. W1 live-state investigation + production apply checkpoint)
- **Completed:** 2026-06-17
- **Tasks:** 2 (Task 1 migrations/lockstep + Task 2 BLOCKING live apply)
- **Files modified:** 7 (4 modified, 3 created)

## Accomplishments
- **Task 1:** two UPDATE-only migrations (debtor live-verbatim + corroboration; sales transport switch + corroboration + dedicated allowlist intent), debtorP0Config corroboration lockstep, config-presence test. Sales lookups wired to the `sales_resolution` intent.
- **Task 2 (checkpoint):** applied both migrations to production `mvqjhlxfvtqqubqgdvhz` via Supabase MCP, verified `check:supabase` 0 ERROR, and confirmed the live state (both corroboration fields, sales tool switch, allowlist entry, dry_run preserved).

## Task Commits
1. **Task 1: re-seed migrations + lockstep + sales intent** — `adb73699` (feat)
2. **Task 2: live apply** — production registry write (no code commit; verified via MCP)

## Live verification (production mvqjhlxfvtqqubqgdvhz)
- debtor-email: `corr {min_signals:2, boost:high, auto_safe_alone_kinds:[customer_no,site_no,invoice_no]}`, tool `nxt.resolve_candidates`, version `2026-06-16.v1`, precedence P0 (preserved)
- sales-email: `corr {…[quote_no,order_no,invoice_no]}`, tool `nxt.resolve_candidates` (switched from rest_proxy), `dry_run_stage2: true` (preserved)
- `nxt.resolve_candidates.allowed_for_intents`: `[unknown, invoice_copy_request, sales_resolution]`
- `npm run check:supabase`: 0 ERROR, 6 WARN, 23 INFO

## Deviations from Plan
- **W1 live-verbatim seed (operator-approved):** the plan assumed the live debtor row was Phase-91-inverted; it is P0. Seeded live-verbatim + corroboration to avoid changing live behavior. The plan's `self_auth`/inverted-precedence acceptance grep is therefore intentionally not satisfied (documented; `customer_no` still appears via corroboration.auto_safe_alone_kinds).
- **allowed_for_intents is text[]** (plan implied jsonb) — used Postgres array ops.
- **Sales lookups re-touched** (Plan 02 files) to call with the dedicated `sales_resolution` intent — tied to the new allowlist entry; included in the Task 1 commit.

## Issues Encountered
- W1 caught the live-vs-plan precedence drift before any production write — resolved via operator decision. No clobbered fields (verified pre/post).

## User Setup Required
None remaining — the production seed is applied and verified.

## Next Phase Readiness
- Corroboration fires on the live registry rows. resolve + sales suites green (145 passed); tsc 0; check:supabase 0 ERROR.
- Plan 04 can now run the correctness gate (100-email fixture) and re-finalize STAGE2-01 against the post-120 commit.

---
*Phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm*
*Completed: 2026-06-17*
