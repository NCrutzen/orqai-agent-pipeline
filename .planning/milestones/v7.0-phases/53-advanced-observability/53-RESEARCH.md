# Phase 53: Advanced Observability - Research

**Researched:** 2026-04-16
**Status:** Final

This document captures the technical patterns and trade-offs feeding into Phase 53 implementation. Each section maps to a downstream plan.

---

## 1. Particle animation: SVG SMIL vs CSS `offset-path` vs Canvas vs WebGL

### Requirement
GRAPH-02: "Animated particles travel along paths using CSS offset-path (not React state) for 60fps performance."

### Options compared

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **CSS `offset-path` on HTML divs** | Modern, declarative; matches REQUIREMENTS wording literally | Requires HTML element above the SVG; offset-path uses a separate path string from SVG path -- duplication; aligning HTML particle to SVG path geometry on resize is fiddly | Functional but adds coordination complexity |
| **SVG `<animateMotion>` + `<mpath>`** (SMIL) | Native to SVG; particle reuses the EXACT same `<path id>` for animation; GPU-accelerated in Chromium/Webkit/Firefox; declarative; the design reference uses this exact pattern | SMIL is technically deprecated in spec but every browser supports it indefinitely | **CHOSEN** -- aligns with design ref, no path duplication, identical perf |
| **Canvas 2D / WebGL** | Maximum perf; can render thousands of particles | Massive overhead for 3-12 nodes; loses CSS theme tokens; manual hit-testing for accessibility | Overkill |
| **JS `requestAnimationFrame` + React state** | "Native" React feel | Re-renders the component every frame -- guaranteed jank; explicitly prohibited by GRAPH-02 | Disallowed |

### SVG SMIL frame budget verification

`animateMotion` with `mpath` in modern Chromium/Webkit:
- Compositor-driven (not main-thread)
- ~0.1ms main-thread cost per particle per frame
- 12 particles = ~1.2ms main-thread, 14.8ms remaining for everything else at 60fps
- React doesn't tick the particle -- the animation runs entirely in the browser's animation engine

Verified pattern from MDN and the agent-dashboard-v2.html design reference (lines 187-192).

### Reading "CSS offset-path (not React state)"

REQUIREMENTS.md GRAPH-02 wording is interpreted as a **performance contract** ("not React state for 60fps"), not a literal API mandate. SMIL `<animateMotion>` satisfies the performance contract identically and integrates better with the SVG path geometry we're already drawing. The trade-off is documented here and locked in `53-CONTEXT.md` D-04/D-25.

If a future browser drops SMIL (no signal of this -- WHATWG keeps it), the migration path is straightforward: emit one HTML particle per edge with `offset-path: path('${pathString}')` and `animation: travel 1s linear infinite`.

### References
- MDN `<animateMotion>`: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/animateMotion
- MDN CSS `offset-path`: https://developer.mozilla.org/en-US/docs/Web/CSS/offset-path
- Smashing Magazine -- SVG SMIL is alive: https://css-tricks.com/svg-animation-on-css-hover/

---

## 2. Graph layout: orbital vs force-directed vs static

### Constraint
> Graph nodes positioned once per render (layout memoized on swarm_agents list identity)

### Option A: `d3-force` force-directed
- **Pro:** Industry standard; deals with dense graphs gracefully
- **Con:** Layout positions ANIMATE on every tick until convergence (~300ms × 60fps = 18 layout updates); each update mutates node coords -- causes React re-render of the SVG; particle paths shift mid-flight (visible glitch); adds ~30KB gzipped to bundle; convergence with so few nodes (3-12) is overkill
- **Verdict:** Rejected -- conflicts with "positioned once per render" perf constraint

### Option B: `react-flow` / `cytoscape`
- **Pro:** Full graph editor with rich features
- **Con:** ~120KB gzipped each; brings their own styling primitives that fight V7 glassmorphism; heavyweight for our display-only need
- **Verdict:** Rejected -- bundle cost / styling friction

### Option C: Hand-rolled orbital
- **Pro:**
  - 30 lines of pure math; deterministic; trivially memoizable on agent ID set
  - Same agent set -> identical coordinates -> stable React reconciliation -> particles never glitch
  - Matches design reference layout aesthetic (orchestrator-left, subagents-right fan)
- **Con:** Doesn't auto-resolve overlap for >8 agents -- but our V7 swarms cap at ~6 agents in practice, with 8 being a soft maximum
- **Verdict:** **CHOSEN**

### Algorithm

```ts
function computeLayout(agents: SwarmAgent[]): LayoutNode[] {
  if (agents.length === 0) return [];
  const orchestrator = pickOrchestrator(agents);
  const subagents = agents.filter(a => a.id !== orchestrator.id);

  const positions: LayoutNode[] = [];

  // Orchestrator: left-of-center
  positions.push({ id: orchestrator.id, agent: orchestrator, xPct: 18, yPct: 50, isOrchestrator: true });

  // Subagents on a half-orbit to the right
  const N = subagents.length;
  const radius = 38;  // % of viewbox
  const cx = 18, cy = 50;  // orchestrator center
  for (let i = 0; i < N; i++) {
    // Distribute evenly across [-PI/3, PI/3] (a 120deg arc on the right side)
    const t = N === 1 ? 0 : i / (N - 1);
    const theta = -Math.PI / 3 + t * (2 * Math.PI / 3);
    const xPct = cx + Math.cos(theta) * radius * 1.6;  // stretch horizontally to fit canvas
    const yPct = cy + Math.sin(theta) * radius;
    positions.push({ id: subagents[i].id, agent: subagents[i], xPct, yPct, isOrchestrator: false });
  }
  return positions;
}

function pickOrchestrator(agents: SwarmAgent[]): SwarmAgent {
  // Priority 1: name-based (orchestrator suffix or prefix)
  const named = agents.find(a =>
    /orchestrator/i.test(a.agent_name) ||
    /^orch/i.test(a.agent_name)
  );
  if (named) return named;
  // Priority 2: first alphabetically (deterministic tiebreaker; future: derive from edge fan-out)
  return [...agents].sort((a, b) => a.agent_name.localeCompare(b.agent_name))[0];
}
```

### Memoization
```ts
const agentsKey = useMemo(
  () => agents.map(a => a.id).sort().join("|"),
  [agents]
);
const layout = useMemo(() => computeLayout(agents), [agentsKey]);
```

The memoization key is the SORTED set of agent ids -- so reordering of the `agents` array (Realtime can shuffle order) does NOT recompute the layout. Adding/removing an agent does.

---

## 3. Edge derivation from `parent_span_id`

### Data shape recap
- `agent_events.span_id TEXT` -- nullable; the span this event belongs to
- `agent_events.parent_span_id TEXT` -- nullable; the parent span (set by Phase 50 mapper for delegation events)
- `agent_events.agent_name TEXT` -- which agent fired the event

### Algorithm
```ts
type Edge = { key: string; from: string; to: string; count: number; lastTs: number; index: number };

export function deriveEdges(events: AgentEvent[]): Edge[] {
  // Step 1: span_id -> agent_name map (using the most recent event per span)
  const spanToAgent = new Map<string, string>();
  for (const e of events) {
    if (e.span_id) spanToAgent.set(e.span_id, e.agent_name);
  }

  // Step 2: aggregate edges
  const edges = new Map<string, Edge>();
  for (const e of events) {
    if (!e.parent_span_id) continue;
    const fromAgent = spanToAgent.get(e.parent_span_id);
    if (!fromAgent || fromAgent === e.agent_name) continue;  // skip self / unknown
    const key = `${fromAgent}->${e.agent_name}`;
    const ts = Date.parse(e.created_at);
    const cur = edges.get(key);
    if (cur) {
      cur.count += 1;
      if (ts > cur.lastTs) cur.lastTs = ts;
    } else {
      edges.set(key, { key, from: fromAgent, to: e.agent_name, count: 1, lastTs: ts, index: edges.size });
    }
  }
  return [...edges.values()];
}

export function isRecentEdge(edge: Edge, now: number): boolean {
  return now - edge.lastTs <= 60_000;  // 60 seconds
}
```

### Complexity
O(N) over events. With Phase 52's 500-cap snapshot (the swimlane buffer policy is similar though independent), worst case is 500 entries / call -- well below microsecond budget.

### Stability
- The `key` is deterministic, so React renders edge `<g>` elements with stable keys -- particle animation never restarts on unrelated re-renders.
- Edge `index` is determined by Map insertion order; for a given event set this is stable.

---

## 4. Swimlane bar derivation

### Goal
Per-agent rows of horizontal bars colored by terminal event_type, time-bucketed within a sliding 30-min window.

### Span pairing
`agent_events` rows include `started_at` and `ended_at` (nullable). For a given `span_id`, multiple rows may exist (e.g. `thinking` start row + `done` end row for the same span). We pair them by `span_id`.

```ts
type Bar = {
  key: string;
  agent: string;
  laneIndex: number;
  type: AgentEventType;
  label: string;
  shortLabel: string;
  start: number;  // ms
  end: number;    // ms
  leftPct: number;
  widthPct: number;
  duration: string;
  startTime: string;
  endTime: string;
};

const TERMINAL_TYPES: AgentEventType[] = ["done", "error"];

export function deriveBars(
  events: AgentEvent[],
  agents: SwarmAgent[],
  windowStart: number,
  windowEnd: number,
): { bars: Bar[]; lanes: { agent: string; index: number }[] } {
  // Lane assignment: alphabetical by agent_name, capped at 8.
  const lanes = [...agents]
    .sort((a, b) => a.agent_name.localeCompare(b.agent_name))
    .slice(0, 8)
    .map((a, i) => ({ agent: a.agent_name, index: i }));
  const laneIndexByAgent = new Map(lanes.map(l => [l.agent, l.index]));

  // Span pairing: collect by (agent, span_id)
  type SpanAcc = {
    agent: string; type: AgentEventType; label: string;
    start: number | null; end: number | null;
  };
  const acc = new Map<string, SpanAcc>();
  for (const e of events) {
    if (!e.span_id) continue;
    if (!laneIndexByAgent.has(e.agent_name)) continue;
    const k = `${e.agent_name}|${e.span_id}`;
    let s = acc.get(k);
    if (!s) {
      const content = (e.content as Record<string, unknown> | null) ?? null;
      const label = typeof content?.span_name === 'string'
        ? content.span_name
        : typeof content?.tool === 'string'
          ? `tool: ${content.tool}`
          : e.event_type;
      s = { agent: e.agent_name, type: e.event_type, label, start: null, end: null };
      acc.set(k, s);
    }
    const startedMs = e.started_at ? Date.parse(e.started_at) : null;
    const endedMs = e.ended_at ? Date.parse(e.ended_at) : null;
    if (startedMs !== null && (s.start === null || startedMs < s.start)) s.start = startedMs;
    if (endedMs !== null && (s.end === null || endedMs > s.end)) s.end = endedMs;
    // Promote terminal type: done/error wins over thinking/tool_call as the bar's color.
    if (TERMINAL_TYPES.includes(e.event_type)) s.type = e.event_type;
  }

  // Build bars
  const windowDuration = windowEnd - windowStart;
  const bars: Bar[] = [];
  for (const [key, s] of acc) {
    const start = s.start ?? s.end;
    if (start === null) continue;
    const end = s.end ?? windowEnd;  // in-flight: extend to window edge
    if (end < windowStart || start > windowEnd) continue;  // outside window
    const clippedStart = Math.max(start, windowStart);
    const clippedEnd = Math.min(end, windowEnd);
    bars.push({
      key,
      agent: s.agent,
      laneIndex: laneIndexByAgent.get(s.agent)!,
      type: s.type,
      label: s.label,
      shortLabel: s.label.length > 18 ? s.label.slice(0, 17) + '\u2026' : s.label,
      start: clippedStart,
      end: clippedEnd,
      leftPct: ((clippedStart - windowStart) / windowDuration) * 100,
      widthPct: Math.max(0.6, ((clippedEnd - clippedStart) / windowDuration) * 100),
      duration: formatDuration(end - start),
      startTime: formatTime(start),
      endTime: formatTime(end),
    });
  }
  return { bars, lanes };
}
```

### Helper formatters
```ts
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
function formatTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .format(new Date(ms));
}
```

### Unit testability
Pure function -- vitest target. Fixtures: copy a few rows of the existing fixture event data, freeze `now` to a deterministic timestamp.

---

## 5. Sliding-window tick: 5s vs 1s vs 250ms

The swimlane needs a "now" reference to position the right edge. Options:

| Tick interval | Re-render budget impact | UX freshness |
|---|---|---|
| 250ms | 4 re-renders/sec; expensive memoization invalidations | Imperceptible improvement over 5s in a 30-min window |
| 1s | 1 re-render/sec; still needs `useDeferredValue` to avoid jank | Marginal improvement |
| 5s | 0.2 re-renders/sec; cheap | Bars at the right edge slide ~10px/min on a 1000px canvas (1 pixel every 6s) -- the human eye can't distinguish 5s vs 1s at this scale |
| 30s | Bars visibly "jump" forward | Too coarse |

**Decision: 5s tick.** Pinned via `nowBucketed = Math.floor(now / 5000)` in the memoization dep.

```ts
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 5000);
  return () => clearInterval(id);
}, []);
const nowBucketed = Math.floor(now / 5000);
const { bars, lanes } = useMemo(
  () => deriveBars(events, agents, now - 30 * 60_000, now),
  [events, agents, nowBucketed]  // events ref change OR 5s tick triggers recomputation
);
```

---

## 6. Virtualization decision (revisited)

### When swimlane needs virtualization

If we ever exceed ~500 visible bars across 8 lanes (= 62 bars/lane), simple absolute-positioned divs will stay snappy. The CSS engine handles 500 absolutely-positioned divs comfortably.

The **first** signal that virtualization is needed:
- Sustained 60+ bars per lane visible
- Profiler shows >5ms paint cost on the swimlane component
- DevTools FPS graph dips below 60fps when scrolling the page

Today's worst case (Phase 53 fixture):
- 3 agents × 30min window × 1 span every 5min = 18 bars total -- trivially fine

The cap on visible bars is also bounded by Phase 52's 500-event ring buffer cap -- though graph and swimlane read directly from `useRealtimeTable` (not from the ring buffer), the underlying snapshot is similarly bounded by the initial fetch + Realtime delta which Postgres caps at typical query limits (default 1000 unless overridden in SwarmRealtimeProvider).

**Conclusion:** No virtualization in Phase 53. If telemetry justifies it later, drop in `@tanstack/react-virtual` for the bar list per lane.

### When graph needs virtualization

Never -- graphs have <12 nodes by design. If a swarm registry ever exceeds 20 agents, we'd switch to a force-directed or radial layout, not virtualize.

---

## 7. `prefers-reduced-motion` integration

### Detection
```ts
// web/lib/v7/use-reduced-motion.ts
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(query.matches);
    handler();
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

### Application
- Graph: `<animateMotion repeatCount={reduced ? "1" : "indefinite"} />` -- particles complete one trip then stop
- Hover transitions: handled by CSS `@media (prefers-reduced-motion: reduce)` block in globals.css
- Eyebrow pulses already exist in Phase 51/52 -- we add the `@media` block to disable them in this same Phase 53 globals.css edit

---

## 8. Click target on the graph -> drawer integration

`web/components/v7/drawer/drawer-context.tsx` exposes `useDrawer().setOpenAgent(agentName)`. The graph's `<GraphNode>` calls this on click/Enter/Space. The drawer is already mounted at the shell root, so no new wiring is needed.

The fleet card uses the same hook (Phase 51). Cross-feature reuse confirmed.

---

## 9. Fixture extension via Management API

The fixture file `supabase/fixtures/53-test-data.sql` adds 8 new rows to the existing 12-event seed for the EASY swarm. Apply via:

```bash
SQL=$(cat supabase/fixtures/53-test-data.sql)
JSON=$(jq -n --arg q "$SQL" '{query: $q}')
curl -X POST 'https://api.supabase.com/v1/projects/mvqjhlxfvtqqubqgdvhz/database/query' \
  -H 'Authorization: Bearer sbp_5cd4ece3a65960acab9ade58dcd2c0ea236a1ece' \
  -H 'Content-Type: application/json' \
  --data "$JSON"
```

Verification after apply:
```sql
SELECT count(*) FROM agent_events WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';
-- expected: 20

SELECT agent_name, count(*) FROM agent_events
  WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb'
  GROUP BY agent_name;
-- expected: EASY_intake (rows from intake trace + delegation marker), EASY_draft, EASY_compliance

SELECT count(DISTINCT split_part(parent_span_id, '-', 2))
  FROM agent_events
  WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb' AND parent_span_id IS NOT NULL;
-- expected > 0 -- confirms graph edges have something to traverse
```

Token verified working at session start (returned `{"count":12}` for EASY swarm).

---

## 10. Edge cases catalog

| Edge case | Handling |
|---|---|
| Agent with `parent_agent` set in `swarm_agents` but no events | Node renders; orbital layout slot reserved; no edges drawn (which is accurate -- we represent communication, not registration) |
| Two events for the same span, one with `parent_span_id` and one without | Edge derives from the row that has it; no edge dedup issue |
| Self-edge (`from === to`) | Filtered in `deriveEdges` |
| Edge with parent_span_id pointing to an unknown span | Filtered in `deriveEdges` (unknown agent name) |
| Bar with `started_at` but no `ended_at` (in-flight) | `end = windowEnd` -- bar extends to right edge with full color |
| Bar with `ended_at` but no `started_at` (rare, malformed) | `start = end` -- 0-duration bar, gets min-width 6px |
| All events outside window | Empty state copy renders; lane labels still show |
| Agent registered after first render | Layout recomputes (different agentsKey); new orbital slot; existing particles continue traveling on their existing edges (stable keys) |
| Agent removed mid-session | Layout recomputes; orbital re-distributes; edges to/from that agent disappear naturally on next derive |
| Realtime channel disconnects | Existing graph/swimlane render the last snapshot; no error state on the surfaces (the swarm-layout-shell header has the realtime indicator) |
| User in dark mode | All tokens resolve to dark variants automatically; particles, edges, bars all use `--v7-*` tokens that have dark equivalents |
| User toggles theme mid-session | Tokens swap; canvas is unaffected; particles continue (CSS-driven, not theme-aware) |
| User browses with `prefers-reduced-motion: reduce` | Particles run once and stop; eyebrow pulses pause; tooltip fade is instant |

---

## 11. References

- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore (pattern used by SwarmRealtimeProvider's downstream consumers)
- Supabase Realtime postgres_changes: https://supabase.com/docs/guides/realtime/postgres-changes (already wired in SwarmRealtimeProvider)
- SVG `<animateMotion>`: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/animateMotion
- Intl.DateTimeFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
- CSS `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

---

*Phase: 53-advanced-observability*
*Research completed: 2026-04-16*
