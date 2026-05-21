# Phase 59 — Discussion Log

**Date:** 2026-04-26
**Phase:** 59 (Supabase realtime fan-out reduction)
**Mode:** discuss (default)

---

## Domain framing presented

Reduce Supabase realtime message volume below the 5.5M/mo cap (currently 6.5M, grace until 2026-05-26) by changing how the dashboard subscribes to row changes — without regressing the "live" feel of the swarm dashboard or the automation review board.

Carrying forward from Phase 58: cron writes are already cut ~74%, so postgres_changes fan-out is automatically reduced. Phase 59 was scoped to remain conservative: still ship the architectural fixes, but the latency/risk budget can be looser since cron pressure is gone.

---

## Gray areas discussed

### Area 1 — Sequencing

**Question:** How to sequence Phase 59 against the Phase 58 measurement window?

**Options presented:**
1. Measure first, then scope (lowest risk, narrowest precision)
2. Ship now, full scope (RECOMMENDED) — beat the 2026-05-26 grace deadline with margin
3. Ship the cheapest fix only (automation_runs server-side filter)

**User chose:** **Ship now, full scope.**

**Rationale:** Risk of over-engineering is acceptable; risk of missing the grace deadline is not.

---

### Area 2 — `agent_events` strategy

**Question:** How to cut the postgres_changes fan-out on `agent_events` (the hottest table; pipeline runs insert hundreds of span rows per run)?

**Options presented:**
1. Batched broadcast + refetch (RECOMMENDED) — bridge tick emits 1 msg/tick instead of 50–200
2. Drop subscription, rely on existing 15 s poll only
3. Keep subscription, rate-limit the writer

**User chose:** **Batched broadcast + refetch.**

**Rationale:** Best leverage on the hottest table; client-side latency stays at parity with today (broadcast fires immediately on bridge completion); the 15 s poll already exists as a safety net.

---

### Area 3 — `automation_runs` strategy

**Question:** `automation_runs` has no server-side filter (LIKE not supported in postgres_changes filter). Every row change broadcasts to every connected dashboard. Fix?

**Options presented:**
1. Add `automation_prefix` generated column + filter (originally RECOMMENDED)
2. Subscribe per known automation name (brittle as automations grow)
3. Replace with broadcast-driven refetch

**User pushback:** "As project names change and get redefined as projects grow, is this the most reliable fix?"

**Reframing:** Pointed out that a generated column locks grouping into write-time schema and silently mis-routes rows after renames. The refetch pattern keeps filter logic in the SELECT (single source of truth, easy to update) and stays consistent with the agent_events decision.

**Follow-up question:** "Switch to broadcast-driven refetch (consistent with the agent_events choice)?"
- Yes — broadcast-driven refetch (RECOMMENDED)
- Stick with the prefix column
- Hybrid — automation_id FK to a registry table

**User chose:** **Yes — broadcast-driven refetch.**

**Rationale:** Resilience to renames > schema purity. Consistent pattern with decision #1.

**Captured as feedback memory** (`feedback_realtime_filter_resilience.md`) so future sessions default to this preference.

---

### Area 4 — Pipeline broadcast coalescing

**Question:** `pipeline.ts` has 22 broadcastStepUpdate/broadcastRunUpdate call sites. Rapid status flips emit one msg per flip. Worth coalescing?

**Options presented:**
1. Server-side debounce in broadcast.ts (RECOMMENDED) — caller-side API unchanged
2. Skip — Phase 58 already cut writes enough, defer until measurement says otherwise
3. Caller-side rewrite of all 22 sites

**User chose:** **Server-side debounce.**

**Rationale:** Backward-compatible API means no risk to the 22 callers. Standard pattern. 500 ms ceiling on staleness is imperceptible to humans on a dashboard.

**Caveat captured in CONTEXT.md:** chat messages are NOT debounced (each turn is distinct user/assistant content; collapsing would lose data).

---

## Deferred ideas

- Generic `useRealtimeTable` consolidation audit (multiple subs to same table on same page).
- Migrate low-churn `swarm_agents` / `swarm_briefings` to broadcast pattern — measurement-dependent.
- `automation_id` FK + registry table — bigger refactor, deferred until automation library grows.
- Replacing pipeline broadcasts with row-level CDC — invasive; out of scope for grace deadline.

---

## Scope creep redirected

None during this discussion.

---

## Claude's discretion

- Picked 500 ms as the debounce window (decision #3) — balances UI feel vs message reduction. Researcher/planner can adjust if measurement suggests a different sweet spot.
- Picked <2M msgs/mo (50% margin under cap) as the success threshold for verification. Tighter than "just under 5.5M", looser than "near zero" — gives Phase 60 room to be optional.
- Recommended app-layer broadcast emission for `automation_runs` over Postgres triggers, but flagged it as a researcher decision pending the question "is automation_runs ever written from outside the app?" (e.g., direct Zapier inserts).

---

## Next steps

`/clear` then:

```
/gsd-plan-phase 59
```

Researcher will read CONTEXT.md, confirm the trigger-vs-app-layer question for decision #2, and produce 59-RESEARCH.md. Planner produces 59-01-PLAN.md as a single Wave with 3 atomic commits.
