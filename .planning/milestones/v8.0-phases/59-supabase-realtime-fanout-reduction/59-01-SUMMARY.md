---
phase: 59-supabase-realtime-fanout-reduction
plan: 01
subsystem: realtime/swarm-dashboard
tags: [realtime, supabase, broadcast, perf, fan-out, swarm-bridge]
status: complete
completed: 2026-04-26
dependency_graph:
  requires: []
  provides:
    - "events-stale broadcast contract on swarm:{swarmId}"
  affects:
    - "web/components/v7/swarm-realtime-provider.tsx (consumer)"
    - "web/lib/automations/swarm-bridge/sync.ts (emitter)"
    - "web/lib/inngest/functions/orqai-trace-sync.ts (emitter, currently event-only)"
tech_stack:
  added: []
  patterns:
    - "Server-emitted batched broadcast + client refetch (replaces postgres_changes for hot tables)"
key_files:
  created: []
  modified:
    - web/lib/automations/swarm-bridge/sync.ts
    - web/lib/inngest/functions/orqai-trace-sync.ts
    - web/components/v7/swarm-realtime-provider.tsx
decisions:
  - "Emit 1 events-stale broadcast/tick instead of 50–200 row-level postgres_changes msgs"
  - "Client refetch via existing fetchSnapshot — no new client primitive"
  - "Broadcast emission wrapped in try/catch, logs only — never breaks bridge tick (15s poll is safety net)"
  - "orqai-trace-sync wired now even though cron is paused (Phase 58) — Just Works when re-enabled"
metrics:
  duration_minutes: 12
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
  commits: 1
---

# Phase 59 Plan 01: agent_events broadcast swap — Summary

Replaced `agent_events` postgres_changes subscription on `swarm:{swarmId}` with a single end-of-tick `events-stale` broadcast emitted from the bridge sync (and the paused orqai-trace-sync), cutting ~99% of message volume on the hottest realtime fan-out path.

## What Changed

### Server emitters (Task 1)

**`web/lib/automations/swarm-bridge/sync.ts`** — at the end of `syncSwarmBridge()`, after the agent_events delete+insert and the swarm_agents metric refresh, emit one broadcast on `swarm:{swarmId}`:

```typescript
const broadcastChannel = admin.channel(`swarm:${swarmId}`);
await broadcastChannel.send({
  type: "broadcast",
  event: "events-stale",
  payload: { reason: "bridge-sync", at: new Date().toISOString() },
});
admin.removeChannel(broadcastChannel);
```

Wrapped in try/catch with `console.warn` on failure — broadcast emission never breaks the bridge tick (the 15s client poll is the documented safety net for dropped messages).

**`web/lib/inngest/functions/orqai-trace-sync.ts`** — same pattern at the end of `syncSwarm()`, gated on `insertedThisSwarm > 0` so we don't emit when no events landed. This function is currently event-triggered (cron paused per Phase 58); wiring the broadcast now means the moment Executive Dashboard work resumes and the cron is re-enabled, fan-out reduction is already in place. Same try/catch contract.

### Client listener (Task 2)

**`web/components/v7/swarm-realtime-provider.tsx`** — removed the `agent_events` postgres_changes block (formerly the first of 4 `.on("postgres_changes", ...)` chains) and replaced it with:

```typescript
.on("broadcast", { event: "events-stale" }, () => {
  fetchSnapshot();
})
```

The existing `fetchSnapshot` SELECTs all 4 tables. We piggyback rather than refactor it to events-only because bridge ticks are rare enough (1 per 2 minutes during business hours) that re-fetching jobs/agents/briefings on the same tick costs nothing and keeps the data path simple. The 15s `setInterval(fetchSnapshot, POLL_INTERVAL_MS)` stays exactly as-is — safety net for dropped broadcasts, unchanged.

The 3 other postgres_changes blocks (`swarm_jobs`, `swarm_agents`, `swarm_briefings`) are untouched per CONTEXT.md scope. `applyMutation` is still used by all three. `AgentEvent` import is still required (typed in `fetchSnapshot` setBundle).

### Commit (Task 3)

One atomic commit `8e6759d` on the worktree branch:
> `perf(realtime): swap agent_events postgres_changes for batched broadcast (Phase 59 D-01)`

## Verification

- `pnpm tsc --noEmit` clean for all 3 files (pre-existing errors in unrelated files — missing `@dnd-kit/*`, `@orq-ai/node`, `.next/dev/types` — are out of scope per phase-execute scope_boundary).
- Commit message contains "Phase 59 D-01" — `git log -1 --format="%s" | grep -q "Phase 59 D-01"` passes.
- `applyMutation` retained, used by 3 surviving postgres_changes blocks.
- `setInterval(fetchSnapshot, 15_000)` retained as safety net.
- Channel name `swarm:{swarmId}` matches between server emit and client listen — verified by grep across the 3 files (`grep -n "swarm:\${swarm" web/lib/automations/swarm-bridge/sync.ts web/lib/inngest/functions/orqai-trace-sync.ts web/components/v7/swarm-realtime-provider.tsx`).

Manual smoke verification (post-merge, deferred to phase-level VERIFICATION.md per CONTEXT.md D-04):
- Open `/swarm/{swarmId}` for an active bridge swarm, trigger a bridge tick, confirm `agent_events` list updates within 2s.
- Confirm 15s poll still fires (network tab: `agent_events` SELECT every 15s).
- Confirm jobs/agents/briefings still update via existing postgres_changes path.

## Deviations from Plan

None — plan executed exactly as written. The plan placed the broadcast "at the end of `syncSwarmBridge()` ... before returning the result" and gave latitude on whether to wrap in `step.run`; sync.ts itself is not Inngest-wrapped (the calling function is), so the broadcast is emitted directly inside `syncSwarmBridge` per the plan's "REUSE the already-bound `admin` client" instruction.

## Threat Flags

None. No new trust boundaries introduced; broadcast payload is `{reason, at}` only (no row data) — same risk profile noted in plan's STRIDE register (T-59.01-01 mitigated, T-59.01-02 mitigated, T-59.01-03/04 accepted).

## Self-Check: PASSED

- web/lib/automations/swarm-bridge/sync.ts contains "events-stale" — FOUND
- web/lib/inngest/functions/orqai-trace-sync.ts contains "events-stale" — FOUND
- web/components/v7/swarm-realtime-provider.tsx contains "events-stale" — FOUND
- Commit 8e6759d in git log — FOUND
