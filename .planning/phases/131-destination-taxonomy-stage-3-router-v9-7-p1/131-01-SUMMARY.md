---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
plan: 01
subsystem: database
tags: [supabase, rls, registry, codegen, info-routing, stage-3-router, inngest, typescript, zod]

# Dependency graph
requires:
  - phase: 130-info-routing-noise-recalibration
    provides: info-routing swarm onboarded with Stage-1 noise categories incl. the `unknown` fall-through row (20260521b) this plan flips
  - phase: 113-stage-3-sales-intent-agent
    provides: the swarm-agnostic stage_3_routing HELD gate (isStage3RoutingGated / 20260609c) reused as the ROUTE-07 no-forward mechanism
provides:
  - public.routing_destinations registry table (one row per bucket×brand, RLS service_role+authenticated, frozen seed + unrouted sentinel)
  - (bucket×brand)→target_mailbox resolution via loadRoutingDestinations + pure resolveRoutingDestination (cross-brand correct)
  - info-routing wired for Stage-3 routing — agent key set, stage_3_routing held, unknown→pipeline/coordinator.requested dispatch
  - DestinationKey codegen single-source enum from routing_destinations
affects: [131-02, 131-03, 132-forward-side-effect-bulk-review, stage-3-coordinator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-gated codegen with pre-apply tolerance: codegen skips (no rewrite) when the source table is not-yet-applied (PGRST205), so the codegen chain doesn't hard-fail before the operator migration apply; the committed generated file is the deterministic post-apply output"
    - "Brand-aware (bucket×brand) resolution: pure resolver picks the row matching BOTH destination_key and brand, so a fire-control mail at info@smeba routes to a fire-control mailbox not smeba"

key-files:
  created:
    - supabase/migrations/20260617_phase131_routing_destinations.sql
    - supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql
    - supabase/migrations/20260617c_phase131_info_routing_unknown_dispatch.sql
    - web/scripts/gen-routing-destinations.ts
    - web/lib/swarms/routing-destinations.generated.ts
    - web/lib/swarms/__tests__/routing-destinations-seed.test.ts
    - web/lib/swarms/__tests__/routing-resolve.test.ts
  modified:
    - web/lib/swarms/types.ts
    - web/lib/swarms/registry.ts
    - web/package.json

key-decisions:
  - "Seeded `algemeen` bucket → algemeen@smeba.nl as a placeholder NOT in charter §2's verified-mailbox table — flagged in the migration comment for operator confirmation at the Task 3 checkpoint (the bucket must exist for the 8-key enum; its mailbox is the one unverified pair)"
  - "Codegen made tolerant of the not-yet-applied table (PGRST205 → skip rewrite) so `npm run codegen` doesn't break the chain before the operator applies the migration; hand-wrote the deterministic generated file and gated the live drift-check to Task 3"
  - "resolution_config merge guarded with COALESCE(resolution_config,'{}') in case the column is NULL on the info-routing row (info-routing predates Phase 114's resolution_config seeding)"

patterns-established:
  - "Pre-apply codegen tolerance: a codegen reading a table created by an as-yet-unapplied migration treats 'table not found' as a no-op rewrite rather than a hard failure"
  - "RoutingDestinationRow + loadRoutingDestinations clone the SwarmIntentRow + loadSwarmIntents TTL+last-known-good registry-loader pattern exactly"

requirements-completed: [ROUTE-01, ROUTE-02]

# Metrics
duration: 7min
completed: 2026-06-17
---

# Phase 131 Plan 01: Routing registry + Stage-3 wiring Summary

**`public.routing_destinations` brand-aware bucket→mailbox registry (RLS, frozen 8-key seed + unrouted sentinel), the load-bearing info-routing Stage-3 wiring (agent key + held routing gate + unknown→coordinator dispatch), and a single-source DestinationKey codegen — all unit-tested, all 3 migrations APPLIED to remote and LIVE-VERIFIED (Task 3 checkpoint cleared).**

## Performance

- **Duration:** ~7 min (autonomous portion; Task 3 checkpoint pending)
- **Started:** 2026-06-17T06:19:20Z
- **Completed (Tasks 1-2):** 2026-06-17T06:25:59Z
- **Tasks:** 3 of 3 complete (Task 3 blocking-human checkpoint cleared — migrations applied + live-verified)
- **Files modified:** 10

## Accomplishments

- **routing_destinations table (ROUTE-01 / D-01):** one denormalized row per (bucket × brand), RLS triad (service_role FOR ALL + authenticated FOR SELECT, NO anon), UNIQUE (swarm_type, destination_key, brand), idempotent ON CONFLICT seed. Frozen 8-key set (order_entry, verkoop, inspecties, storingen, opleidingen, sollicitaties, algemeen + unrouted sentinel) seeded for the verified (bucket×brand) pairs from charter §2 only; unrouted carries a NULL target_mailbox.
- **(bucket×brand)→mailbox resolution (ROUTE-02):** `loadRoutingDestinations` (TTL cache + last-known-good, clones `loadSwarmIntents`) + pure `resolveRoutingDestination`. Proven cross-brand: (inspecties, fire-control) → fire-control mailbox, not smeba; no-match → null → caller treats as unrouted.
- **Info-routing Stage-3 wiring:** 20260617b sets `stage3_coordinator_agent_key='info-routing-coordinator'`, holds `dry_run_config.stage_3_routing=true` (ROUTE-07 no-forward — reuses the existing held path), seeds `resolution_config.routing_unrouted_threshold=0.6`. 20260617c flips the `unknown` row to `action='swarm_dispatch'`, `swarm_dispatch='pipeline/coordinator.requested'` — the load-bearing change without which the coordinator never fires for info-routing.
- **Codegen single-source:** `gen-routing-destinations.ts` (clone of `gen-intent-types.ts`) emits `DESTINATION_KEYS_BY_SWARM` + `DestinationKey`, wired into the `codegen` npm script.

## Task Commits

1. **Task 1 RED: failing seed migration-parse test** — `4a537946` (test)
2. **Task 1 GREEN: routing_destinations migration + RLS + frozen seed** — `40855c12` (feat)
3. **Task 2 RED: failing loadRoutingDestinations + resolve test** — `6acc8e81` (test)
4. **Task 2 GREEN: wiring migrations + loader + type + resolver + codegen** — `3843018a` (feat)

## Files Created/Modified

- `supabase/migrations/20260617_phase131_routing_destinations.sql` — table + RLS triad + frozen seed + unrouted sentinel
- `supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql` — swarms UPDATE: agent key, stage_3_routing held, unrouted threshold (jsonb merge)
- `supabase/migrations/20260617c_phase131_info_routing_unknown_dispatch.sql` — load-bearing unknown→swarm_dispatch flip
- `web/scripts/gen-routing-destinations.ts` — codegen reads routing_destinations → generated enum (pre-apply tolerant)
- `web/lib/swarms/routing-destinations.generated.ts` — generated `DESTINATION_KEYS_BY_SWARM` + `DestinationKey`
- `web/lib/swarms/types.ts` — `RoutingDestinationRow` interface
- `web/lib/swarms/registry.ts` — `loadRoutingDestinations` (TTL cache) + pure `resolveRoutingDestination` + cache reset
- `web/package.json` — appended `gen-routing-destinations.ts` to the `codegen` script
- `web/lib/swarms/__tests__/routing-destinations-seed.test.ts` — 7 static seed-parse assertions
- `web/lib/swarms/__tests__/routing-resolve.test.ts` — 7 loader + pure-resolver assertions (incl. cross-brand)

## Decisions Made

- **`algemeen` mailbox is the one unverified pair.** Charter §2 lists "Algemeen / contactformulier" but no dedicated mailbox. The `algemeen` bucket must exist in the destination_key set for the 8-key enum, so it is seeded → `algemeen@smeba.nl` with an explicit migration comment requesting operator confirmation at the Task 3 checkpoint. Every other seeded pair maps to a charter §2-verified mailbox.
- **Pre-apply codegen tolerance** (see Deviations Rule 3) — chosen over hard-failing the codegen chain before the operator migration apply.
- **COALESCE guard on resolution_config** — the info-routing row predates Phase 114's resolution_config seeding and may be NULL; `||` on NULL yields NULL, so the merge is wrapped in `COALESCE(resolution_config,'{}')`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Codegen hard-failed on the not-yet-applied routing_destinations table**
- **Found during:** Task 2 (running `npm run codegen` to materialize the generated file)
- **Issue:** The codegen reads the LIVE registry, but `routing_destinations` does not exist remotely until the operator applies 20260617 at the Task 3 checkpoint. PostgREST returned `Could not find the table 'public.routing_destinations' in the schema cache` (PGRST205), which threw and broke the entire `codegen` chain — blocking the Task 2 verify (`npm run codegen && git diff --exit-code`).
- **Fix:** Made `gen-routing-destinations.ts` tolerant of the missing-table case — on a PGRST205 / "could not find the table" error it warns and returns without rewriting (leaving the committed generated file untouched); any OTHER error still throws. Hand-wrote the deterministic generated file (`routing-destinations.generated.ts`) matching the script's exact post-apply output (alphabetically-sorted seeded keys), and the Task 3 checkpoint re-runs codegen after apply with `git diff --exit-code` to prove no drift against live data.
- **Files modified:** web/scripts/gen-routing-destinations.ts, web/lib/swarms/routing-destinations.generated.ts
- **Verification:** `npm run codegen` now completes the chain (prints the pre-apply skip warning); `git diff --exit-code -- lib/swarms/routing-destinations.generated.ts` clean; tsc clean.
- **Committed in:** `3843018a` (Task 2 commit)

**2. [Rule 1 - Bug] resolution_config jsonb merge would null out on a NULL column**
- **Found during:** Task 2 (writing 20260617b)
- **Issue:** `resolution_config || jsonb_build_object(...)` yields NULL if `resolution_config` is NULL (Postgres `||` with a NULL operand). The info-routing swarm row predates Phase 114's resolution_config seeding, so the column may be NULL — the threshold would silently fail to land.
- **Fix:** Wrapped the left operand in `COALESCE(resolution_config, '{}'::jsonb)`.
- **Files modified:** supabase/migrations/20260617b_phase131_info_routing_stage3_wiring.sql
- **Verification:** SQL inspected; merge is now NULL-safe and idempotent. Live confirmation happens at the Task 3 checkpoint.
- **Committed in:** `3843018a` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary to keep the codegen chain green pre-apply and to ensure the threshold actually persists. No scope creep — the dry_run_config merge already used the safe pattern; only resolution_config (potentially NULL) needed the COALESCE.

## Issues Encountered

- The pre-existing Phase 130 comment in `web/lib/stage-1/actionable-tokens.ts` literally contains the string `swarm_type === 'info-routing'` inside a `//` comment documenting the ABSENCE of such a branch. The ROUTE-01/SWARM-02 acceptance grep (`grep -rn "swarm_type === 'info-routing'" web/lib web/scripts`) matches it, but it is a documentation comment, not a code branch — verified by stripping comment lines (no real literal in any file). Out of scope for this plan; left untouched.

## Known Stubs

- **`algemeen` → `algemeen@smeba.nl`** (`20260617_phase131_routing_destinations.sql`) — the only seeded (bucket×brand) pair NOT backed by a charter §2-verified mailbox. Intentional: the bucket must exist for the enum; the mailbox address is operator-confirmed at the Task 3 checkpoint. Documented in the migration comment.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface beyond the planned `routing_destinations` table (covered by the plan's threat model T-131A-01/02).

## User Setup Required

None remaining. The Task 3 operator checkpoint is cleared — bucket set + mailbox completeness + threshold confirmed, all three migrations applied to remote and live-verified. One Phase-132 carry-forward: verify the `algemeen` → `algemeen@smeba.nl` mapping before live forwarding (inert under the ROUTE-07 held gate in Phase 131).

## Task 3 — Operator Checkpoint CLEARED (migrations applied + live-verified)

The orchestrator applied all three migrations to remote (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration` IN ORDER (20260617 → 20260617b → 20260617c) and live-verified the registry + wiring:

- **`public.routing_destinations`** — 12 info-routing rows present (matches the seed count exactly).
- **`swarms` (info-routing)** — `stage3_coordinator_agent_key='info-routing-coordinator'`, `dry_run_config->>'stage_3_routing'='true'` (ROUTE-07 held / no-forward), `resolution_config->>'routing_unrouted_threshold'='0.6'`.
- **`swarm_noise_categories` (info-routing, unknown)** — `action='swarm_dispatch'`, `swarm_dispatch='pipeline/coordinator.requested'` (the load-bearing wiring is live).
- **Security advisors** — 0 ERROR-level lints; `routing_destinations` carries RLS + policy (not flagged).
- **Codegen drift (post-apply)** — `cd web && npm run codegen && git diff --exit-code` is CLEAN. Codegen read the LIVE registry (12 destination rows — no PGRST205 pre-apply skip) and the committed `routing-destinations.generated.ts` matches live data exactly. The hand-written deterministic generated file is now proven against the applied registry.

### ⚠️ PRE-PHASE-132 verification item (algemeen bucket)

The `algemeen` bucket → `algemeen@smeba.nl` is **NOT** in charter §2's verified-mailbox table. The operator confirmed **KEEP for Phase 131** — it is inert under the ROUTE-07 no-forward gate (`stage_3_routing` held, so nothing is forwarded yet). **However, this (bucket×brand)→mailbox pair MUST be verified before Phase 132 enables live forwarding.** Carry this forward as a hard Phase-132 prerequisite: confirm or replace `algemeen@smeba.nl` against a real verified mailbox before any auto-forward side-effect goes live.

## Next Phase Readiness

**Plan 131-01 COMPLETE — all 3 tasks done, migrations applied, registry + wiring + codegen live.**

Wave B (Orq `info-routing-coordinator` agent) and Wave C (coordinator routing capability) are unblocked — they depend on this plan's registry + wiring + codegen'd enum, all of which are now landed and live-verified. Next plan: **131-02 (Wave 2)**.

**Phase-132 carry-forward:** verify the `algemeen` → `algemeen@smeba.nl` mapping (the one unverified pair) before live forwarding (see ⚠️ above).

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 4 task commits (`4a537946`, `40855c12`, `6acc8e81`, `3843018a`) verified in git log. Task 3 checkpoint cleared: 3 migrations applied + live-verified (12 rows, agent key, held gate, dispatch flip); post-apply codegen drift check clean.

---
*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Completed: 2026-06-17 — all 3 tasks done, Task 3 operator checkpoint cleared (migrations applied + live-verified)*
