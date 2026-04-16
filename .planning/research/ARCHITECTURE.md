# Architecture: V7.0 Agent OS

**Domain:** Real-time agent swarm operating view with live data, new design system, and O365 SSO -- integrated into existing Next.js + Supabase app
**Researched:** 2026-04-15
**Confidence:** MEDIUM-HIGH -- Supabase Realtime patterns verified via official docs; existing codebase thoroughly analyzed; Orq.ai trace query API has LOW confidence (MCP tools exist but REST API undocumented); Azure AD OAuth well-documented

## Executive Summary

V7.0 transforms the Agent Workforce app from a pipeline management tool into a real-time swarm operating system. The architecture challenge is threefold: (1) adding Supabase Realtime subscriptions to an App Router codebase that currently uses Server Components for data display, (2) integrating Orq.ai trace/span data into visual swimlane timelines, and (3) restructuring navigation from flat pages to swarm-scoped routing with a dynamic sidebar.

The existing codebase already has the right patterns in place. The `useBroadcast` hook in `broadcast-client.ts` handles Supabase Broadcast subscriptions, the `SwarmGraph` component subscribes to real-time step updates via `useBroadcast`, and the `RunListLive` component demonstrates the Server Component (initial fetch) + Client Component (live updates) pattern. V7.0 extends these patterns to more surfaces: terminal stream, swimlane timelines, KPI refreshes, and delegation graph.

The critical architectural decision is the **data flow for Orq.ai traces**. The existing `orqai-collector.ts` Inngest cron fetches workspace-level analytics via MCP. V7.0 needs per-trace, per-span data for swimlane visualization. This requires either (a) the Orq.ai MCP `list_traces`/`list_spans` tools (available but undocumented in REST form), or (b) polling the MCP endpoint from an API route and caching results in a new `agent_events` table that Supabase Realtime can subscribe to.

## Recommended Architecture

### High-Level System Diagram

```
                        +------------------+
                        |   Login Page     |
                        | email/pw + Azure |
                        +--------+---------+
                                 |
                        Supabase Auth (middleware.ts unchanged)
                                 |
                 +---------------v----------------+
                 |        Root Layout             |
                 | ThemeProvider (dark/light)      |
                 | Satoshi + Cabinet Grotesk fonts |
                 +---------------+----------------+
                                 |
                 +---------------v----------------+
                 |      Dashboard Layout          |
                 |  New SwarmSidebar (dynamic)    |
                 +------+--------+--------+------+
                        |        |        |
          +-------------+ +------v------+ +-------v---------+
          | /swarm/[id] | | /executive  | | /settings, etc  |
          | SwarmView   | | (existing,  | | (existing,      |
          | (NEW)       | |  restyled)  | |  restyled)      |
          +------+------+ +-------------+ +-----------------+
                 |
    +------------+-------------+-------------+
    |            |             |             |
+---v---+  +----v----+  +----v----+  +-----v------+
|Briefing|  |Terminal |  |Swimlane |  |Delegation  |
|Panel   |  |Stream   |  |Timeline |  |Graph       |
|(Orq.ai)|  |(Realtime)|  |(Realtime)| |(React Flow)|
+--------+  +---------+  +---------+  +------------+
    |            |             |             |
    |     +------v-------------v-------------v------+
    |     |        Supabase Realtime                |
    |     |  postgres_changes on agent_events       |
    |     |  broadcast on swarm:{swarmId}           |
    |     +-----------------------------------------+
    |
    +---> Orq.ai Briefing Agent (API route -> Orq.ai)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `app/(dashboard)/layout.tsx` | Auth guard, sidebar provider | Supabase Auth, SwarmSidebar | **MODIFIED** -- replace AppSidebar with SwarmSidebar |
| `app/(dashboard)/swarm/[swarmId]/page.tsx` | Swarm operating view with tabbed panels | Supabase DB (initial), Realtime (live) | **NEW** server component |
| `app/(dashboard)/swarm/[swarmId]/swarm-client.tsx` | Client wrapper managing all Realtime subscriptions | Supabase Realtime, child components | **NEW** client component |
| `components/swarm-sidebar.tsx` | Dynamic sidebar: swarm list from projects table, theme toggle, user menu | Supabase DB (projects query) | **NEW** replaces app-sidebar.tsx |
| `components/swarm/briefing-panel.tsx` | AI narrative summary per swarm | API route `/api/swarm/[id]/briefing` | **NEW** client component |
| `components/swarm/terminal-stream.tsx` | Claude-style event log with live updates | Supabase Realtime `postgres_changes` on `agent_events` | **NEW** client component (evolves terminal-panel.tsx) |
| `components/swarm/swimlane-timeline.tsx` | Gantt-style per-agent timeline | Supabase Realtime `postgres_changes` on `agent_events` | **NEW** client component |
| `components/swarm/delegation-graph.tsx` | Live animated orchestrator-to-subagent paths | Supabase Realtime, React Flow | **NEW** client component (evolves swarm-graph.tsx) |
| `components/swarm/fleet-cards.tsx` | Subagent cards with metrics and recursive detail drawer | Supabase DB + Orq.ai metrics from `orqai_snapshots` | **NEW** client component |
| `components/swarm/kanban-board.tsx` | Business-stage job tracking (drag & drop) | Supabase DB `swarm_jobs` table | **NEW** client component |
| `lib/inngest/functions/orqai-trace-sync.ts` | Polls Orq.ai for trace/span data, writes to `agent_events` | Orq.ai MCP/API, Supabase `agent_events` | **NEW** Inngest function |
| `app/api/swarm/[id]/briefing/route.ts` | Calls Orq.ai Briefing Agent, returns narrative | Orq.ai Agents API | **NEW** API route |
| `lib/design-system/tokens.ts` | CSS custom property definitions, theme switching logic | globals.css | **NEW** |
| `app/layout.tsx` | Updated fonts (Satoshi + Cabinet Grotesk), ThemeProvider | globals.css | **MODIFIED** |
| `globals.css` | Complete color palette replacement, glassmorphism utilities | All components | **MODIFIED** (major) |
| `app/(auth)/login/page.tsx` | Add "Sign in with Microsoft" button | Supabase Auth | **MODIFIED** |
| `middleware.ts` | No changes needed -- Supabase Auth handles Azure AD sessions identically | -- | **UNCHANGED** |

## New Supabase Tables and Views

### 1. `agent_events` -- Core real-time event table

This is the central table that powers terminal stream, swimlane timeline, and delegation graph. All live UI components subscribe to `postgres_changes` on this table.

```sql
CREATE TABLE agent_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trace_id      TEXT,           -- Orq.ai trace ID (links related events)
  span_id       TEXT,           -- Orq.ai span ID (unique per operation)
  parent_span_id TEXT,          -- For delegation graph (parent -> child)
  agent_key     TEXT NOT NULL,  -- e.g. 'debtor-email-orchestrator-agent'
  agent_name    TEXT,           -- Human-readable display name
  event_type    TEXT NOT NULL,  -- 'thinking' | 'tool_call' | 'tool_result' | 'delegation' | 'completion' | 'error' | 'waiting'
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'complete' | 'error'
  payload       JSONB,          -- Event-specific data (tool name, result, error message, etc.)
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,    -- NULL while active, set on completion
  duration_ms   INT GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000
      ELSE NULL
    END
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for Realtime subscription filtering (swarm-scoped)
CREATE INDEX idx_agent_events_swarm ON agent_events(swarm_id, created_at DESC);

-- Index for trace lookups (swimlane reconstruction)
CREATE INDEX idx_agent_events_trace ON agent_events(trace_id, started_at);

-- Index for delegation graph queries
CREATE INDEX idx_agent_events_parent ON agent_events(parent_span_id) WHERE parent_span_id IS NOT NULL;

-- Enable Realtime on this table
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
```

**Why a dedicated table instead of reusing existing tables:** The `pipeline_runs` and `automation_runs` tables track high-level run status. `agent_events` tracks granular, per-span execution data needed for swimlane visualization and terminal streaming. Different granularity, different access patterns, different retention policies.

### 2. `swarm_jobs` -- Kanban board state

```sql
CREATE TABLE swarm_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  stage         TEXT NOT NULL DEFAULT 'inbox',  -- 'inbox' | 'processing' | 'review' | 'done' | 'failed'
  priority      INT DEFAULT 0,
  agent_key     TEXT,           -- Which agent is handling this job
  trace_id      TEXT,           -- Links to agent_events for this job
  metadata      JSONB,          -- Business-specific data (invoice number, debtor name, etc.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_swarm_jobs_swarm_stage ON swarm_jobs(swarm_id, stage);
ALTER PUBLICATION supabase_realtime ADD TABLE swarm_jobs;
```

### 3. `swarm_briefings` -- Cached AI briefing narratives

```sql
CREATE TABLE swarm_briefings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  narrative     TEXT NOT NULL,   -- Markdown narrative from Briefing Agent
  metrics_snapshot JSONB,        -- Metrics at time of briefing (for staleness detection)
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by  TEXT DEFAULT 'briefing-agent'
);

CREATE INDEX idx_swarm_briefings_swarm ON swarm_briefings(swarm_id, generated_at DESC);
```

### 4. `swarm_agents` -- Agent registry per swarm

```sql
CREATE TABLE swarm_agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_key     TEXT NOT NULL,   -- Orq.ai agent key
  display_name  TEXT NOT NULL,
  role          TEXT,
  parent_key    TEXT,            -- Orchestrator key (for hierarchy)
  tools         JSONB,           -- Tool list for fleet cards
  orqai_agent_id TEXT,           -- Orq.ai agent UUID
  config        JSONB,           -- Cached agent config from Orq.ai
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(swarm_id, agent_key)
);

CREATE INDEX idx_swarm_agents_swarm ON swarm_agents(swarm_id);
```

### 5. View: `swarm_timeline` -- Materialized for swimlane queries

```sql
CREATE VIEW swarm_timeline AS
SELECT
  ae.swarm_id,
  ae.trace_id,
  ae.agent_key,
  sa.display_name AS agent_name,
  ae.event_type,
  ae.status,
  ae.started_at,
  ae.ended_at,
  ae.duration_ms,
  ae.payload
FROM agent_events ae
LEFT JOIN swarm_agents sa ON sa.swarm_id = ae.swarm_id AND sa.agent_key = ae.agent_key
ORDER BY ae.started_at;
```

## Realtime Subscription Architecture

### Pattern: Server Component Initial Fetch + Client Component Live Updates

This is the established pattern in the codebase (see `RunListLive`, `SwarmGraph`). V7.0 extends it consistently.

```
Server Component (page.tsx)
  |
  +-> Fetch initial data from Supabase (SELECT from agent_events, swarm_jobs, etc.)
  |
  +-> Pass as props to Client Component wrapper
       |
       Client Component (swarm-client.tsx)
         |
         +-> useState with initial data
         +-> useEffect: subscribe to Supabase Realtime
         |     - postgres_changes on agent_events WHERE swarm_id = ?
         |     - postgres_changes on swarm_jobs WHERE swarm_id = ?
         +-> On INSERT/UPDATE: merge into state, push to child components
         +-> On unmount: unsubscribe
```

### Subscription Strategy: postgres_changes vs Broadcast

**Use `postgres_changes` (not Broadcast) for V7.0 live data.** Here is why:

The existing `useBroadcast` hook is used for pipeline step updates where the server (Inngest function) explicitly emits events. This works well for the pipeline use case because the server controls when events fire.

For V7.0, the data flow is different. The `orqai-trace-sync` Inngest function writes events to the `agent_events` table. Multiple UI components need to react to those inserts. Using `postgres_changes` means:

1. **Single source of truth** -- the database row IS the event. No separate broadcast channel to keep in sync.
2. **Automatic** -- any INSERT to `agent_events` triggers all subscribers. No need to call `broadcastXyz()` from every write path.
3. **Recoverable** -- if the client disconnects, it can re-query the table for missed events. Broadcast messages are fire-and-forget.
4. **Filtered** -- Supabase Realtime supports filter on `postgres_changes`: `filter: 'swarm_id=eq.{swarmId}'`, so each swarm view only receives its own events.

**Exception: Use Broadcast for ephemeral UI signals** (e.g., "agent X is currently typing" indicators) that do not need persistence.

### Client-Side Subscription Hook

Extend the existing `useBroadcast` pattern with a new `useRealtimeTable` hook:

```typescript
// lib/supabase/realtime-client.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";

interface UseRealtimeTableOptions<T> {
  table: string;
  filter?: string;           // e.g., "swarm_id=eq.abc-123"
  events?: ChangeEvent[];    // default: ["INSERT", "UPDATE"]
  onInsert?: (row: T) => void;
  onUpdate?: (row: T) => void;
  onDelete?: (old: T) => void;
}

export function useRealtimeTable<T extends Record<string, unknown>>(
  options: UseRealtimeTableOptions<T>
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const supabase = createClient();
    const { table, filter, events = ["INSERT", "UPDATE"] } = optionsRef.current;

    let channel = supabase.channel(`rt:${table}:${filter ?? "all"}`);

    for (const event of events) {
      channel = channel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          const opts = optionsRef.current;
          if (payload.eventType === "INSERT" && opts.onInsert) {
            opts.onInsert(payload.new as T);
          } else if (payload.eventType === "UPDATE" && opts.onUpdate) {
            opts.onUpdate(payload.new as T);
          } else if (payload.eventType === "DELETE" && opts.onDelete) {
            opts.onDelete(payload.old as T);
          }
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [options.table, options.filter]);
}
```

### Realtime RLS Consideration

`postgres_changes` respects Row Level Security. Since the dashboard uses the anon key client-side, RLS policies must allow SELECT for authenticated users:

```sql
-- Agent events: any authenticated user can read
CREATE POLICY "authenticated_read_agent_events" ON agent_events
  FOR SELECT TO authenticated USING (true);

-- Swarm jobs: any authenticated user can read
CREATE POLICY "authenticated_read_swarm_jobs" ON swarm_jobs
  FOR SELECT TO authenticated USING (true);

-- Writes go through service role (Inngest functions, API routes)
-- No INSERT/UPDATE policies needed for anon/authenticated
```

This matches the existing app pattern: 5-15 internal users, all trusted, no per-user data isolation needed.

## Data Flow: Orq.ai Traces to Swimlane Visualization

### The Pipeline

```
Orq.ai Agent Execution (production)
  |
  Orq.ai stores traces + spans internally
  |
  v
Inngest Cron: orqai-trace-sync (every 2-5 minutes)
  |
  +-> step.run("fetch-recent-traces")
  |     Call Orq.ai MCP: list_traces({ period: "5m" })
  |     For each trace: list_spans({ trace_id })
  |
  +-> step.run("transform-and-store")
  |     Map Orq.ai spans -> agent_events rows
  |     UPSERT into agent_events (idempotent on span_id)
  |
  (Supabase Realtime triggers automatically on INSERT/UPDATE)
  |
  v
Client: useRealtimeTable({ table: "agent_events", filter: "swarm_id=eq.X" })
  |
  +-> Terminal Stream: append new event to log
  +-> Swimlane Timeline: extend/create bar for agent
  +-> Delegation Graph: animate edge when delegation event arrives
```

### Orq.ai MCP vs REST API Decision

**Use the Orq.ai MCP endpoint** (already proven in `orqai-collector.ts`) with the `list_traces` and `list_spans` tools. The existing `callMcpTool` function in `orqai-collector.ts` provides the pattern.

**Confidence: LOW-MEDIUM.** The `list_traces` and `list_spans` MCP tool names come from the project requirements but have not been verified against the actual Orq.ai MCP tool catalog. The MCP endpoint at `https://my.orq.ai/v2/mcp` supports `tools/list` which can enumerate available tools.

**Phase-specific research needed:** Before building the trace sync function, call `tools/list` on the MCP endpoint to enumerate available trace-related tools. Fallback options:

1. **Orq.ai TypeScript SDK** (`@orq-ai/node`) -- may expose trace listing methods
2. **OpenTelemetry export** -- if Orq.ai supports OTEL collector export, pipe traces directly to a Supabase-backed collector
3. **Webhook approach** -- if Orq.ai supports trace webhooks, receive events push-style instead of polling

### Span-to-Event Mapping

```typescript
// Mapping Orq.ai span types to agent_events event_type
const SPAN_TYPE_MAP: Record<string, string> = {
  "llm":        "thinking",
  "tool":       "tool_call",
  "agent":      "delegation",
  "retrieval":  "tool_call",
  "evaluation": "completion",
};

function mapSpanToEvent(span: OrqaiSpan, swarmId: string): AgentEventInsert {
  return {
    swarm_id: swarmId,
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id ?? null,
    agent_key: span.agent_key ?? span.metadata?.agent_key ?? "unknown",
    agent_name: span.agent_name ?? null,
    event_type: SPAN_TYPE_MAP[span.span_type] ?? span.span_type,
    status: span.status === "ok" ? "complete" : span.status === "error" ? "error" : "active",
    payload: {
      tool_name: span.tool_name,
      input: span.input,
      output: span.output,
      error: span.error,
      tokens: span.tokens,
      cost: span.cost,
    },
    started_at: span.start_time,
    ended_at: span.end_time ?? null,
  };
}
```

## Data Flow: Briefing Agent

```
User clicks "Refresh Briefing" (or Inngest cron fires)
  |
  v
POST /api/swarm/[id]/briefing
  |
  +-> Fetch current swarm state:
  |     - Recent agent_events (last 24h)
  |     - Current swarm_jobs by stage
  |     - Latest orqai_snapshots metrics
  |     - Swarm agent registry
  |
  +-> Call Orq.ai Briefing Agent:
  |     orq.deployments.invoke({
  |       key: "swarm-briefing-agent",
  |       messages: [{ role: "user", content: JSON.stringify(swarmState) }],
  |     })
  |
  +-> Store in swarm_briefings table
  |
  +-> Return narrative to client
```

The Briefing Agent is a standard Orq.ai agent with XML-tagged prompts that generates a markdown narrative summarizing swarm health, recent activity, anomalies, and recommendations.

## Routing Architecture

### Current: Flat pages under (dashboard)

```
/(dashboard)/           -> Dashboard page
/(dashboard)/executive  -> Executive dashboard
/(dashboard)/projects   -> Project list
/(dashboard)/runs       -> Run list
/(dashboard)/settings   -> Settings
```

### V7.0: Swarm-scoped routing

```
/(dashboard)/                      -> Redirect to first swarm or overview
/(dashboard)/swarm/[swarmId]       -> Swarm operating view (new default)
/(dashboard)/swarm/[swarmId]/kanban -> Kanban board for swarm jobs
/(dashboard)/executive             -> Executive dashboard (restyled)
/(dashboard)/settings              -> Settings (restyled)
```

The `swarmId` maps to the `projects.id` column. The sidebar dynamically lists projects that have `automation_type = 'agent'` or are tagged as swarms.

### Sidebar Structure

```typescript
// SwarmSidebar sections:
// 1. Swarm Navigation (dynamic from projects table)
//    - Debtor Email (project id: xxx)
//    - Sales Email (project id: yyy)
//    - + New Swarm (create project modal)
//
// 2. Static Navigation
//    - Executive Dashboard
//    - Settings
//
// 3. Footer
//    - Theme toggle (dark/light)
//    - User menu (sign out)
```

## Design System Integration

### Strategy: CSS Custom Properties Override

The existing codebase uses shadcn's CSS variable system in `globals.css`. The V7.0 design system replaces variable VALUES, not the variable NAMES. This means all existing shadcn components automatically pick up the new theme without component-level changes.

```css
/* globals.css -- V7.0 overrides */
:root {
  /* Replace Geist gray palette with V7.0 palette */
  --background: oklch(0.98 0.005 250);  /* Slight blue tint */
  --foreground: oklch(0.15 0.01 250);
  /* ... etc */

  /* NEW: glassmorphism utilities */
  --glass-bg: oklch(1 0 0 / 60%);
  --glass-blur: 12px;
  --glass-border: oklch(1 0 0 / 20%);
}

.dark {
  --background: oklch(0.12 0.015 250);  /* Deep blue-black */
  --glass-bg: oklch(0.15 0.01 250 / 40%);
  /* ... etc */
}
```

### Font Migration

Replace Geist Sans / Geist Mono with Satoshi (body) and Cabinet Grotesk (headings). Both are available via Fontshare or self-hosted.

```typescript
// app/layout.tsx
import localFont from "next/font/local";

const satoshi = localFont({
  src: "../fonts/Satoshi-Variable.woff2",
  variable: "--font-sans",
});

const cabinetGrotesk = localFont({
  src: "../fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-heading",
});
```

### Theme Toggle

Add a `ThemeProvider` to root layout that toggles `.dark` class on `<html>`. Use `next-themes` (tiny library, SSR-safe) or a simple localStorage + class toggle.

## Patterns to Follow

### Pattern 1: Swarm-Scoped Data Loading

**What:** Each swarm view loads its data scoped to the swarmId from the URL parameter.

**When:** Every page/component under `/swarm/[swarmId]`.

```typescript
// app/(dashboard)/swarm/[swarmId]/page.tsx (Server Component)
export default async function SwarmPage({
  params,
}: {
  params: Promise<{ swarmId: string }>;
}) {
  const { swarmId } = await params;
  const supabase = await createClient();

  const [
    { data: agents },
    { data: recentEvents },
    { data: jobs },
    { data: briefing },
  ] = await Promise.all([
    supabase.from("swarm_agents").select("*").eq("swarm_id", swarmId),
    supabase.from("agent_events").select("*").eq("swarm_id", swarmId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("swarm_jobs").select("*").eq("swarm_id", swarmId),
    supabase.from("swarm_briefings").select("*").eq("swarm_id", swarmId)
      .order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <SwarmClient
      swarmId={swarmId}
      initialAgents={agents ?? []}
      initialEvents={recentEvents ?? []}
      initialJobs={jobs ?? []}
      latestBriefing={briefing}
    />
  );
}
```

### Pattern 2: Event Accumulation with Deduplication

**What:** Realtime events accumulate in state, deduped by event ID, with a sliding window.

**When:** Terminal stream and swimlane components that receive continuous events.

```typescript
function useEventAccumulator(swarmId: string, initialEvents: AgentEvent[]) {
  const [events, setEvents] = useState<AgentEvent[]>(initialEvents);
  const MAX_EVENTS = 500;

  useRealtimeTable<AgentEvent>({
    table: "agent_events",
    filter: `swarm_id=eq.${swarmId}`,
    events: ["INSERT", "UPDATE"],
    onInsert: (row) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === row.id)) return prev; // dedup
        const next = [...prev, row];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
    },
    onUpdate: (row) => {
      setEvents((prev) =>
        prev.map((e) => (e.id === row.id ? row : e))
      );
    },
  });

  return events;
}
```

### Pattern 3: Delegation Graph from Span Hierarchy

**What:** Build the React Flow graph from parent_span_id relationships in agent_events.

```typescript
function buildDelegationGraph(events: AgentEvent[], agents: SwarmAgent[]) {
  const nodes = agents.map((a) => ({
    id: a.agent_key,
    type: "agentNode",
    data: {
      name: a.display_name,
      role: a.role,
      status: getAgentStatus(events, a.agent_key), // active/idle/error
    },
    position: { x: 0, y: 0 }, // dagre will layout
  }));

  // Edges from delegation events (parent -> child agent)
  const delegations = events.filter((e) => e.event_type === "delegation");
  const edgeSet = new Set<string>();
  const edges = delegations
    .filter((d) => d.parent_span_id)
    .map((d) => {
      const parentAgent = events.find((e) => e.span_id === d.parent_span_id)?.agent_key;
      const key = `${parentAgent}->${d.agent_key}`;
      if (!parentAgent || edgeSet.has(key)) return null;
      edgeSet.add(key);
      return {
        id: key,
        source: parentAgent,
        target: d.agent_key,
        type: "animatedEdge",
        data: { animated: d.status === "active" },
      };
    })
    .filter(Boolean);

  return getLayoutedElements(nodes, edges, "TB"); // reuse existing dagre layout
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Realtime Subscriptions in Server Components

**What:** Attempting to use `supabase.channel()` or `on('postgres_changes')` inside a Server Component.

**Why bad:** Server Components run once on the server and produce static HTML. WebSocket subscriptions require a persistent client-side connection.

**Instead:** Server Component fetches initial data, passes to Client Component that manages subscriptions.

### Anti-Pattern 2: One Subscription Per Component

**What:** Each child component (terminal, swimlane, graph) independently subscribing to `agent_events`.

**Why bad:** 3+ concurrent WebSocket channels to the same table with the same filter. Wastes connections, creates race conditions, and makes state synchronization difficult.

**Instead:** Single `SwarmClient` wrapper subscribes once, distributes events to children via props or context.

### Anti-Pattern 3: Polling Orq.ai from the Client

**What:** Client components directly calling Orq.ai API for trace data.

**Why bad:** Exposes API key to client, creates N concurrent polling loops (one per connected user), no deduplication.

**Instead:** Inngest cron writes to `agent_events` table. Clients subscribe to table changes via Supabase Realtime.

### Anti-Pattern 4: Storing Full Trace Payloads

**What:** Storing entire Orq.ai trace responses (including full prompt/completion text) in `agent_events.payload`.

**Why bad:** Traces with large prompts/completions can be 10-100KB each. At 100+ events/hour, the table bloats rapidly. Realtime pushes full row to all subscribers.

**Instead:** Store only metadata in `agent_events.payload` (tool name, token count, cost, truncated error). Link to full trace via `trace_id` for on-demand detail fetching from Orq.ai.

## Integration Points Summary

### Existing -> New

| Existing Component | Integration Point | What Changes |
|-------------------|-------------------|--------------|
| `app-sidebar.tsx` | Replaced by `swarm-sidebar.tsx` | New component, same SidebarProvider |
| `broadcast-client.ts` | Kept for pipeline broadcasts | Add `realtime-client.ts` alongside for postgres_changes |
| `broadcast.ts` | Kept for pipeline Inngest functions | Trace sync uses direct DB writes instead |
| `orqai-collector.ts` | Kept for workspace-level analytics | New `orqai-trace-sync.ts` for per-trace data |
| `dashboard_snapshots` table | Read by executive dashboard (unchanged) | Briefing Agent also reads for context |
| `orqai_snapshots` table | Read by aggregator (unchanged) | Fleet cards also read for per-agent metrics |
| `projects` table | Sidebar reads for swarm list | Add `is_swarm` boolean or filter by `automation_type` |
| `globals.css` | Complete variable value replacement | No structural changes to variable names |
| React Flow (`@xyflow/react`) | Reused for delegation graph | New node/edge types, same library |

### New -> Existing

| New Component | Depends On Existing | Notes |
|---------------|-------------------|-------|
| `swarm-client.tsx` | Supabase client (`lib/supabase/client.ts`) | Same client, new subscription pattern |
| `orqai-trace-sync.ts` | Inngest client, Supabase admin client, `callMcpTool` pattern | Reuse MCP call pattern from `orqai-collector.ts` |
| `briefing-panel.tsx` | Orq.ai agent invocation pattern | Same as pipeline adapter pattern |
| Kanban board | `projects` table foreign key | `swarm_jobs.swarm_id` references `projects.id` |
| Theme toggle | `globals.css` CSS variables | `next-themes` or manual `.dark` class toggle |

## Build Order (Dependency-Driven)

Based on the dependency graph, here is the recommended build sequence:

1. **Database migrations** (agent_events, swarm_agents, swarm_jobs, swarm_briefings) -- everything depends on these
2. **Design system + theme toggle** -- affects all visual work that follows
3. **SwarmSidebar + routing** (/swarm/[swarmId]) -- navigation structure for all new pages
4. **Realtime infrastructure** (useRealtimeTable hook, RLS policies, Realtime publication) -- needed by all live components
5. **Orq.ai trace sync** (Inngest function) -- populates agent_events that drive the live views
6. **Terminal stream** -- simplest live component, validates Realtime pipeline end-to-end
7. **Swimlane timeline** -- builds on same data as terminal, adds time axis
8. **Delegation graph** -- builds on agent_events + swarm_agents
9. **Fleet cards** -- reads swarm_agents + orqai_snapshots, no Realtime dependency
10. **Kanban board** -- independent feature, can be built in parallel with 6-9
11. **Briefing Agent** -- API route + Orq.ai agent, can be built in parallel with 6-9
12. **O365 SSO** -- independent of all above, requires Azure AD admin setup
13. **Executive dashboard restyle** -- apply design system to existing page

## Scalability Considerations

| Concern | At 5 users (current) | At 50 users | At 500+ users |
|---------|---------------------|-------------|---------------|
| Realtime connections | 5-10 concurrent channels | 50-100 channels | Supabase Pro plan limits (500 concurrent). Consider channel multiplexing. |
| agent_events table | ~1000 rows/week | ~10K rows/week | Add retention policy (DELETE WHERE created_at < now() - interval '30 days'). Partition by month. |
| Orq.ai trace polling | Every 2-5 min is fine | Same | Same -- polling is per-workspace, not per-user |
| Supabase Realtime bandwidth | Negligible | ~100KB/min | Consider filtering payload columns in subscription |

## Sources

- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) -- Official pattern for postgres_changes with App Router
- [Supabase postgres_changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) -- Subscription API reference
- [Supabase Azure AD OAuth](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- Azure AD provider setup
- [Orq.ai Observability](https://docs.orq.ai/docs/observability/traces) -- Traces and spans concepts
- [Orq.ai Observability Platform](https://orq.ai/platform/observability-monitoring) -- Platform capabilities overview
- [Building Real-time Magic: Supabase Subscriptions in Next.js 15](https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp) -- Community pattern reference
- Existing codebase: `web/lib/supabase/broadcast-client.ts`, `web/lib/supabase/broadcast.ts`, `web/components/graph/swarm-graph.tsx`, `web/components/dashboard/run-list-live.tsx`
