---
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
plan: 02
subsystem: api
tags: [stage-2, resolver, sales, corroboration, resolver-index, nxt-sql]

# Dependency graph
requires:
  - phase: 120-01
    provides: scoreCorroboration helper + CorroborationConfig + config-gated engine branch
provides:
  - "Sales offerte/order lookups resolve via the resolver_index SQL back-search (REST→SQL, D-09)"
  - "Sales adapter collect-then-score via the SHARED scoreCorroboration helper, gated on config.corroboration (SWARM-02)"
  - "SalesCustomerMatch carries identifier_kind + status (the corroboration signal shape)"
affects: [120-03-config-seed, 120-04-correctness-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sales reuses the shared pure scorer with ZERO swarm-name branch — gate is config DATA (config.corroboration)"
    - "Per-step runner shared by both paths (no-corr short-circuit / corroboration collect) so they cannot diverge"
    - "Kind-disambiguation on returned resolver_index rows (same digits span quote_no + order_no for different parties)"

key-files:
  created:
    - web/lib/automations/sales-email/lookups/__tests__/offerte-backsearch.test.ts
    - web/lib/automations/sales-email/lookups/__tests__/order-backsearch.test.ts
    - web/lib/automations/sales-email/lookups/__tests__/sites-backsearch.test.ts
    - web/lib/automations/sales-email/__tests__/corroboration-sales.test.ts
    - .planning/todos/pending/2026-06-17-extend-resolver-index-postcode-kind.md
  modified:
    - web/lib/automations/sales-email/lookups/offerte.ts
    - web/lib/automations/sales-email/lookups/order.ts
    - web/lib/automations/sales-email/lookups/sites.ts
    - web/lib/automations/sales-email/resolve-customer.ts
    - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
    - web/scripts/spike-011b-sales-resolution-lift.ts

key-decisions:
  - "Task 0 checkpoint resolved: substrate LIVE (target_url real, BX+brand_scope admitted, allowed_for_intents includes 'unknown'). Verified SB014098→quote_no→14098→BX228895 (Bever B.V.)."
  - "Kind ambiguity discovered: 14098 is BOTH quote_no (BX228895) AND order_no (BX490393) — each lookup MUST filter returned rows by its identifier_kind before the unique-in-scope pick."
  - "Postcode→Site PAUSED (operator-approved): resolver_index has no postcode index (site_no = numeric site numbers). sites.ts uses the back-search shape, returns null fail-closed, self-enables when a postcode kind lands. Todo recorded."
  - "Dedicated sales allowed_for_intents entry DEFERRED to Plan 03 (registry migration); Task 1 lookups call with 'unknown' (already allowlisted) to avoid cross-plan file ownership + live-inertness."

patterns-established:
  - "REST→SQL transport switch keeps REST infra (nxtRequest, _match.ts) for non-resolution callers (order-entry, operator widget)"
  - "Sales lookup files hold per-swarm scope constants (BX/SB); shared engine + scorer stay swarm-agnostic"

requirements-completed: [CORR-04, CORR-05]

# Metrics
duration: ~50min
completed: 2026-06-17
---

# Phase 120-02: Sales Corroboration + REST→SQL Transport Summary

**Sales offerte/order resolution switched to the resolver_index SQL back-search and routed through the SAME pure scoreCorroboration helper as the debtor engine — gated on config.corroboration with zero swarm-name branch (SWARM-02). Postcode→Site paused fail-closed (no postcode index in resolver_index).**

## Performance
- **Duration:** ~50 min (incl. Task 0 checkpoint + substrate investigation)
- **Completed:** 2026-06-17
- **Tasks:** 3 (Task 0 checkpoint + Task 1 + Task 2)
- **Files modified:** 11 (6 modified, 5 created)

## Accomplishments
- **Task 0 (checkpoint):** verified the `nxt.resolve_candidates` substrate is live for sales and the `SB014098→BX228895` ground-truth; surfaced the kind-ambiguity nuance (14098 = quote_no AND order_no).
- **Task 1:** migrated offerte (`quote_no`) + order (`order_no`) from the nxtRequest REST proxy to the resolver_index SQL back-search with mandatory kind-disambiguation; paused postcode→Site fail-closed; preserved REST infra for non-resolution callers.
- **Task 2:** sales adapter collects a signal from every precedence step and scores via the shared `scoreCorroboration` helper when `config.corroboration` is present, with a single per-step runner shared by both paths — no swarm-name branch.

## Task Commits
1. **Task 1: REST→SQL transport migration (offerte/order; sites paused)** — `93def662` (feat)
2. **Task 2: sales corroboration via the shared helper (SWARM-02)** — `6aeda6c7` (test)

_Note: the plan declares Task 1 (transport) and Task 2 (corroboration) INSEPARABLE (Pitfall 3 — corroboration cannot fire over REST). The adapter rewrite (both the new lookup-call signatures and the collect-then-score path) lands in the Task 1 commit; the Task 2 commit adds the SWARM-02 acceptance test._

## Files Created/Modified
- `lookups/offerte.ts` / `order.ts` — resolver_index back-search, kind-filtered, carry identifier_kind + status
- `lookups/sites.ts` — back-search shape, postcode path paused (no postcode kind), self-enabling
- `resolve-customer.ts` — config.corroboration-gated collect-then-score via shared helper; per-step runner; no swarm-name branch
- `__tests__/{offerte,order,sites}-backsearch.test.ts` — transport + kind-disambiguation + fail-closed proofs
- `__tests__/corroboration-sales.test.ts` — boost/demote/lone-signal via the shared scorer
- `__tests__/resolve-customer.test.ts` — updated to the new SQL transport (behavior unchanged)
- `scripts/spike-011b-sales-resolution-lift.ts` — call sites updated to the new lookup signature

## Decisions Made
See key-decisions frontmatter.

## Deviations from Plan
- **Postcode→Site paused** (operator-approved via AskUserQuestion): the plan assumed a `postcode`/`site_no` kind resolves postcodes; resolver_index has no postcode index. Migrated offerte+order, paused sites fail-closed, recorded a todo to extend resolver_index. ~55% of sales identifier volume paused until that extension lands.
- **resolve-customer.test.ts updated** (not in the plan's files_modified): the transport migration invalidated its nxtRequest-based mocks; updated to mock `lookupResolveCandidates`. No-corr behavior unchanged.
- **Dedicated sales `allowed_for_intents` entry deferred to Plan 03** (operator requested "add entry"): recorded as a one-row registry UPDATE in the Plan 03 sales migration; Task 1 lookups call with `"unknown"` (already allowlisted).

## Issues Encountered
- Kind ambiguity (14098 = quote_no + order_no for different parties) — resolved by mandatory per-kind filtering on returned rows before the unique-in-scope pick.

## User Setup Required
None in this plan. Plan 03 will add the dedicated sales `allowed_for_intents` registry entry.

## Next Phase Readiness
- Sales + resolve suites green (142 passed, 3 skipped); `tsc --noEmit` exit 0; all acceptance greps pass (no nxtRequest in the 3 lookups, scoreCorroboration wired, no swarm-name branch).
- Plan 03 can now re-seed both swarms' resolution_config to opt into corroboration, add the dedicated sales `allowed_for_intents` entry, and apply to live Supabase.

---
*Phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm*
*Completed: 2026-06-17*
