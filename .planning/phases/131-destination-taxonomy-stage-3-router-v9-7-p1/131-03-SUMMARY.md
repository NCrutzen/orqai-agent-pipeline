---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
plan: 03
subsystem: inngest-coordinator
tags: [inngest, stage-3-router, info-routing, verdict, orq, zod, typescript, route-07]

# Dependency graph
requires:
  - phase: 131-01
    provides: routing_destinations registry + loadRoutingDestinations + resolveRoutingDestination + info-routing Stage-3 wiring (agent key, stage_3_routing held, unknown→coordinator dispatch, resolution_config threshold)
  - phase: 131-02
    provides: info-routing-coordinator Orq agent (live) + coordinator-schema.ts closed-list Zod gate (parseAgentOutputOrUnrouted → unrouted, never throws)
  - phase: 113-stage-3-sales-intent-agent
    provides: isStage3RoutingGated held gate reused verbatim as the ROUTE-07 no-forward mechanism
provides:
  - buildRoutingVerdict — pure 6-field routing verdict builder (RESEARCH §Discretion 2 shape) with the unrouted gate (below-threshold OR no-match OR invalid → unrouted) + optional dedup arg (Plan 04 seam)
  - additive registry-gated Stage-3 ROUTING capability in the generic coordinator (debtor-email-coordinator.ts) — runs iff loadRoutingDestinations returns rows; persists decision_details.routing + TELE-01 dual-write in one step.run; routes through the held gate (ROUTE-07 no-forward)
  - ROUTE-07 grep + behaviour gate proving no forward/move/sendMail + no Stage-2 invoke reachable from the routing path
affects: [131-04-dedup, 132-forward-side-effect-bulk-review, stage-3-coordinator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-gated composable Stage-3 capability: the routing block runs iff loadRoutingDestinations(swarm_type) returns rows (info-routing), parallel to the existing stage3AgentKey/intentSchema/isStage3RoutingGated seams — debtor/sales get [] and are byte-neutral, zero swarm_type literal"
    - "Routing-vs-intent path selection by capability presence (not by swarm literal): a routing swarm runs the routing classifier (info-routing-coordinator returns a routing-shaped output) and the intent ranked-list path is skipped — the two Stage-3 shapes never collide"
    - "Verdict reuses the Stage-3 persistence path (D-02): decision_details.routing + emitPipelineEvent TELE-01 in the SAME step.run (single replay boundary), keyed off the replay-safe run_id — no routing_verdicts table"

key-files:
  created:
    - web/lib/automations/info-routing/verdict.ts
    - web/lib/automations/info-routing/__tests__/routing-unrouted.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-routing-verdict.test.ts
    - web/lib/inngest/functions/__tests__/routing-no-forward-gate.test.ts
  modified:
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-stage3-routing-gate.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-agent-key-dispatch.test.ts
    - web/lib/inngest/functions/__tests__/coordinator-intent-label-emit.test.ts

key-decisions:
  - "Routing swarms run the routing classifier and SKIP the intent ranked-list path (return early through the held gate). Necessary correctness fix: the info-routing-coordinator agent returns a routing-shaped output (bucket/brand/confidence/reasoning), which the debtor V2/V3 fail-safe schema in the existing classify-intent step would reject — running both paths would crash the coordinator for info-routing. The selection is purely capability-gated (routingDestinations.length > 0), NOT a swarm_type literal."
  - "buildRoutingVerdict carries the agent's confidence through even on the unrouted-because-low-confidence path (audit trail); invalid-output unrouted defaults confidence to 'low'. dedup is an optional 4th parameter defaulting to {status:'routable', matched_layer:null} so Plan 04 wires the real two-layer dedup without a signature break."
  - "Threshold read from swarms.resolution_config.routing_unrouted_threshold via the already-cached loadSwarm, defaulting to 0.6 (require ≥ medium) when absent — matches the Plan 01 seed and keeps the knob registry-driven (SWARM-02)."

patterns-established:
  - "Capability-presence path selection inside the shared coordinator: a registry-gated block can take an EARLY RETURN through the existing held gate, leaving the legacy path byte-unchanged for swarms that don't opt in (debtor/sales get [] → fall through to the intent path)"

requirements-completed: [ROUTE-04, ROUTE-06, ROUTE-07]

# Metrics
duration: 9min
completed: 2026-06-17
---

# Phase 131 Plan 03: Coordinator Stage-3 routing capability + 6-field verdict Summary

**The additive registry-gated Stage-3 ROUTING capability wired into the generic coordinator: it invokes the `info-routing-coordinator` agent, Zod-gates the output, resolves (bucket×brand)→mailbox, builds the pure 6-field verdict (with the below-threshold-OR-no-match→unrouted gate), and persists it to `coordinator_runs.decision_details.routing` + a TELE-01 `pipeline_events` dual-write in one replay-safe `step.run` — then routes through the existing held gate so the predicted-emit is withheld (ROUTE-07 no-forward, no Stage-2, free). debtor/sales get `[]` and are byte-neutral; zero `swarm_type` literal. All 3 tasks committed; full suite 2790 green; tsc clean; no codegen drift.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-17T07:18:11Z
- **Completed:** 2026-06-17T07:27:38Z
- **Tasks:** 3 of 3 complete
- **Files created:** 4 · **Files modified:** 5

## Accomplishments

- **`buildRoutingVerdict` (Task 1, ROUTE-04 / ROUTE-06):** a pure, IO-free builder returning the RESEARCH §Discretion 2 shape `{ bucket, brand, target_mailbox, confidence, dedup{status,matched_layer}, unrouted, routing_version }`. The unrouted gate fires on ANY of: the `{unrouted:true}` marker (invalid/empty agent output, never throws), a confidence mapping below the threshold (low/medium/high → 0.33/0.66/1.0; require ≥ `routing_unrouted_threshold`), or no active `(destination_key===bucket AND brand===brand)` registry row — always the explicit `bucket='unrouted'`, never a forced bucket. `dedup` is an optional 4th param (defaults `routable`) so Plan 04 wires the real dedup without a signature break. 7 unit tests green (resolve, below-threshold, no-match, invalid-output-no-throw, cross-brand fire-control, medium-floor, optional dedup).
- **Additive routing capability in the coordinator (Task 2, ROUTE-04):** `const routingDestinations = await step.run("load-routing-destinations", …)` ([] for debtor/sales → block skipped → byte-neutral). Inside `if (routingDestinations.length > 0)`: invoke the per-swarm classifier via `invokeOrqAgent(stage3AgentKey, …)`, `parseAgentOutputOrUnrouted`, read the threshold from `resolution_config`, `buildRoutingVerdict`, then persist `decision_details.routing = verdict` THEN `emitPipelineEvent({stage:3, decision:verdict.bucket, decision_details:{routing:verdict}, …})` inside the SAME `step.run` (single replay boundary), keyed off the replay-safe `run_id`. The routing path then runs the held gate and returns early — the intent ranked-list path is skipped for routing swarms. 4 mocked-supabase tests green (6-field verdict + TELE-01 decision=bucket, cross-brand mailbox, invalid→unrouted, debtor byte-neutral).
- **ROUTE-07 grep + behaviour gate (Task 3):** a static gate asserts the coordinator and every non-test `info-routing` module carry NO `sendMail`/`.forward(`/`/move` token and NO Stage-2 resolver invocation (`resolveEntity`/`loadStage2Resolver`/`stage-2-customer-resolver`) reachable from the routing path; a behaviour gate asserts info-routing held (`stage_3_routing=true`) persists the verdict but emits NO `pipeline/predicted`, returns `predicted_held`, and `agent_runs` stays `classifying`. 5 tests green.

## Task Commits

1. **Task 1 RED: failing unrouted verdict test** — `49306024` (test)
2. **Task 1 GREEN: buildRoutingVerdict** — `ad164444` (feat)
3. **Task 2: additive routing capability block + verdict persistence + 4 mock-patches** — `1c55b154` (feat)
4. **Task 3: ROUTE-07 grep + held-behaviour gate** — `333416a1` (test)

## Files Created/Modified

- `web/lib/automations/info-routing/verdict.ts` — pure 6-field verdict builder + unrouted gate + ROUTING_VERSION + optional dedup param
- `web/lib/automations/info-routing/__tests__/routing-unrouted.test.ts` — 7 verdict-builder assertions
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — additive `routingDestinations.length>0` capability block (invoke → parse → threshold → verdict → persist + TELE-01 → held gate → early return); 3 new imports (loadRoutingDestinations, invokeOrqAgent, parseAgentOutputOrUnrouted/buildRoutingVerdict)
- `web/lib/inngest/functions/__tests__/coordinator-routing-verdict.test.ts` — 4 mocked-supabase verdict-persistence assertions
- `web/lib/inngest/functions/__tests__/routing-no-forward-gate.test.ts` — 5 ROUTE-07 grep + behaviour assertions
- `web/lib/inngest/functions/__tests__/{debtor-email-coordinator,coordinator-stage3-routing-gate,coordinator-agent-key-dispatch,coordinator-intent-label-emit}.test.ts` — added `loadRoutingDestinations: vi.fn().mockResolvedValue([])` to each registry mock (Deviation 1)

## Decisions Made

- **Routing swarms skip the intent path.** The info-routing-coordinator returns a routing-shaped output; the existing `classify-intent` step would Zod-reject it against the debtor V2/V3 fail-safe schema and crash. So the routing block takes an early return (through the held gate) and the intent ranked-list path never runs for a routing swarm. Selection is `routingDestinations.length > 0` — capability-gated, NOT a `swarm_type` literal (SWARM-02 preserved; debtor/sales get `[]` → fall through to the unchanged intent path).
- **Verdict reuses the Stage-3 persistence path (D-02).** `decision_details.routing` + `emitPipelineEvent` TELE-01 in one `step.run`; no `routing_verdicts` table. Bulk Review (Phase 132) reads `decision_details->routing` for free.
- **ROUTE-07 is free.** Seeded `stage_3_routing=true` (Plan 01) → `isStage3RoutingGated` → held path withholds the predicted-emit → the Stage 3.5 dispatcher never fires → no Stage 4, no forward. No new gating code; the OPEN-path emit is kept (unreached this phase) so the capability is reversible without a code change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New `loadRoutingDestinations` import broke 4 existing coordinator-test registry mocks**
- **Found during:** Task 2 (running coordinator parity tests after adding the import)
- **Issue:** The coordinator now imports + calls `loadRoutingDestinations` from `@/lib/swarms/registry`. Four existing coordinator-handler tests (`debtor-email-coordinator`, `coordinator-stage3-routing-gate`, `coordinator-agent-key-dispatch`, `coordinator-intent-label-emit`) mock that module with an explicit export list that did NOT include `loadRoutingDestinations` → vitest threw `No "loadRoutingDestinations" export is defined on the mock` at the new call site → 17 parity tests failed.
- **Fix:** Added `loadRoutingDestinations: vi.fn().mockResolvedValue([])` to each of the 4 registry mocks (debtor/sales correctly get `[]` → routing block skipped → those tests exercise the unchanged intent path). The two NEW tests this plan authored already include the export plus a real `resolveRoutingDestination` pass-through.
- **Files modified:** the 4 listed coordinator test files
- **Verification:** all 6 coordinator test files (34 tests) green; full suite 2790 green.
- **Committed in:** `1c55b154` (Task 2 commit)

**2. [Rule 1 - Bug] `pipeline/predicted` payload rejects `null` for language/urgency**
- **Found during:** Task 2 (`tsc --noEmit`)
- **Issue:** The OPEN-path emit (unreached this phase, kept for reversibility) initially set `language: null, urgency: null`, but the `pipeline/predicted` event payload types those as `string | undefined` → `TS2322: Type 'null' is not assignable`.
- **Fix:** Set them to `""` (empty string) on the held/unreached OPEN path — no runtime impact (the path is gated off by `stage_3_routing=true`), keeps tsc clean.
- **Files modified:** web/lib/inngest/functions/debtor-email-coordinator.ts
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `1c55b154` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking mock-patch, 1 type bug). No scope creep — both are mechanical consequences of adding the new import; the routing behaviour matches the plan exactly.

## Issues Encountered

- The pre-existing Phase 130 `//` comment in `web/lib/stage-1/actionable-tokens.ts` literally contains `swarm_type === 'info-routing'` inside a comment documenting the ABSENCE of such a branch (already noted in 131-01-SUMMARY). The SWARM-02 grep matches it but it is documentation, not a code branch — verified by stripping comment lines (no real literal in any file, including the coordinator). Out of scope; left untouched.

## Known Stubs

- **dedup defaults to `{status:'routable', matched_layer:null}`** in `buildRoutingVerdict` and the coordinator block. This is intentional and documented in the plan: Plan 04 supplies the real two-layer (To/CC + message-id) dedup result via the optional 4th parameter. The verdict shape is final; only the dedup VALUE is a placeholder until Plan 04. No stub that prevents the plan's goal — the verdict is fully built, persisted, and queryable today.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface beyond the planned verdict persistence. The threat register dispositions are all mitigated: T-131C-01 (off-list bucket → Zod + no-match unrouted), T-131C-02 (accidental side-effect → held gate + ROUTE-07 grep/behaviour gate), T-131C-03 (replay → reuse the replay-safe run_id, all writes in step.run), T-131C-04 (swarm literal → capability-gated, grep green).

## Verification

- `cd web && npm test` → 326 files / **2790 passed**, 23 files / 41 tests skipped, 95 todo (full suite, debtor coordinator parity preserved).
- `npx tsc --noEmit` → clean.
- `npm run codegen && git diff --exit-code` → **no drift** (routing-destinations.generated.ts + intent.generated.ts unchanged).
- `grep -rn "swarm_type === 'info-routing'" web/lib` → only the pre-existing Phase 130 comment; **no code literal**.
- `grep -rn "sendMail\|\.forward(\|/move" web/lib/automations/info-routing` (non-test) → **none**.
- `grep -c "sendMail\|\.forward(\|/move" web/lib/inngest/functions/debtor-email-coordinator.ts` → **0**.
- All three Wave-C tests green: routing-unrouted (7), coordinator-routing-verdict (4), routing-no-forward-gate (5).

## Next Phase Readiness

**Plan 131-03 COMPLETE — all 3 tasks done, the 6-field verdict is built, persisted, and held (no forward) for info-routing.**

- **Plan 131-04 (Wave D — dedup)** is unblocked: `buildRoutingVerdict` already accepts the optional `dedup` arg; Plan 04 builds `extractRecipientAddresses` + `normalizeMessageId` + the two-layer guard and passes the real `RoutingDedup` into the coordinator block (no signature break).
- **Plan 131-05 (Wave E — shadow harness)** is unblocked: it reads `coordinator_runs.decision_details->routing->>'bucket'` which this plan now writes.
- **Phase 132 (forward + Bulk Review)** reads the persisted `decision_details.routing` verdict (target_mailbox, dedup.status, unrouted) — the contract is now live and held.

## Self-Check: PASSED

All 4 created files + 5 modified files verified present; all 4 task commits (`49306024`, `ad164444`, `1c55b154`, `333416a1`) verified in git log. Full suite 2790 green; tsc clean; no codegen drift.

---
*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Completed: 2026-06-17 — all 3 tasks done; routing verdict capability live + held (ROUTE-04/06/07)*
