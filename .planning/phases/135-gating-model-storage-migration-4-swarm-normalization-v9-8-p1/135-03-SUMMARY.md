---
phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
plan: 03
subsystem: storage-migration
tags: [supabase, migration, gating_config, tri-state, invariant-trigger, security_invoker, 4-swarm-seed, oq-3-escalation]

# Dependency graph
requires:
  - phase: 135-01
    provides: phase135-trigger-smoke.ts + phase135-seed-readback.ts (the operator smokes this migration must satisfy post-apply)
  - phase: 135-02
    provides: GatingConfig TS shape + tri-state stage_4_handlers + deriveMailboxMode (the SQL must match)
provides:
  - "supabase/migrations/20260625_phase135_gating_config.sql — rename + bool->tri-state migrate + 3-swarm legal seed + enforce_handler_trigger_stage_invariant trigger + gating_invariant_violations security_invoker view, locked order, idempotent"
  - "confirmed handler->trigger-stage map (stage_1_cleanup->stage_1_cleanup flag; all others->stage_3_routing) cited from dispatch wiring"
  - "OQ-3 Path A escalation: sales archive verified live+firing -> sales seed omitted, flagged for 135-05 operator checkpoint"
affects: [135-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locked migration statement order rename->migrate->seed->trigger/view so the seed lands before enforcement (Pitfall 5)"
    - "Idempotent bool->tri-state jsonb migrate via DO-block (skip already-string values; forward buckets never converted)"
    - "Invariant as PL/pgSQL BEFORE trigger (hard reject over a jsonb map) + security_invoker drift-detector view"
    - "Verify-before-seed gate: live read-only re-query falsified an assumed-inert flag and triggered the planned escalation branch instead of a silent seed"

key-files:
  created:
    - supabase/migrations/20260625_phase135_gating_config.sql
  modified: []

key-decisions:
  - "Handler->trigger-stage map CONFIRMED from dispatch wiring (not just RESEARCH A1): stage_1_cleanup is Stage-1 cron-dispatcher driven; invoice-copy + all others are Stage-3 predicted-emit/dispatcher driven (gated by stage_3_routing). No deviation from A1."
  - "OQ-3 Path A inertness premise FALSIFIED: sales stage_1_archive=false is LIVE and FIRING (12 categories carry outlook_label+categorize_archive; verdict-worker archiveLive fires live Outlook archive). Sales seed OMITTED (held would break D-09; Live not silent); escalated to 135-05 operator checkpoint."
  - "Sales row left at its verified-live state through the rename + no-op tri-state migrate -> D-09 preserved, sales derives Live (not D-05-R Dry) pending operator reconciliation."
  - "debtor seeded with stage_1_cleanup stage flag=false (live) so the explicit stage_1_cleanup:'live' handler is legal-by-construction (D-06)."
  - "Trigger fn pinned search_path + NOT definer-rights (writer-rights); view security_invoker=true (CLAUDE.md / advisor hygiene)."

requirements-completed: [MODEL-01, MODEL-02, MODEL-04, MIGRATE-01, MIGRATE-03]

# Metrics
duration: 14min
completed: 2026-06-30
---

# Phase 135 Plan 03: gating_config Migration + 4-Swarm Normalization Summary

**Authored the single idempotent migration `20260625_phase135_gating_config.sql` (rename `dry_run_config`->`gating_config`, bool->tri-state handler migrate, verified-live legal seed for debtor/info-routing/support-tickets, plus the `enforce_handler_trigger_stage_invariant` BEFORE trigger and the `gating_invariant_violations` security_invoker view) in the locked rename->migrate->seed->trigger/view order. The Task-1a inertness gate falsified the OQ-3 Path A premise — sales archive is live and firing — so the sales seed was OMITTED and escalated to the 135-05 operator checkpoint rather than silently flipped.**

## Performance
- **Duration:** ~14 min
- **Completed:** 2026-06-30
- **Tasks:** 3 (Task 1, Task 1a, Task 2)
- **Files created:** 1

## Accomplishments
- **Task 1 — confirmed the handler->trigger-stage map from real dispatch wiring** (not just RESEARCH A1 inference) and documented it in the migration header with source-file + line citations:
  - `stage_1_cleanup` -> trigger-stage `stage_1_cleanup`: dispatched by the Stage-1 cron dispatcher (`stage-1-icontroller-noise-cleanup-dispatcher.ts:48,101`) -> handler (`stage-1-icontroller-noise-cleanup.ts:51,69`).
  - every other handler (invoice-copy) -> trigger-stage `stage_3_routing`: handler (`classifier-invoice-copy-handler.ts:49,101`) fired off the Stage-3 dispatcher `handler_event` (`stage-3-dispatcher.ts:176-211`), itself gated by the coordinator's `stage_3_routing` read before the predicted-emit (`debtor-email-coordinator.ts:77-88`). No deviation from A1.
- **Task 1a — verified sales archive inertness (read-only, 2026-06-30) and found it NOT inert.** The OQ-3 Path A escalation branch fired: sales seed omitted, contradiction documented in the migration header + this summary + flagged for 135-05.
- **Task 2 — authored the full migration** in one `BEGIN;`/`COMMIT;`, idempotent, in the locked statement order:
  1. **rename** `dry_run_config`->`gating_config` (guarded DO-block; DEFAULT/NOT NULL preserved).
  2. **tri-state migrate** (DO-block: boolean `false`->`"live"`, `true`->`"dry"`; already-string values skipped; `stage_4_forward_buckets` untouched).
  3. **seed** debtor (`invoice-copy:"dry"` + `stage_1_cleanup:"live"`, cleanup stage flag false=live; intent_label `false`/live per Pitfall 1), info-routing (`stage_3_routing` held true per Pitfall 2; `verkoop`+`opleidingen` forward buckets released), support-tickets (`{}` -> Shadow). Sales omitted (escalation).
  4. **trigger fn + trigger + view LAST** — `enforce_handler_trigger_stage_invariant()` RAISEs on any `handler="live"` on a non-live trigger-stage; `gating_invariant_violations` `security_invoker=true` drift view.

## Task Commits
1. **Task 1: confirm handler->trigger-stage map** — `0d5c220d` (docs)
2. **Task 1a: escalate sales archive seed (OQ-3 Path A inertness false)** — `254855bd` (docs)
3. **Task 2: author rename+tri-state+seed+invariant migration** — `ad49099d` (feat)

## Files Created
- `supabase/migrations/20260625_phase135_gating_config.sql` — the rename + tri-state migrate + 3-swarm legal seed + invariant trigger + security_invoker view, idempotent, locked order. NOT applied (135-05 applies it under operator gate).

## Verification
- `grep` (Task 1): `MAP-CONFIRMED` (header documents the cited map).
- `grep` (Task 1a): `PATHA-DOCUMENTED` (OQ-3 Path A escalation in header).
- `grep` (Task 2): rename:OK, fn:OK, security_invoker=true:OK, no-definer:OK (no `SECURITY DEFINER` anywhere), cleanup-live:OK, verkoop:OK, view-invoker-within-3-lines:OK.
- Statement order verified by line numbers: RENAME (113) -> tri-state migrate (149) -> debtor/info-routing/support-tickets seeds (181/199/205) -> CREATE TRIGGER (265) -> CREATE OR REPLACE VIEW (273). Rename before any UPDATE; trigger/view after the last seed (Pitfall 5).
- Seed values cross-checked against verified-live re-query (2026-06-30, within RESEARCH valid-until 2026-07-02): debtor/info-routing/support-tickets match; debtor `stage_3_intent_label=false` (live) NOT the stale `20260603b` `true` (Pitfall 1 avoided).
- Not applied to any live DB (per plan + `<mcp_tools>` constraint). Apply + advisor + smokes are 135-05.

## Decisions Made
- **Handler->trigger-stage map confirmed, no A1 deviation.** Dispatch wiring corroborates `stage_1_cleanup`->Stage-1, all-others->`stage_3_routing`.
- **Sales seed omitted (OQ-3 Path A escalation).** See Deviations below.
- **debtor seeded with the cleanup stage flag live (false)** so the explicit `stage_1_cleanup:"live"` handler is legal-by-construction; the trigger validates the seeded state cleanly on the next write.
- **No `SECURITY DEFINER`, ever.** Trigger fn runs under writer rights with a pinned `search_path`; view is `security_invoker=true`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan assumption falsified] OQ-3 Path A inertness premise is FALSE — sales archive is live and firing**
- **Found during:** Task 1a (the inertness gate the plan installed for exactly this branch).
- **Issue:** The plan's seed_table and OQ-3 Path A instructed seeding sales `stage_1_archive` HELD (true) on the premise that "sales has no wired archive side-effect — the live `false` was an inert/drift flag". Read-only verification on 2026-06-30 falsified that: `swarms.side_effects=[]` for sales, BUT 12 `swarm_noise_categories` carry a live `outlook_label` + `action='categorize_archive'`, and `classifier-verdict-worker.ts:149-166` fires a live Outlook categorize+archive whenever `archiveLive = (!!category.outlook_label && !isStageBlocked(swarmRow,"stage_1_archive"))`. With live `stage_1_archive=false`, sales archives noise emails live today (the worker's own lines 91-95 + STATE.md "sales Stage 0/1/3 LIVE" confirm it).
- **Fix:** Followed the plan's own OQ-3 escalation branch (autonomous, by design): the migration includes **no sales UPDATE**. The sales row flows through the rename + (no-op) tri-state migrate and retains its verified-live state (`stage_1_archive=false` LIVE), so D-09 "no behavior change at cutover" holds. Seeding HELD would have STOPPED live archiving (a deliberate behavior change); seeding Live silently is also disallowed. The contradiction (sales derives Live, not the D-05-R "Dry") is documented in the migration header (Task 1a block) + the in-line sales comment + flagged for the **135-05 operator checkpoint**.
- **Files modified:** supabase/migrations/20260625_phase135_gating_config.sql (header Task-1a block + sales in-line comment).
- **Commit:** 254855bd (escalation note) + ad49099d (sales UPDATE omitted in the SQL body).

## Operator Action Required (135-05 checkpoint)
- **Reconcile sales `stage_1_archive`.** It is live+firing. The operator must decide before any sales archive flip: (a) accept sales=Live (drop the D-05-R "Dry" intent for sales), OR (b) deliberately hold sales archive (a behavior change: sales stops archiving noise) via a follow-up operator-gated write. This migration does neither — it preserves the live state.
- **Re-query the seed** at apply time (135-VALIDATION valid-until 2026-07-02) before locking; reconcile `EXPECTED_SEED` in `phase135-seed-readback.ts`.

## Known Stubs
None — pure SQL authoring; no UI data path.

## Threat Flags
None new. The plan's STRIDE mitigations are encoded: T-135-03-01 (view `security_invoker=true`), T-135-03-02 (trigger fn pinned `search_path`, writer-rights), T-135-03-03 (`BEFORE INSERT OR UPDATE` hard-reject trigger), T-135-03-04 (verified-live seed; sales escalated rather than blind-seeded).

## Issues Encountered
- No `web/.env.local` in this worktree; used the Management API (`SUPABASE_ACCESS_TOKEN` from `/Volumes/Developer/.secrets.env`) read-only for the verification queries. No service-role key used, no writes.

## Next Phase Readiness
- **135-05 (apply):** apply this migration under operator gate, re-query + reconcile the seed, run `phase135-trigger-smoke.ts` (illegal UPDATE rejected) + `phase135-seed-readback.ts`, run `npm run check:supabase` (expect 0 ERROR). **MUST resolve the sales `stage_1_archive` escalation before any sales archive flip.**

## Self-Check: PASSED
