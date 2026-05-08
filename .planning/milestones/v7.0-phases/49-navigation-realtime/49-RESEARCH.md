# Phase 49: Navigation & Realtime - Research

**Researched:** 2026-04-16
**Domain:** Next.js 16 App Router + Supabase Realtime postgres_changes (single-channel multi-event distribution via React Context)
**Confidence:** HIGH (Phase 48 already validated the V7 stack and Supabase Realtime publication)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New V7 sidebar component (`web/components/v7/swarm-sidebar.tsx`); legacy app-sidebar untouched. Branch in (dashboard) layout based on pathname.
- **D-02:** Swarm list loaded server-side from `projects` table filtered by `project_members`. SSR initial render; Realtime updates.
- **D-03:** Mini-stats use a separate dashboard-wide Realtime subscription (`dashboard:swarms`) listening to `swarm_jobs` and `swarm_agents` table-wide.
- **D-04:** Sidebar uses V7 tokens via Tailwind arbitrary values (`bg-[var(--v7-glass-bg)]` style) -- same approach as `web/components/ui/glass-card.tsx`.
- **D-05:** Active swarm highlight is URL-driven (no localStorage). 3px left teal accent bar + `--v7-teal-soft` background.
- **D-06:** Empty-state copy: "No swarms configured" + body from UI-SPEC.
- **D-07:** Route is `/swarm/[swarmId]/page.tsx` under (dashboard) group. Inherits auth + project_members gate.
- **D-08:** Route layout (`/swarm/[swarmId]/layout.tsx`) wraps page in `<SwarmRealtimeProvider swarmId>`, validates per-swarm `project_members` access; otherwise `notFound()`.
- **D-09:** Page renders V7 layout shell with `<GlassCard>` placeholder regions captioned with destination phase.
- **D-10:** ONE Supabase Realtime channel per swarm view, channel name `swarm:${swarmId}`, owned by `SwarmRealtimeProvider`.
- **D-11:** Provider subscribes to `postgres_changes` for 4 V7 tables filtered by `swarm_id=eq.${swarmId}` on the same channel.
- **D-12:** Provider exposes `{ events, jobs, agents, briefings, status }` context value; initial snapshots fetched on mount, then mutated by Realtime events.
- **D-13:** Public hook `useRealtimeTable(tableName)` returns `{ rows, status }` typed array per table.
- **D-14:** Provider tears down on unmount via `supabase.removeChannel(channel)` cleanup. Next.js layout unmounts when dynamic segment changes.
- **D-15:** Subscription status tracked + exposed; Supabase auto-reconnect handles transient errors.
- **D-16:** No ring buffer in Phase 49 (deferred Phase 52).
- **D-17:** Sidebar's separate `dashboard:swarms` channel is allowed (RT-01 constrains the swarm-view channel count, sidebar is layout chrome).
- **D-18:** Sidebar subscription listens to `swarm_jobs` and `swarm_agents` without swarm_id filter; recomputes counts in memory.
- **D-19:** "Active jobs" = `swarm_jobs.stage IN ('ready','progress','review')`. "Agent count" = total `swarm_agents` rows for swarm.

### Claude's Discretion

- Tailwind utility vs `@layer` styles (we go with arbitrary values to match Phase 48 GlassCard)
- Suspense streaming vs blocking SSR for swarm list (we go with blocking SSR -- list is small, simple)
- Skeleton appearance for initial fetch
- Internal file split inside `web/components/v7/`
- Hand-written vs schema-generated TypeScript types (we hand-write -- 4 tables, schema is small and stable)
- Test approach (we use real Supabase integration tests for the hook + provider per CLAUDE.md guidance)

### Deferred Ideas (OUT OF SCOPE)

- Smart filter buttons (NAV-04) -- Phase 52
- Ring buffer for agent_events -- Phase 52
- localStorage "last visited swarm" -- not in scope
- Optimistic mini-stats UI -- not needed
- Migrate legacy sidebar to V7 tokens -- Phase 54

</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Render swarm list (initial) | Frontend Server (Next.js Server Component) | Database (Supabase REST) | RLS-protected query; SSR avoids client roundtrip on first paint |
| Stream swarm-list updates | Browser/Client (Supabase Realtime) | Database (postgres_changes via WAL → publication) | Live sidebar stats need WebSocket -- not server-cacheable |
| Auth + per-route access gate | Frontend Server (layouts) | Database (project_members RLS) | Inherits Phase 48 pattern; redirect server-side before client mounts |
| Single channel distribution to children | Browser/Client (React Context) | -- | Pure client-side state propagation; the constraint is client architecture, not infra |
| Route-level Realtime cleanup | Browser/Client (React useEffect cleanup in route layout) | -- | Lifecycle owned by React component tree |
| Layout shell rendering | Frontend Server (RSC) | -- | Static placeholders, no client interactivity |

</architectural_responsibility_map>

<research_summary>
## Summary

This phase delivers a frontend pattern (single Realtime subscription per swarm view, distributed via React Context) on top of the V7 design tokens and Supabase tables Phase 48 already shipped. Research focused on confirming three things:

1. **Supabase Realtime supports multiple `postgres_changes` filters on a single channel** -- yes, fully supported. The pattern is `channel.on('postgres_changes', {table: A, ...}, handler).on('postgres_changes', {table: B, ...}, handler).subscribe()`. Phase 49's `SwarmRealtimeProvider` uses exactly this pattern across `agent_events`, `swarm_jobs`, `swarm_agents`, `swarm_briefings`.

2. **Next.js 16 App Router unmounts layouts on dynamic segment change**. Navigating from `/swarm/A` to `/swarm/B` causes `app/(dashboard)/swarm/[swarmId]/layout.tsx` to unmount and remount because `[swarmId]` is part of its segment. React's useEffect cleanup runs on unmount, which is where the Provider calls `supabase.removeChannel(channel)`. This satisfies success criterion #4 (no leaks).

3. **`supabase.getChannels()` is the canonical way to verify cleanup** in tests/dev console. Returns array of active channels. After navigating between swarms, the array should contain exactly one `swarm:*` channel (plus the dashboard-wide `dashboard:swarms` channel from the sidebar).

**Primary recommendation:** Build `SwarmRealtimeProvider` mirroring the lifecycle pattern in `web/lib/supabase/broadcast-client.ts` (callback ref + cleanup), but for `postgres_changes` instead of `broadcast`. Public hook `useRealtimeTable<T>(table)` reads from Context, returns the typed rows array. Initial snapshots are fetched in a single `useEffect` on mount via the same Supabase client. Sidebar uses an independent dashboard-wide subscription owned at the (dashboard) layout level.

</research_summary>

<standard_stack>
## Standard Stack

### Core (already installed in this project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | latest (via `@supabase/ssr`) | Realtime + REST client | Native Supabase Realtime; same client used everywhere |
| `@supabase/ssr` | latest | createBrowserClient/createServerClient | Phase 48 standard; cookie-aware |
| `next` | 16 (Turbopack) | App Router | Project standard |
| `react` | 19 | Context, Suspense, hooks | Project standard |
| `lucide-react` | latest | Sidebar icons | Phase 48 standard |
| `tailwindcss` | 4 | Styling via arbitrary values for `--v7-*` tokens | Phase 48 standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `clsx` / `cn` (`web/lib/utils.ts`) | existing | Class composition | All component className construction |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Context for distribution | Zustand store | Zustand isn't installed; Context binds lifetime to route layout naturally |
| Multiple channels (one per table) | Single channel with multiple postgres_changes events | RT-01 requires single channel; Supabase supports both equally well |
| Polling with `useEffect` interval | postgres_changes Realtime | Polling violates the phase goal; Realtime is the requirement |

**Installation:** None. All dependencies already installed Phase 48.

</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  (dashboard)/layout.tsx  [Server Component]                          │
│   ├─ Auth gate (Supabase auth.getUser)                               │
│   ├─ project_members access gate (Phase 48)                          │
│   ├─ Fetch user's swarms (projects + counts)         ← SSR initial   │
│   └─ Branch: pathname starts with /swarm ?                           │
│        ├─ YES → render <SwarmSidebar swarms={...} active={swarmId}> │
│        └─ NO  → render <AppSidebar /> (legacy)                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────┐
        │ <SwarmSidebar> [Client Component]      │
        │  ├─ Renders swarm list from props       │
        │  ├─ Opens dashboard:swarms channel     │  ← single dashboard-wide channel
        │  │   (postgres_changes on              │     for sidebar mini-stats only
        │  │    swarm_jobs, swarm_agents)        │
        │  └─ Recomputes counts on each event    │
        └────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  (dashboard)/swarm/[swarmId]/layout.tsx  [Server Component]          │
│   ├─ Validates user has project_members on swarmId                   │
│   ├─ If not: notFound()                                              │
│   └─ Renders <SwarmRealtimeProvider swarmId={swarmId}>              │
│        └─ children                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ <SwarmRealtimeProvider> [Client Component]          │
        │  On mount:                                          │
        │   1. createClient()                                 │
        │   2. Fetch initial snapshots (4 tables)             │
        │   3. supabase.channel(`swarm:${swarmId}`)           │
        │      .on('postgres_changes', {table:'agent_events',  │
        │           filter:`swarm_id=eq.${swarmId}`}, ...)    │
        │      .on('postgres_changes', {table:'swarm_jobs',    │
        │           filter:`swarm_id=eq.${swarmId}`}, ...)    │
        │      .on('postgres_changes', {table:'swarm_agents',  │
        │           filter:`swarm_id=eq.${swarmId}`}, ...)    │
        │      .on('postgres_changes', {table:'swarm_briefings',│
        │           filter:`swarm_id=eq.${swarmId}`}, ...)    │
        │      .subscribe(handleStatus)                       │
        │  On unmount:                                        │
        │   supabase.removeChannel(channel)                   │
        │  Exposes context: {events, jobs, agents,            │
        │                    briefings, status}               │
        └─────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
   ┌──────────────┐ ┌────────────────┐ ┌────────────────┐
   │ <SwarmShell> │ │ Future: Fleet  │ │ Future: Kanban │
   │ (placeholders│ │ (Phase 51)     │ │ (Phase 52)     │
   │  + status    │ │                │ │                │
   │   indicator) │ │                │ │                │
   └──────────────┘ └────────────────┘ └────────────────┘
              │              │                │
              └──────────────┴────────────────┘
                             │
                             ▼
              useRealtimeTable('jobs')   ← all consumers go through
              useRealtimeTable('agents')   one provider
              useRealtimeTable('events')
              useRealtimeTable('briefings')
```

### Recommended Project Structure

```
web/
├── app/
│   └── (dashboard)/
│       ├── layout.tsx                          # MODIFIED: sidebar branch
│       └── swarm/
│           └── [swarmId]/
│               ├── layout.tsx                  # NEW: provider + access gate
│               ├── page.tsx                    # NEW: layout shell
│               └── not-found.tsx               # NEW: V7-styled 404
├── components/
│   ├── app-sidebar.tsx                         # UNTOUCHED (legacy)
│   ├── ui/glass-card.tsx                       # Phase 48 (reused)
│   └── v7/
│       ├── swarm-sidebar.tsx                   # NEW: V7 sidebar
│       ├── swarm-list-item.tsx                 # NEW: per-swarm row
│       ├── swarm-realtime-provider.tsx         # NEW: Context + channel
│       ├── swarm-layout-shell.tsx              # NEW: V7 grid + placeholders
│       ├── realtime-status-indicator.tsx       # NEW: dot + copy
│       └── sidebar-mini-stat.tsx               # NEW: pill component
└── lib/
    └── v7/
        ├── use-realtime-table.ts               # NEW: public hook
        ├── types.ts                            # NEW: row types per table
        └── swarm-data.ts                       # NEW: SSR fetcher for swarm list with counts
```

### Pattern 1: Multi-Event postgres_changes on Single Channel

**What:** Subscribe to multiple tables on one channel via chained `.on('postgres_changes', ...)` calls.
**When to use:** Whenever a single React subtree needs live updates from multiple related tables filtered by the same key.

**Example:**

```typescript
// Source: https://supabase.com/docs/guides/realtime/postgres-changes
const channel = supabase
  .channel(`swarm:${swarmId}`)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'agent_events', filter: `swarm_id=eq.${swarmId}` },
    (payload) => handleEvent('events', payload),
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'swarm_jobs', filter: `swarm_id=eq.${swarmId}` },
    (payload) => handleEvent('jobs', payload),
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'swarm_agents', filter: `swarm_id=eq.${swarmId}` },
    (payload) => handleEvent('agents', payload),
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'swarm_briefings', filter: `swarm_id=eq.${swarmId}` },
    (payload) => handleEvent('briefings', payload),
  )
  .subscribe((status) => setStatus(status));
```

### Pattern 2: Provider Owns Channel Lifecycle

**What:** Channel created in `useEffect` of provider, cleanup function removes it. Provider lives in route layout, so unmount = cleanup.

**Example:**

```typescript
// Source: mirrors web/lib/supabase/broadcast-client.ts pattern
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const Ctx = createContext<RealtimeBundle | null>(null);

export function SwarmRealtimeProvider({ swarmId, children }: Props) {
  const [bundle, setBundle] = useState<RealtimeBundle>(EMPTY_BUNDLE);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // 1. Initial snapshots
    Promise.all([
      supabase.from('agent_events').select('*').eq('swarm_id', swarmId),
      supabase.from('swarm_jobs').select('*').eq('swarm_id', swarmId),
      supabase.from('swarm_agents').select('*').eq('swarm_id', swarmId),
      supabase.from('swarm_briefings').select('*').eq('swarm_id', swarmId),
    ]).then(([events, jobs, agents, briefings]) => {
      if (cancelled) return;
      setBundle((prev) => ({
        ...prev,
        events: events.data ?? [],
        jobs: jobs.data ?? [],
        agents: agents.data ?? [],
        briefings: briefings.data ?? [],
      }));
    });

    // 2. Realtime channel
    const channel = supabase.channel(`swarm:${swarmId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_events', filter: `swarm_id=eq.${swarmId}` }, (p) => applyMutation('events', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swarm_jobs', filter: `swarm_id=eq.${swarmId}` }, (p) => applyMutation('jobs', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swarm_agents', filter: `swarm_id=eq.${swarmId}` }, (p) => applyMutation('agents', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swarm_briefings', filter: `swarm_id=eq.${swarmId}` }, (p) => applyMutation('briefings', p))
      .subscribe((status) => setBundle((prev) => ({ ...prev, status })));

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [swarmId]);

  return <Ctx.Provider value={bundle}>{children}</Ctx.Provider>;
}
```

### Pattern 3: Typed Hook Reading from Context

```typescript
// web/lib/v7/use-realtime-table.ts
import { useContext } from 'react';
import { SwarmRealtimeContext } from '@/components/v7/swarm-realtime-provider';
import type { AgentEvent, SwarmJob, SwarmAgent, SwarmBriefing } from './types';

type TableMap = {
  events: AgentEvent;
  jobs: SwarmJob;
  agents: SwarmAgent;
  briefings: SwarmBriefing;
};

export function useRealtimeTable<K extends keyof TableMap>(
  table: K,
): { rows: TableMap[K][]; status: ChannelStatus } {
  const ctx = useContext(SwarmRealtimeContext);
  if (!ctx) throw new Error('useRealtimeTable must be used inside SwarmRealtimeProvider');
  return { rows: ctx[table] as TableMap[K][], status: ctx.status };
}
```

### Anti-Patterns to Avoid

- **Per-component channel subscriptions:** Each child opens its own channel. Causes leaks, duplicate WAL traffic, violates RT-01.
- **Subscribing without filter:** Channel sees all swarms' events. Memory bloat + RLS still filters but Realtime fires the WAL globally.
- **Forgetting `removeChannel` in cleanup:** Channel stays open forever; navigating between swarms accumulates stale channels.
- **Using `useBroadcast` for postgres_changes:** Existing hook is for `broadcast` events (custom pubsub), not Realtime DB changes. Different API surface.
- **Per-row sidebar subscriptions:** One channel per visible swarm row scales horribly. Single dashboard-wide channel watches all rows.
- **Reusing channel across navigations:** Tempting optimization but breaks RT-01's per-view isolation. Always tear down and recreate.

</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection | Custom retry loop | Supabase JS internal auto-reconnect | Already battle-tested with backoff |
| Initial data fetch + Realtime sync | Diff/merge logic | `applyMutation(payload)` switch on `eventType` | Standard pattern: INSERT push, UPDATE map, DELETE filter |
| Counting active jobs | DB trigger to maintain a counter table | In-memory recompute from rows | Counts are tiny (single-digit per swarm); recompute is O(n) and instant |
| Per-swarm access check | Custom RLS extension | `select count from project_members where user_id=? and project_id=?` | Mirrors Phase 48 dashboard layout pattern exactly |
| Channel name uniqueness | UUID/timestamp suffix | `swarm:${swarmId}` | swarmId is already unique; deterministic name aids debugging |

</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Realtime payload `new`/`old` shape mismatch

**What goes wrong:** Code reads `payload.new.id` for INSERT but `payload.old.id` for DELETE; flipping causes silent missed updates.
**Why it happens:** Supabase payload schema differs by event type.
**How to avoid:** Switch on `payload.eventType`: INSERT → use `new`, UPDATE → use `new` (and `old` for diffing), DELETE → use `old`.
**Warning signs:** UI doesn't update on delete; rows appear duplicated.

### Pitfall 2: `useEffect` re-subscribes on every render

**What goes wrong:** Channel torn down and recreated on each render; mini-stats flicker; WebSocket churn.
**Why it happens:** Inline arrow functions in deps, or non-stable swarmId reference.
**How to avoid:** Deps array is `[swarmId]` only. swarmId from `params.swarmId` is stable per route. Don't add `supabase` (the client is module-cached anyway).
**Warning signs:** Network tab shows constant WebSocket reconnects.

### Pitfall 3: Missing REPLICA IDENTITY FULL

**What goes wrong:** UPDATE/DELETE payloads contain only the primary key, not the full row; UI can't update without re-fetching.
**Why it happens:** Postgres default `REPLICA IDENTITY` is `DEFAULT` (PK only).
**How to avoid:** Already done -- Phase 48 set `REPLICA IDENTITY FULL` on all 4 tables. Don't undo this.
**Warning signs:** UPDATE payload has `old: { id }` only.

### Pitfall 4: RLS blocks reads but Realtime delivers events anyway

**What goes wrong:** User sees Realtime fire for rows they can't read; subsequent re-fetch returns nothing; UI desyncs.
**Why it happens:** Realtime publication ignores RLS on the publication side; RLS is enforced only on the read.
**How to avoid:** Filter at the channel level (`filter: 'swarm_id=eq.${swarmId}'`) AND rely on per-route `project_members` access gate so the user only ever subscribes to swarms they can read. Since the access gate runs in the route layout, this composes cleanly.
**Warning signs:** Realtime events fire but `useRealtimeTable` array stays empty after re-fetch.

### Pitfall 5: Provider re-renders cascade

**What goes wrong:** Every event causes all consumers to re-render even if their table didn't change.
**Why it happens:** Context value is a new object on every event; all `useContext` consumers re-render.
**How to avoid:** Phase 49 acceptable — Phase 51+ should split into 4 separate Contexts (one per table) for fine-grained subscriptions if rendering becomes a bottleneck. For now, the only consumer is the placeholder shell, which doesn't render the data.
**Warning signs:** React DevTools profiler shows full subtree re-renders on every event.

### Pitfall 6: `notFound()` triggered before client mount

**What goes wrong:** User briefly sees the page flash, then 404. Bad UX.
**Why it happens:** Access check runs in client component instead of server component.
**How to avoid:** Run the per-swarm access check in `swarm/[swarmId]/layout.tsx` server component. If user lacks access, server returns 404 directly.
**Warning signs:** Flash of unauthorized content before redirect.

</common_pitfalls>

<code_examples>
## Code Examples

### Sidebar mini-stat dashboard channel (Pattern 1 applied to chrome)

```typescript
// web/components/v7/swarm-sidebar.tsx (excerpt)
'use client';

useEffect(() => {
  const supabase = createClient();
  const channel = supabase.channel('dashboard:swarms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'swarm_jobs' }, (payload) => {
      // recompute job counts from in-memory rows
      setJobs((prev) => applyMutation(prev, payload));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'swarm_agents' }, (payload) => {
      setAgents((prev) => applyMutation(prev, payload));
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);

// derived
const statsBySwarm = useMemo(() => {
  const map = new Map<string, { active: number; agents: number }>();
  for (const swarm of swarms) {
    map.set(swarm.id, {
      active: jobs.filter(j => j.swarm_id === swarm.id && ['ready','progress','review'].includes(j.stage)).length,
      agents: agents.filter(a => a.swarm_id === swarm.id).length,
    });
  }
  return map;
}, [swarms, jobs, agents]);
```

### SSR swarm list with initial counts (lib/v7/swarm-data.ts)

```typescript
// Source: pattern from web/app/(dashboard)/page.tsx:14
import { createClient } from '@/lib/supabase/server';

export async function fetchSwarmsWithCounts(userId: string) {
  const supabase = await createClient();

  // RLS via project_members ensures the user only sees swarms they can access
  const { data: swarms } = await supabase
    .from('projects')
    .select('id, name, description')
    .order('updated_at', { ascending: false });

  if (!swarms?.length) return [];

  const swarmIds = swarms.map(s => s.id);

  const [{ data: jobs }, { data: agents }] = await Promise.all([
    supabase.from('swarm_jobs').select('swarm_id, stage').in('swarm_id', swarmIds),
    supabase.from('swarm_agents').select('swarm_id').in('swarm_id', swarmIds),
  ]);

  return swarms.map(s => ({
    ...s,
    activeJobs: (jobs ?? []).filter(j => j.swarm_id === s.id && ['ready','progress','review'].includes(j.stage)).length,
    agentCount: (agents ?? []).filter(a => a.swarm_id === s.id).length,
  }));
}
```

### Per-swarm access gate (route layout)

```typescript
// web/app/(dashboard)/swarm/[swarmId]/layout.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SwarmRealtimeProvider } from '@/components/v7/swarm-realtime-provider';

export default async function SwarmLayout({
  params,
  children,
}: {
  params: Promise<{ swarmId: string }>;
  children: React.ReactNode;
}) {
  const { swarmId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { count } = await supabase
    .from('project_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('project_id', swarmId);

  if (!count) notFound();

  return <SwarmRealtimeProvider swarmId={swarmId}>{children}</SwarmRealtimeProvider>;
}
```

### Verifying single-channel cleanup in dev console

```typescript
// In browser console, after navigating from /swarm/A to /swarm/B:
window.supabase = createClient();
window.supabase.getChannels().forEach(c => console.log(c.topic));
// Expected output:
// realtime:dashboard:swarms
// realtime:swarm:<id-of-B>
// (NO realtime:swarm:<id-of-A> -- that channel was torn down)
```

</code_examples>

<sota_updates>
## State of the Art (2024-2025)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `supabase.from(table).on('INSERT')` (v1 API) | `supabase.channel(name).on('postgres_changes', ...)` (v2 API) | 2022 | Required by current `@supabase/supabase-js` v2; project already uses this |
| Polling for changes | postgres_changes via WAL → Realtime publication | 2021+ | What this phase implements |
| Single Realtime channel = single table | One channel can carry multiple `postgres_changes` listeners + broadcast + presence | 2023 | Foundation for the RT-01 single-channel pattern |
| Class components / HOCs for context | Function components + Context + custom hooks | React 18+ | Standard for this phase |

**New tools/patterns to consider:**
- React 19 `use()` hook for reading promises in components -- not used in Phase 49 (Realtime is push, not pull)
- Server Actions for mutations -- not needed Phase 49 (no writes)

**Deprecated/outdated:**
- `supabase-js` v1 channel API -- already on v2 project-wide
- `from(...).on(...)` chained syntax -- removed in v2

</sota_updates>

<open_questions>
## Open Questions

1. **Should the (dashboard) layout decide sidebar based on `headers().get('next-url')` or via a small client wrapper using `usePathname()`?**
   - What we know: Next.js 16 doesn't pass pathname directly to server layouts. Two paths: parse `next-url` header (server-only) or render a thin client component that reads `usePathname()` and chooses.
   - What's unclear: Which is more idiomatic in Next.js 16 App Router (Turbopack)?
   - Recommendation: Implement as a tiny client wrapper `<SidebarChooser>` that takes both sidebars as props and renders the right one based on `usePathname().startsWith('/swarm')`. Avoids relying on header internals; sidebar is anyway a Client Component for Realtime so this isn't a server/client boundary regression.

2. **Should mini-stat counts be SSR'd into the sidebar component, or fetched client-side after mount?**
   - What we know: SSR gives instant first paint with correct counts; client-side fetch shows skeleton briefly.
   - What's unclear: Does the (dashboard) layout's existing data fetch already fit?
   - Recommendation: SSR them. The (dashboard) layout already does an auth round-trip; bundling the swarm list query keeps it to one server pass.

3. **How should integration tests verify the channel lifecycle without a live browser?**
   - What we know: CLAUDE.md says don't mock Supabase; integration tests hit real Supabase.
   - What's unclear: Provider lifecycle is a React effect, requires React Testing Library + jsdom.
   - Recommendation: Use vitest + jsdom + RTL to render `<SwarmRealtimeProvider>`, call real Supabase against a test swarm row, assert channel is created and torn down via `supabase.getChannels().length` before/after unmount.

</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- https://supabase.com/docs/guides/realtime/postgres-changes — multi-event channel pattern, filter syntax, REPLICA IDENTITY FULL requirement
- https://supabase.com/docs/reference/javascript/subscribe — channel.subscribe() callback states (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED)
- https://supabase.com/docs/reference/javascript/removechannel — cleanup pattern
- `web/lib/supabase/broadcast-client.ts` — existing project pattern for ref-stabilized callback + cleanup; mirrored by SwarmRealtimeProvider
- `web/app/(dashboard)/layout.tsx` (Phase 48) — auth + project_members gate pattern; mirrored by swarm/[swarmId]/layout.tsx
- `supabase/migrations/20260415_v7_foundation.sql` (Phase 48) — schema, RLS, REPLICA IDENTITY FULL, publication

### Secondary (MEDIUM confidence)
- https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates — layout unmount semantics on dynamic segment change

### Tertiary (LOW confidence — needs validation)
- None — all patterns verified against official docs and existing codebase.

</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Supabase Realtime postgres_changes (single-channel multi-event), React Context lifecycle, Next.js 16 App Router layouts
- Ecosystem: @supabase/ssr, lucide-react, tailwindcss arbitrary values
- Patterns: Provider-owned channel lifecycle, typed hook reading from context, dashboard-wide stats channel, per-route SSR access gate
- Pitfalls: Realtime payload shape, useEffect re-subscribe, REPLICA IDENTITY, RLS vs Realtime, provider re-render cascade, notFound flash

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies installed in Phase 48
- Architecture: HIGH — Supabase docs verify multi-event single-channel pattern
- Pitfalls: HIGH — well-documented Realtime gotchas
- Code examples: HIGH — pattern mirrors existing `broadcast-client.ts`

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — Supabase Realtime API is stable)
</metadata>

---

*Phase: 49-navigation-realtime*
*Research completed: 2026-04-16*
*Ready for planning: yes*
