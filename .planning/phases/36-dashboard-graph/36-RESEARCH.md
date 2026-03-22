# Phase 36: Dashboard & Graph - Research

**Researched:** 2026-03-22
**Domain:** Real-time dashboard updates (Supabase Broadcast), interactive node graph visualization (React Flow v12), celebration animations
**Confidence:** HIGH

## Summary

Phase 36 transforms the Phase 35 pipeline UI from a 5-second polling experience into a real-time, visually impressive dashboard with an interactive agent swarm graph as the centerpiece. The three core domains are: (1) replacing `router.refresh()` polling with Supabase Broadcast for instant state updates on both run list and run detail pages, (2) building an interactive React Flow v12 graph with custom agent nodes, animated edges, and execution overlay, and (3) restructuring the run detail page layout to be graph-primary with a collapsible timeline side drawer.

The existing codebase is well-structured for this transformation. The Inngest pipeline function (`web/lib/inngest/functions/pipeline.ts`) already writes step status to Supabase via admin client -- adding Broadcast emissions is a minimal change (one `channel.send()` call per status transition). The run detail page (`run-detail-client.tsx`) is a single client component with a clear polling loop that can be replaced. React Flow v12 (`@xyflow/react`) is a new dependency but integrates cleanly with React 19 and provides all needed primitives: custom nodes via `nodeTypes`, custom animated edges via `edgeTypes`, programmatic updates via `useReactFlow()`, and viewport controls (zoom, pan, fitView).

**Primary recommendation:** Use `@xyflow/react` 12.x with `@dagrejs/dagre` for hierarchical layout, Supabase Broadcast via admin client `channel.send()` from Inngest pipeline steps, `canvas-confetti` for completion celebration, and shadcn Sheet component for the collapsible timeline drawer.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace Phase 35's 5-second `router.refresh()` polling with Supabase Broadcast
- Both run list page AND run detail page update in real time via Broadcast
- Run list cards update status badges and progress bars live
- Auto-scroll to currently active step by default; floating "Jump to active step" button if user scrolls away
- Animated celebration (confetti/particle animation) when full pipeline completes successfully, with summary stats
- Rich agent nodes showing: agent name, role label, and tool count/icons
- Edges show data flow between agents (orchestrator-to-subagent relationships)
- Full interactivity: zoom, pan, and drag nodes to rearrange
- Node positions reset on page reload (no persistence)
- Hover: tooltip with quick summary (role description, model, tool count)
- Click: slide-out side panel with full agent spec (role, description, model, instructions excerpt, tools list, performance scores)
- Animated edge flow (moving dots/dashes along edges) between orchestrator and active agent during execution
- Progressive status: agent node updates as corresponding pipeline step completes
- Nodes appear progressively as agents are designed (graph starts empty, nodes appear with entrance animation)
- After pipeline completion: scores animate in with count-up animation from 0 to final score
- Run detail page: graph is the primary view, step timeline lives in a collapsible side drawer
- Project page gets a third tab: Overview | Runs | Swarm Graph
- "Swarm Graph" tab shows latest successful run's agent graph

### Claude's Discretion
- Specific animation timing and easing curves
- Graph layout algorithm selection (dagre recommended by research)
- Node sizing and spacing
- Run list card visual enhancements (mini-graph previews or just real-time status)
- Celebration animation implementation (confetti library choice, duration, intensity)
- Supabase Broadcast channel structure and event naming
- Side panel design for agent details
- How to map pipeline steps to graph node states (step-to-agent mapping logic)

### Deferred Ideas (OUT OF SCOPE)
- Load existing Orq.ai swarms into the graph -- requires Orq.ai API integration, separate capability, future phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | User sees live progress indicators as pipeline steps complete (Supabase Realtime) | Supabase Broadcast channel.send() from Inngest pipeline function; client subscribes via channel.on('broadcast') |
| DASH-02 | User sees a log stream with human-readable step descriptions | Existing StepLogPanel component moves into Sheet drawer; Broadcast events carry step display_name and status |
| DASH-03 | Dashboard shows vertical timeline of pipeline steps with state indicators | Existing step-log-panel.tsx timeline pattern reused inside Sheet; status dots update via Broadcast state |
| DASH-04 | Run list updates in real-time when pipeline status changes | RunCard wrapped in client component with Broadcast subscription on run-level channel |
| GRAPH-01 | User sees an interactive node graph of the designed agent swarm (React Flow) | @xyflow/react 12.x with custom AgentNode component, dagre layout, zoom/pan/drag |
| GRAPH-02 | Nodes show agent name, role, and tool connections | Custom AgentNode component with Handle components for edges; data props for name, role, tools |
| GRAPH-03 | Nodes light up during pipeline execution (running/complete/failed states) | updateNodeData() via useReactFlow to toggle status class; animated edge with SVG animateMotion |
| GRAPH-04 | Agent performance scores display on nodes after pipeline completion | Count-up animation on score values in AgentNode; triggered when pipeline status becomes 'complete' |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | 12.10.1 | Interactive node graph rendering | Official React Flow v12 package; custom nodes, edges, layout hooks, viewport control |
| @dagrejs/dagre | 3.0.0 | Hierarchical graph layout algorithm | Drop-in directed graph layout; fast, minimal config, perfect for 3-7 node swarms |
| @supabase/supabase-js | 2.99.1 (existing) | Broadcast channel for real-time updates | Already installed; channel.send() for server-side, channel.on() for client-side |
| canvas-confetti | 1.9.4 | Celebration animation on pipeline completion | Tiny (6KB), no dependencies, configurable particle effects, works with any framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/dagre | 0.7.54 | TypeScript definitions for dagre | Dev dependency for dagre type safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dagre | elkjs | ELK is far more configurable but async, complex, and overkill for 3-7 node graphs |
| dagre | d3-force | Force-directed is jittery for small graphs; dagre produces clean hierarchy immediately |
| canvas-confetti | react-confetti | react-confetti renders a full-screen canvas element; canvas-confetti is lighter and more controllable |
| Supabase Broadcast | Supabase Postgres Changes | Postgres Changes has single-thread RLS bottleneck (already decided against in PROJECT.md) |

**Installation:**
```bash
cd web && npm install @xyflow/react @dagrejs/dagre canvas-confetti && npm install -D @types/dagre
```

**Version verification:** All versions confirmed against npm registry on 2026-03-22.

## Architecture Patterns

### Recommended Project Structure
```
web/
├── components/
│   ├── graph/
│   │   ├── agent-node.tsx          # Custom React Flow node for agents
│   │   ├── animated-edge.tsx       # Custom edge with SVG animateMotion
│   │   ├── swarm-graph.tsx         # Main ReactFlow wrapper (layout, state, controls)
│   │   ├── agent-detail-panel.tsx  # Slide-out Sheet with full agent spec
│   │   └── use-graph-layout.ts    # dagre layout hook
│   ├── dashboard/
│   │   ├── run-list-live.tsx       # Client wrapper for run list with Broadcast
│   │   └── run-detail-live.tsx     # Refactored run detail with Broadcast + graph-primary layout
│   ├── step-log-panel.tsx          # (existing) moves into Sheet drawer
│   ├── step-status-badge.tsx       # (existing) reused on graph nodes
│   └── run-card.tsx                # (existing) enhanced with Broadcast subscription
├── lib/
│   ├── supabase/
│   │   └── broadcast.ts            # Broadcast helper: emit events from server, subscribe on client
│   └── pipeline/
│       └── graph-mapper.ts         # Maps pipeline step results to graph nodes/edges
├── app/(dashboard)/
│   └── projects/[id]/
│       ├── page.tsx                # Add "Swarm Graph" tab (3rd tab)
│       └── runs/[runId]/
│           └── run-detail-client.tsx  # Replace polling with Broadcast; graph-primary layout
```

### Pattern 1: Supabase Broadcast from Inngest Pipeline
**What:** Server-side Inngest functions emit Broadcast events when pipeline step status changes, replacing client-side polling.
**When to use:** Every pipeline step transition (pending->running, running->complete, running->failed) and run-level status changes.
**Example:**
```typescript
// In web/lib/supabase/broadcast.ts
import { createAdminClient } from "@/lib/supabase/admin";

export async function broadcastStepUpdate(
  runId: string,
  payload: {
    stepName: string;
    status: string;
    displayName: string;
    durationMs?: number;
    stepsCompleted?: number;
    runStatus?: string;
    log?: string;
  }
) {
  const admin = createAdminClient();
  const channel = admin.channel(`run:${runId}`);
  await channel.send({
    type: "broadcast",
    event: "step-update",
    payload,
  });
  admin.removeChannel(channel);
}

export async function broadcastRunUpdate(
  runId: string,
  payload: {
    status: string;
    stepsCompleted: number;
    agentCount?: number;
  }
) {
  const admin = createAdminClient();
  // Run-level channel for run list pages
  const channel = admin.channel(`runs:live`);
  await channel.send({
    type: "broadcast",
    event: "run-update",
    payload: { runId, ...payload },
  });
  admin.removeChannel(channel);
}
```
**Source:** [Supabase Broadcast Docs](https://supabase.com/docs/guides/realtime/broadcast)

### Pattern 2: Client-Side Broadcast Subscription
**What:** Client components subscribe to Broadcast channels and update React state in response.
**When to use:** Run detail page (per-run channel) and run list page (global channel).
**Example:**
```typescript
// In run-detail-live.tsx (client component)
"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function useRunBroadcast(runId: string, onStepUpdate: (payload: StepUpdate) => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`run:${runId}`);

    channel
      .on("broadcast", { event: "step-update" }, ({ payload }) => {
        onStepUpdate(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, onStepUpdate]);
}
```

### Pattern 3: React Flow Custom Node with Status Overlay
**What:** Custom AgentNode component that visually reflects execution state via CSS classes and animations.
**When to use:** Every node in the swarm graph.
**Example:**
```typescript
// In web/components/graph/agent-node.tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface AgentNodeData {
  name: string;
  role: string;
  model: string;
  toolCount: number;
  tools: string[];
  status: "idle" | "running" | "complete" | "failed";
  score?: number;
  description?: string;
  instructions?: string;
}

export const AgentNode = memo(({ data }: NodeProps<AgentNodeData>) => {
  const statusClasses = {
    idle: "border-muted-foreground/30",
    running: "border-blue-500 shadow-blue-500/20 shadow-lg animate-pulse",
    complete: "border-green-500 shadow-green-500/10 shadow-md",
    failed: "border-destructive shadow-destructive/10 shadow-md",
  };

  return (
    <div className={`rounded-lg border-2 bg-background p-4 min-w-[180px] ${statusClasses[data.status]}`}>
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-semibold">{data.name}</div>
      <div className="text-xs text-muted-foreground">{data.role}</div>
      {data.toolCount > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          {data.toolCount} tool{data.toolCount !== 1 ? "s" : ""}
        </div>
      )}
      {data.status === "complete" && data.score !== undefined && (
        <div className="mt-2 text-lg font-bold text-green-600">
          {data.score}%
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
AgentNode.displayName = "AgentNode";
```

### Pattern 4: Animated Edge with SVG animateMotion
**What:** Custom edge component showing moving dots along the path between orchestrator and active agent.
**When to use:** Edges connected to currently running agent node.
**Example:**
```typescript
// In web/components/graph/animated-edge.tsx
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function AnimatedEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      {data?.animated && (
        <circle r="4" fill="hsl(var(--primary))">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}
```
**Source:** [React Flow Animating Edges](https://reactflow.dev/examples/edges/animating-edges)

### Pattern 5: Dagre Layout for Agent Swarm
**What:** Use dagre to compute hierarchical positions for agent nodes, with orchestrator at top.
**When to use:** Initial graph render and when new nodes appear progressively.
**Example:**
```typescript
// In web/components/graph/use-graph-layout.ts
import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```
**Source:** [React Flow Dagre Example](https://reactflow.dev/examples/layout/dagre)

### Anti-Patterns to Avoid
- **Subscribing to Postgres Changes instead of Broadcast:** PROJECT.md explicitly chose Broadcast over Postgres Changes to avoid the single-thread RLS bottleneck.
- **Storing graph layout positions in the database:** CONTEXT.md says positions reset on reload. Keep layout in client state only.
- **Using d3-force for small agent graphs:** Force-directed layout is iterative and jittery for 3-7 node graphs. Dagre produces clean hierarchy in a single pass.
- **Putting the full agent spec output in Broadcast payloads:** Broadcast has a message size limit. Send status updates only; fetch full data from Supabase on demand (e.g., when user clicks a node).
- **Using `useEdges()` / `useNodes()` hooks for frequent updates:** These cause re-renders on every change. Use `useReactFlow().updateNodeData()` for targeted updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph node positioning | Manual x/y calculation | @dagrejs/dagre | Handles hierarchy, edge routing, spacing automatically |
| Edge path rendering | SVG path math | @xyflow/react BaseEdge + getSmoothStepPath | Handles curves, control points, and intersection with node boundaries |
| Zoom/pan/drag | Custom mouse event handlers | @xyflow/react built-in viewport controls | Touch support, momentum, boundaries, minimap integration |
| Confetti animation | Canvas particle system | canvas-confetti | Handles particle physics, decay, gravity, wind, multiple burst patterns |
| Real-time WebSocket management | Custom WebSocket with reconnection | Supabase channel.subscribe() | Handles connection lifecycle, reconnection, authentication |
| Graph layout algorithm | Manual tree positioning | dagre.layout() | Handles rank assignment, edge crossing minimization, node separation |
| Slide-out panel | Custom positioned div | shadcn Sheet component | Handles focus trapping, animations, overlay, close on escape/click-outside |

**Key insight:** React Flow v12 provides the complete graph interaction layer (zoom, pan, drag, selection, viewport management). The only custom code needed is the node component visual design, the edge animation, and the data mapping from pipeline state to graph state.

## Common Pitfalls

### Pitfall 1: Broadcast Channel Cleanup on Unmount
**What goes wrong:** Memory leaks and duplicate event handlers if channels aren't removed when components unmount.
**Why it happens:** Supabase channels persist until explicitly removed. React StrictMode double-mounts in dev.
**How to avoid:** Always call `supabase.removeChannel(channel)` in the useEffect cleanup function. Use a ref to track the channel instance.
**Warning signs:** Console warnings about duplicate subscriptions, events firing twice.

### Pitfall 2: React Flow nodeTypes Must Be Stable
**What goes wrong:** Graph re-renders and loses state (positions, viewport) on every parent render.
**Why it happens:** Passing `nodeTypes={{ agent: AgentNode }}` inline creates a new object each render. React Flow interprets this as a type change and remounts all nodes.
**How to avoid:** Define `nodeTypes` outside the component or wrap in `useMemo`. Same for `edgeTypes`.
**Warning signs:** Nodes jump back to initial positions, viewport resets, performance degradation.

### Pitfall 3: Mapping Pipeline Steps to Graph Nodes
**What goes wrong:** No direct mapping exists between pipeline steps and agent graph nodes. The "architect" step outputs agent definitions, but subsequent steps don't map 1:1 to individual agents.
**Why it happens:** Pipeline stages are sequential (architect -> tool-resolver -> researcher -> spec-generator...) but the graph shows agents (orchestrator, researcher, spec-generator agents, etc.). The architect step output defines which agents exist.
**How to avoid:** Parse the architect step's result to extract agent names and relationships. Build the graph from this parsed output. Map subsequent pipeline steps to the most relevant agent node (e.g., "spec-generator" step lights up all agent nodes since it generates specs for all agents).
**Warning signs:** Graph shows pipeline stages instead of agents, or nodes don't light up correctly.

### Pitfall 4: Broadcast Message Size Limits
**What goes wrong:** Large payloads (full step results with LLM output) fail to send or are truncated.
**Why it happens:** Supabase Broadcast is designed for lightweight signaling, not bulk data transfer.
**How to avoid:** Send only status metadata in Broadcast events (step name, status, duration, counts). Fetch full data from Supabase tables when needed (e.g., on node click for agent details).
**Warning signs:** Broadcast `send()` returns errors, client receives partial data.

### Pitfall 5: Race Between Server Render and Broadcast
**What goes wrong:** Server component fetches stale data, then Broadcast delivers the update, causing a flash of old state.
**Why it happens:** Next.js server component renders before the client mounts and subscribes to Broadcast.
**How to avoid:** Server component provides initial state. Client component initializes from server data, then overlays Broadcast updates. Use a ref or state to merge server + real-time data.
**Warning signs:** Brief flash of "pending" status that immediately changes to "running", data jumping backward.

### Pitfall 6: ReactFlow CSS Import Required
**What goes wrong:** Graph renders but is invisible or unstyled -- nodes and edges don't appear.
**Why it happens:** React Flow requires its base CSS to be imported. Missing the import is the #1 beginner mistake.
**How to avoid:** Import `@xyflow/react/dist/style.css` in the graph component or in the root layout.
**Warning signs:** ReactFlow container renders at 0 height, nodes exist in DOM but are invisible.

## Code Examples

### Broadcast Emission from Inngest Pipeline Function
```typescript
// In web/lib/inngest/functions/pipeline.ts -- additions
// After updating step status to "running":
await broadcastStepUpdate(runId, {
  stepName: stage.name,
  status: "running",
  displayName: stage.displayName,
  stepsCompleted: currentRun?.steps_completed || 0,
  runStatus: "running",
});

// After updating step status to "complete":
await broadcastStepUpdate(runId, {
  stepName: stage.name,
  status: "complete",
  displayName: stage.displayName,
  durationMs,
  stepsCompleted: (currentRun?.steps_completed || 0) + 1,
  runStatus: "running",
  log: `Completed ${stage.displayName} in ${Math.round(durationMs / 1000)}s`,
});

// After marking run complete:
await broadcastRunUpdate(runId, {
  status: "complete",
  stepsCompleted: PIPELINE_STAGES.length,
});
```

### Client Broadcast Subscription Hook
```typescript
// Generic hook for any Broadcast channel
export function useBroadcast<T>(
  channelName: string,
  eventName: string,
  onMessage: (payload: T) => void
) {
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: eventName }, ({ payload }) => {
        callbackRef.current(payload as T);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, eventName]);
}
```

### Graph-Primary Run Detail Layout
```typescript
// Conceptual layout structure for run-detail-live.tsx
<div className="flex h-[calc(100vh-theme(spacing.16))]">
  {/* Graph takes full remaining space */}
  <div className="flex-1 relative">
    <ReactFlowProvider>
      <SwarmGraph
        runId={runId}
        steps={steps}
        runStatus={runStatus}
      />
    </ReactFlowProvider>
  </div>

  {/* Collapsible timeline drawer */}
  <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
    <SheetTrigger asChild>
      <Button variant="outline" size="sm" className="absolute right-4 top-4 z-10">
        Timeline
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-[400px]">
      <SheetHeader>
        <SheetTitle>Pipeline Steps</SheetTitle>
      </SheetHeader>
      {steps.map((step, i) => (
        <StepLogPanel key={step.id} step={step} isLast={i === steps.length - 1} />
      ))}
    </SheetContent>
  </Sheet>
</div>
```

### Confetti on Pipeline Completion
```typescript
import confetti from "canvas-confetti";

function celebrateCompletion() {
  // Burst from both sides
  const count = 200;
  const defaults = { origin: { y: 0.7 }, zIndex: 9999 };

  confetti({ ...defaults, angle: 60, spread: 55, origin: { x: 0 }, particleCount: count / 2 });
  confetti({ ...defaults, angle: 120, spread: 55, origin: { x: 1 }, particleCount: count / 2 });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-flow-renderer (v10) | @xyflow/react (v12) | 2024 | New package name, TypeScript-first, SSR support, better DX |
| Supabase Postgres Changes for live updates | Supabase Broadcast | 2024+ | No RLS bottleneck, lower latency, works from server-side |
| useNodesState() + setNodes() | useReactFlow().updateNodeData() | v12 | Targeted updates without full re-render |
| dagre (original) | @dagrejs/dagre 3.0 | 2024 | Maintained fork, ESM support, TypeScript definitions |

**Deprecated/outdated:**
- `reactflow` npm package: Replaced by `@xyflow/react` in v12. Do not install the old package.
- `dagre` npm package: Unmaintained. Use `@dagrejs/dagre` (the maintained fork).

## Open Questions

1. **Architect step output format**
   - What we know: The architect step produces a text output via Claude describing the agent swarm architecture. This output is stored in `pipeline_steps.result.output`.
   - What's unclear: The exact structure of this text output -- is it structured (JSON/XML) or freeform? This determines how to parse agent names, roles, and relationships for the graph.
   - Recommendation: Parse the architect output in `graph-mapper.ts`. If it's freeform markdown, use regex/string parsing to extract agent definitions. If structured, parse directly. May need to add a post-processing step or structured output format to the architect prompt for clean extraction.

2. **Agent performance scores source**
   - What we know: GRAPH-04 requires scores on nodes after completion. The pipeline currently stores step results but no explicit "performance scores" field.
   - What's unclear: Where scores come from -- the dataset-generator step? A future testing phase? Or derived from step completion times?
   - Recommendation: Display placeholder scores or derive from available data (step duration, completion status). The CONTEXT.md says "performance scores after pipeline completion" which suggests scores may come from a future test/eval phase. For now, show completion status and step durations as proxy metrics, with the UI ready to display real scores when available.

3. **Broadcast channel per run vs global channel**
   - What we know: Need both per-run updates (run detail) and run-list updates (run list pages).
   - What's unclear: Whether to use one channel per run + one global channel, or a single channel with filtered events.
   - Recommendation: Two channel patterns: `run:{runId}` for per-run step updates (subscribed by run detail page), and `runs:live` for run-level status changes (subscribed by run list pages). This keeps payloads minimal and subscriptions focused.

## Validation Architecture

> nyquist_validation not explicitly configured in config.json -- treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x |
| Config file | web/vitest.config.ts (needs verification) |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Broadcast events trigger UI updates | unit | `npx vitest run tests/broadcast.test.ts -x` | Wave 0 |
| DASH-02 | Step descriptions render correctly | unit | `npx vitest run tests/step-log-panel.test.ts -x` | Wave 0 |
| DASH-03 | Timeline renders with correct state indicators | unit | `npx vitest run tests/step-log-panel.test.ts -x` | Wave 0 |
| DASH-04 | Run list receives and applies Broadcast updates | unit | `npx vitest run tests/run-list-live.test.ts -x` | Wave 0 |
| GRAPH-01 | React Flow renders with custom nodes and edges | unit | `npx vitest run tests/swarm-graph.test.ts -x` | Wave 0 |
| GRAPH-02 | Agent nodes display name, role, tool count | unit | `npx vitest run tests/agent-node.test.ts -x` | Wave 0 |
| GRAPH-03 | Node status classes update on Broadcast events | unit | `npx vitest run tests/swarm-graph.test.ts -x` | Wave 0 |
| GRAPH-04 | Score display renders after completion | unit | `npx vitest run tests/agent-node.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/tests/broadcast.test.ts` -- covers DASH-01, broadcast helper unit tests
- [ ] `web/tests/agent-node.test.ts` -- covers GRAPH-02, GRAPH-04
- [ ] `web/tests/swarm-graph.test.ts` -- covers GRAPH-01, GRAPH-03
- [ ] Verify vitest config exists and runs

## Sources

### Primary (HIGH confidence)
- [React Flow v12 Official Docs](https://reactflow.dev) - custom nodes, custom edges, animated edges, dagre layout, useReactFlow API
- [React Flow npm @xyflow/react 12.10.1](https://www.npmjs.com/package/@xyflow/react) - version verified
- [Supabase Broadcast Docs](https://supabase.com/docs/guides/realtime/broadcast) - channel API, send/subscribe pattern, REST API
- [@dagrejs/dagre 3.0.0 on npm](https://www.npmjs.com/package/@dagrejs/dagre) - version verified
- [canvas-confetti 1.9.4 on npm](https://www.npmjs.com/package/canvas-confetti) - version verified

### Secondary (MEDIUM confidence)
- [GitHub Discussion: Broadcast from Edge Functions](https://github.com/orgs/supabase/discussions/17124) - server-side broadcast pattern with admin client
- [React Flow Dagre Example](https://reactflow.dev/examples/layout/dagre) - getLayoutedElements pattern
- [React Flow Animating Edges Example](https://reactflow.dev/examples/edges/animating-edges) - SVG animateMotion pattern

### Tertiary (LOW confidence)
- None -- all findings verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified on npm, versions confirmed, official docs reviewed
- Architecture: HIGH - Patterns taken directly from official React Flow examples and Supabase docs; existing codebase well understood
- Pitfalls: HIGH - Based on official docs, community discussions, and direct codebase analysis of existing polling/pipeline code

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable ecosystem, no breaking changes expected)
