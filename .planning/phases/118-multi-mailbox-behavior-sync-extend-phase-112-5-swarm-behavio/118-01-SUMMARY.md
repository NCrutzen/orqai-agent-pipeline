---
phase: 118-multi-mailbox-behavior-sync
plan: 01
subsystem: infra
tags: [inngest, outlook, graph-delta, behavior-tracking, supabase, jsonb-migration]

# Dependency graph
requires:
  - phase: 112.5
    provides: "swarm-behavior-sync.ts Outlook delta-sync worker (single-mailbox per swarm row) + swarm_review_signals derivation"
  - phase: 117
    provides: "swarm_written_categories baseline read by the 112.5 category_edited signal (untouched here)"
provides:
  - "swarm-behavior-sync.ts iterates one (swarm x mailbox) pair per EnabledSwarm, driven by behavior_tracking_config.mailboxes string[] with singular-mailbox fallback"
  - "Mailbox-disambiguated deterministic step.run ids (refresh-folder-map / tracked-folders / delta / derive-and-write) — replay/memoization-safe across mailboxes"
  - "BehaviorTrackingConfig.mailboxes?: string[] type addition (singular mailbox? kept for back-compat)"
  - "DATA-only idempotent jsonb migration moving sales-email to {enabled:true, mailboxes:['verkoop@smeba.nl']} — applied to prod by operator"
affects: [debtor-enablement-step-2, swarm-behavior-sync, V10.0-promotion-recommender]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-array flatten: load-enabled-swarms flattens each enabled swarm row to one EnabledSwarm per (swarm x mailbox); weights shared per swarm"
    - "Mailbox-suffixed deterministic Inngest step ids prevent cross-mailbox memoization (raw mailbox string in id — no hashing, no non-deterministic source)"
    - "Registry DATA migration: idempotent jsonb minus-key + jsonb_set built from existing config (no DDL/RLS), prod apply operator-gated"

key-files:
  created:
    - supabase/migrations/20260616_phase118_sales_mailboxes_array.sql
  modified:
    - web/lib/inngest/functions/swarm-behavior-sync.ts
    - web/lib/email-behavior/__tests__/behavior-sync.test.ts
    - docs/swarm-behavior-tracking.md

key-decisions:
  - "mailboxes[] read order locked verbatim: const mailboxes = cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : []) — singular fallback keeps unmigrated rows byte-unchanged"
  - "Array-in-config, NOT one-swarms-row-per-mailbox (public.swarms PK is swarm_type) — the array lives in the existing jsonb"
  - "Sales config migrated in-phase to live-validate the multi-mailbox read-path before debtor enablement (step 2, out of scope)"
  - "Singular mailbox key dropped on the sales-email row only; the code fallback still protects every other unmigrated row"

patterns-established:
  - "Per-(swarm x mailbox) flatten with shared weights — sequential under concurrency:1, no new fan-out"
  - "Mailbox segment embedded in all four loop-body step ids; top-level resolve-run-id / resolve-tick-iso stay singular (one per run)"

requirements-completed: []

# Metrics
duration: ~25min (code) + operator checkpoint
completed: 2026-06-16
---

# Phase 118 Plan 01: Multi-mailbox behavior-sync Summary

**swarm-behavior-sync.ts now observes MULTIPLE mailboxes per swarm row via behavior_tracking_config.mailboxes[] with a byte-compatible singular fallback, with sales-email migrated live to the array form to validate the read-path before debtor's ~5-mailbox enablement.**

## Performance

- **Duration:** ~25 min implementation + operator checkpoint window
- **Tasks:** 4/4 (Task 3 was the [BLOCKING] operator prod-apply checkpoint)
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments

- **Task 1 (commit 32d0b26d):** Extended `BehaviorTrackingConfig` with `mailboxes?: string[]` (kept `mailbox?: string`). `load-enabled-swarms` now flattens each enabled swarm row to one `EnabledSwarm` per (swarm x mailbox) pair using the locked read order `cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : [])` (empty → row skipped). All four per-loop `step.run` ids (`refresh-folder-map`, `tracked-folders`, `delta`, `derive-and-write`) now embed the mailbox segment so two mailboxes of the same swarm never collide on Inngest memoization; top-level `resolve-run-id` / `resolve-tick-iso` stay singular. Per-mailbox queries already parametrise on `.eq("mailbox", mailbox)`, so the loop body was structurally unchanged. `concurrency: { limit: 1 }` preserved (sequential per-mailbox). Added 3 vitest cases (multi-mailbox iteration, step-id uniqueness, singular-fallback regression) + extended the test `DBState` config type with the optional `mailboxes` array. **vitest 13/13 green, tsc 0.**
- **Task 2 (commit 45467745):** Created `supabase/migrations/20260616_phase118_sales_mailboxes_array.sql` — DATA-only, idempotent jsonb `UPDATE public.swarms WHERE swarm_type = 'sales-email'`, built from the existing config (drops singular `'mailbox'` key via minus-key, forces `enabled` true via `jsonb_set`, sets `mailboxes` to `jsonb_build_array('verkoop@smeba.nl')` with `create_missing`), wrapped in `BEGIN ... COMMIT`. No CREATE TABLE / RLS / policy / DROP. Header defers the prod apply to the [BLOCKING] Task 3.
- **Task 3 ([BLOCKING] checkpoint — APPROVED + APPLIED by operator):** Migration applied to prod via Supabase MCP. Live-verified `public.swarms` sales-email `behavior_tracking_config = {"enabled":true,"mailboxes":["verkoop@smeba.nl"]}` (singular `mailbox` key removed; debtor-email unchanged at `{"enabled":false}`). The multi-mailbox read-path is now exercised on production.
- **Task 4 (commit f7946e6e):** Updated `docs/swarm-behavior-tracking.md` to document the `mailboxes[]` config shape + the singular-`mailbox` backward-compat fallback, recorded sales-email as migrated to the array form, and noted debtor multi-mailbox enablement as a separate post-merge step 2.

## Verification Results

- **vitest** (`lib/email-behavior/__tests__/behavior-sync.test.ts`): 13/13 green — including the unchanged 112.5 tests 1-10 + test 6 (singular-path regression guard) plus the 3 new Phase 118 cases.
- **tsc:** 0 errors.
- **codegen:** no drift (no generated literal-union type touches `behavior_tracking_config`; `BehaviorTrackingConfig` lives inline in the worker file only).
- **check:supabase:** 0 ERROR, 6 WARN, 23 INFO (clean; no new advisor lints — as expected for a DATA migration).
- **Live row (post-apply):** sales-email `behavior_tracking_config = {"enabled":true,"mailboxes":["verkoop@smeba.nl"]}`, singular `mailbox` key absent; debtor-email untouched.
- **Hard-separation:** no new reference to `swarm_noise_categories` / `swarm_intents` introduced.
- **Replay-safety:** the only `crypto.randomUUID` / `new Date()` calls remain inside the `resolve-run-id` / `resolve-tick-iso` steps; no non-deterministic value feeds a step id.

## Deviations from Plan

**1. [Process note — verification rested on planner plan-check + executor green checks]**
- **Found during:** post-checkpoint wrap-up.
- **Issue:** the standalone plan-checker launched for this plan produced no substantive verdict.
- **Resolution:** verification rested on the planner's internal plan-check PASS (committed in 58339fea — "verified plan-check") plus the executor's green checks (vitest 13/13, tsc 0, codegen no drift, advisor 0 ERROR, live row verified). No code impact; noted for traceability only.

Otherwise: plan executed exactly as written.

## Known Stubs

None. The worker change is fully wired; the migration is applied live; the singular fallback keeps all unmigrated rows working unchanged.

## Known Follow-ups

- **Step 2 — debtor enablement (post-merge, OUT OF SCOPE here):** flip `swarms.dry_run_config.stage_3_intent_label=false` for debtor and set debtor's `behavior_tracking_config` to `{enabled:true, mailboxes:[…5…]}` over its real footprint: `debiteuren@smeba.nl`, `debiteuren@sicli-noord.be`, `facturations@sicli-sud.be`, `debiteuren@smeba-fire.be`, `debiteuren@berki.nl`. Separate operator-gated change after this merges. This plan is the code enabler (step 1) only.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260616_phase118_sales_mailboxes_array.sql
- FOUND: web/lib/inngest/functions/swarm-behavior-sync.ts
- FOUND: web/lib/email-behavior/__tests__/behavior-sync.test.ts
- FOUND: docs/swarm-behavior-tracking.md
- FOUND commit: 32d0b26d (Task 1 — multi-mailbox iteration)
- FOUND commit: 45467745 (Task 2 — sales-email mailboxes[] migration)
- FOUND commit: f7946e6e (Task 4 — docs runbook update)
- VERIFIED live: sales-email behavior_tracking_config = {"enabled":true,"mailboxes":["verkoop@smeba.nl"]} (Task 3 operator-applied)
