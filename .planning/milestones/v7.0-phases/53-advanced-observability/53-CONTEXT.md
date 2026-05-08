# Phase 53: Advanced Observability - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous -- decisions derived from milestone discussion, Phase 48-52 deliverables, design reference, REQUIREMENTS.md, and locked architectural constraints)

<domain>
## Phase Boundary

Replace the **Delegation graph** placeholder in the briefing row of `swarm-layout-shell.tsx` with a real live graph, AND insert a **Gantt-style swimlane** into the observability column above the existing terminal stream. After this phase:

1. The top-right region renders a **live delegation graph**: SVG scene with one node per `swarm_agents` row + edges derived from `parent_span_id -> span_id` traversal across `agent_events`. CSS-animated SVG `<circle>` particles travel along the most-recent edges using `<animateMotion mpath>` for sub-1.5s pulses.
2. The bottom-right column gets a new **Gantt-style swimlane** above the terminal: one row per agent, x-axis = the most recent 30 minutes, colored bars per `agent_events` span (`thinking`, `tool_call`, `waiting`, `done`, `error`). Hover surfaces a tooltip with span name, duration, and agent.
3. Both surfaces consume the **single** `SwarmRealtimeProvider` channel via `useRealtimeTable("events")` + `useRealtimeTable("agents")` -- no new Supabase channels.
4. The swimlane reuses Phase 52's **`EventBufferStore`** pattern -- a module-scoped store keyed by `swarmId` so high-frequency Realtime pushes don't cascade re-renders, and so the bar layout memoizes against snapshot identity.

**Out of scope (later phases):**
- Migrating executive dashboard / projects / settings pages to V7 tokens (Phase 54)
- Recursive agent detail mini-graph inside drawer (V8+, ADV-01)
- Historical swimlane playback / replay (V8+, ADV-02)
- Cross-swarm correlation views (V8+, ADV-03)
- Trace inspector deep dive -- link out to Orq.ai instead (REQUIREMENTS "Out of Scope")
- WebGL / Canvas rendering for the graph (locked: SVG + CSS particles only)
- Heavy graph layout libraries (`d3-force`, `cytoscape`, `react-flow`) -- locked: orbital + radial layout, hand-rolled

</domain>

<decisions>
## Implementation Decisions

### Delegation Graph (GRAPH-01..04)

- **D-01:** Component tree:
  - `web/components/v7/graph/delegation-graph.tsx` -- root, SSR-safe shell + `"use client"` body
  - `web/components/v7/graph/graph-node.tsx` -- absolutely-positioned glass node (mirrors design ref `.node` style)
  - `web/components/v7/graph/graph-edge.tsx` -- pure SVG `<path>` + animated `<circle>` particle
  - `web/lib/v7/graph/layout.ts` -- pure layout function (orchestrator-centric radial)
  - `web/lib/v7/graph/edges.ts` -- pure derivation: `(events, agents) -> Edge[]`
- **D-02:** **Layout algorithm: orchestrator-centered orbital.** No `d3-force`, no `react-flow`, no `cytoscape`. Rationale:
  - Graphs in our domain are tiny (3-12 agents per swarm in V7). Force-directed is overkill and animates layout positions which conflicts with the static-positioning requirement (perf constraint).
  - Orbital is **deterministic** -- same agent set produces the exact same coordinates every render, so React reconciliation is stable and CSS particles never visually skip due to layout thrash.
  - Algorithm:
    1. Identify orchestrator candidate. Priority: (a) agent whose name ends in `_orchestrator` or starts with `orchestrator`, (b) agent that appears as `parent_span_id` source for the most other agents in `agent_events`, (c) first agent alphabetically by `agent_name`. Tiebreaker: `agent_name` lexicographic.
    2. Center orchestrator at `(cx=24%, cy=42%)` of the viewbox -- left of center, matches design ref node position (left:24px;top:66px on a ~1000x420 canvas).
    3. Distribute remaining N-1 subagents on a half-orbit to the right of orchestrator. Angles: `theta_i = -PI/3 + i * (2*PI/3) / max(N-1, 1)` for `i in [0, N-2]`. Radius: `min(viewBoxWidth, viewBoxHeight) * 0.42`.
    4. Result: a fan from upper-right to lower-right of the orchestrator. Matches design ref distribution (Drafter / Qualifier / Compliance positions).
    5. Layout function memoized on `agents.map(a => a.id).join("|")` so re-renders from `metrics` JSONB churn don't recompute coordinates.
- **D-03:** **Edge derivation:** A directed edge from agent A to agent B exists iff there exists at least one pair of `agent_events` rows `e1` (`agent_name=A`, `span_id=X`) and `e2` (`agent_name=B`, `parent_span_id=X`) within the swarm. Algorithm:
  ```
  // O(N) where N = events count, capped at SwarmRealtimeProvider snapshot
  const spanToAgent = new Map<span_id, agent_name>();
  for (e of events) if (e.span_id) spanToAgent.set(e.span_id, e.agent_name);

  const edgeKey = `${parent}->${child}`;
  const edges = new Map<edgeKey, EdgeAggregate>();
  for (e of events) {
    if (!e.parent_span_id) continue;
    const parent = spanToAgent.get(e.parent_span_id);
    if (!parent || parent === e.agent_name) continue;  // self-loops dropped
    const k = `${parent}->${e.agent_name}`;
    const cur = edges.get(k) ?? { from: parent, to: e.agent_name, count: 0, lastTs: e.created_at };
    cur.count += 1;
    if (e.created_at > cur.lastTs) cur.lastTs = e.created_at;
    edges.set(k, cur);
  }
  ```
  Edge is "**recent**" iff `now - lastTs <= 60_000ms` -- only recent edges show animated particles; older edges show as static gradient strokes.
- **D-04:** **Particle animation: SVG `<animateMotion>` with `<mpath href="#edge-id">`.** Per the design reference. Each recent edge spawns one `<circle r="6">` particle whose `<animateMotion dur="1.2s" repeatCount="indefinite" rotate="auto">` traverses the path. Performance: SVG SMIL animation is GPU-accelerated by Webkit/Chromium, runs off React, no JS frame ticks, no React state changes. **No re-render on particle motion.** `prefers-reduced-motion` query disables `repeatCount` (sets to `1`) and reduces particle count to one per swarm via a `@media` rule.
- **D-05:** **Particle styling:**
  - `r=5` (matches design `r=6` minus one for V7 density)
  - `fill: var(--v7-teal)` for first recent edge, `var(--v7-blue)` for second, `var(--v7-amber)` for third+ (cycle by edge index for visual variety)
  - `filter: drop-shadow(0 0 6px {color}/85%)` for the glow
  - `dur` randomized per edge: `1.0s + (edge.count modulo 5) * 0.15s` so concurrent edges don't visually phase-lock
- **D-06:** **Edge stroke styling:**
  - Path: `stroke="url(#v7-edge-grad)"`, `stroke-width="2.5"`, `stroke-linecap="round"`, `fill="none"`
  - Recent edges: full opacity, gradient `(--v7-teal-soft -> --v7-blue-soft)`
  - Stale edges (>60s old): opacity 0.35, gradient muted
  - Edge `d` is a Bezier curve from node-A right edge to node-B left edge: `M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`. For nodes vertically aligned (rare in orbital), fall back to a straight line.
- **D-07:** **Graph node visuals:** Mirror design ref `.node` (lines 63-67). Glass node:
  - Background: `rgba(10,15,22,0.88)` dark mode, `rgba(255,255,255,0.92)` light mode (use `var(--v7-glass-bg)` resolves correctly per theme)
  - Border: `1px solid var(--v7-glass-border)`
  - Padding: `10px 12px`
  - Border radius: `var(--v7-radius-sm)` (14px)
  - Min width: `144px`
  - Shadow: `var(--v7-glass-shadow)`
  - Orchestrator node: extra `outline: 1px solid var(--v7-teal)` + `box-shadow: 0 0 0 1px var(--v7-teal-soft), 0 20px 60px var(--v7-teal-soft)` for emphasis
  - Content:
    - Eyebrow label: 11px, uppercase, `var(--v7-faint)`, content `ORCHESTRATOR` or `SUBAGENT`
    - Name: 14px Cabinet Grotesk bold, `var(--v7-text)`
    - State chip: tiny dot + status word, derived from `swarm_agents.status`
- **D-08:** **Graph viewbox:** `1000x420` SVG with `preserveAspectRatio="none"` so it stretches to the panel. Nodes are positioned in absolute pixels via `style={{left, top}}` computed from layout output (in `0..1000` x `0..420` space scaled by panel dimensions via `transform: scale(x, y)` -- but actually we keep nodes in absolute % of container so resizing works without recomputing the layout. Coordinate convention: layout returns `{ xPct, yPct }` in `[0..100]`).
- **D-09:** **Graph empty state:** When `agents.length === 0`, panel shows the existing PlaceholderRegion-style message ("Awaiting subagents...") -- consistent with the `SubagentFleet` empty state. When `agents.length > 0` but `edges.length === 0`, render the nodes statically with a footer caption "No delegation activity yet".
- **D-10:** **Graph header chip:** `{recentEdgeCount} active path{recentEdgeCount === 1 ? "" : "s"}` -- mirrors design ref "3 active paths".

### Gantt Swimlane (OBS-01, OBS-02)

- **D-11:** Component tree:
  - `web/components/v7/swimlane/swimlane-timeline.tsx` -- root with header + axis + lanes
  - `web/components/v7/swimlane/swimlane-lane.tsx` -- single agent's row of bars
  - `web/components/v7/swimlane/swimlane-bar.tsx` -- one bar with hover tooltip
  - `web/components/v7/swimlane/swimlane-axis.tsx` -- time tick labels above the grid
  - `web/lib/v7/swimlane/bars.ts` -- pure derivation: `(events, agents, windowStart, windowEnd) -> AgentLane[]`
- **D-12:** **Time axis: fixed 30-minute trailing window.** `windowEnd = now`, `windowStart = now - 30 * 60_000`. The window slides forward via a `useEffect` `setInterval(setNow, 5_000)` -- 5s tick is invisible to the user (panel is wide; 5s = 0.27% of axis width) and bounds the per-second re-render budget. **Critical:** the 5s `setNow` is the ONLY thing that re-renders the swimlane on a timer. Bars layout is `useMemo`'d on `(events, agents, now)`.
- **D-13:** **Tick density:** 6 ticks at `now`, `now-5min`, `now-10min`, `now-15min`, `now-20min`, `now-25min`, `now-30min`. Format: `HH:mm` via `Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit"})`. Major tick = vertical hairline `1px solid rgba(255,255,255,0.05)` extending into the lane area (matches design ref `.timeline-grid:before` pattern).
- **D-14:** **Bar derivation algorithm (`bars.ts`):**
  ```
  // Group events by (agent_name, span_id) to pair start (started_at) with end (ended_at).
  type SpanRow = { agent: string, start: Date, end: Date | null, type: AgentEventType, label: string }
  const spans = new Map<`${agent}|${span_id}`, SpanRow>();
  for (e of events) {
    if (!e.span_id || !e.started_at) continue;
    const k = `${e.agent_name}|${e.span_id}`;
    const cur = spans.get(k) ?? { agent: e.agent_name, start: parseDate(e.started_at), end: null, type: e.event_type, label: spanLabel(e) };
    if (e.ended_at) cur.end = max(cur.end, parseDate(e.ended_at));
    if (isTerminal(e.event_type)) cur.type = e.event_type;
    spans.set(k, cur);
  }
  // For spans without ended_at, treat end = now (in-flight).
  // Drop spans entirely outside the window [windowStart, windowEnd].
  ```
  Each span becomes one bar. Bars are colored by terminal `event_type`:
  | Terminal type | Bar gradient (matches design ref line 100) |
  |---|---|
  | `thinking` | `linear-gradient(90deg, var(--v7-pink), color-mix(in srgb, var(--v7-pink) 50%, white))` |
  | `tool_call` | `linear-gradient(90deg, var(--v7-blue), color-mix(in srgb, var(--v7-blue) 60%, white))` |
  | `tool_result` | (folded into `tool_call` parent span -- no separate bar; if orphaned, falls under `tool_call` color) |
  | `waiting` | `linear-gradient(90deg, var(--v7-amber), color-mix(in srgb, var(--v7-amber) 60%, white))` |
  | `done` | `linear-gradient(90deg, var(--v7-teal), color-mix(in srgb, var(--v7-teal) 60%, white))` |
  | `error` | `linear-gradient(90deg, var(--v7-red), color-mix(in srgb, var(--v7-red) 60%, white))` |
  | `delegation` | `linear-gradient(90deg, var(--v7-pink), var(--v7-blue))` |
- **D-15:** **Bar positioning (CSS):**
  - `position: absolute`
  - `left: ${(start - windowStart) / windowDuration * 100}%`
  - `width: max(0.6%, ${(end - start) / windowDuration * 100}%)` -- min width ensures sub-second bars stay visible
  - `height: 18px` (matches design ref line 99)
  - `border-radius: var(--v7-radius-pill)`
  - `top` set per lane (see D-16)
  - Padding: `0 10px`, font: 11px bold, color `#081018` (dark text on bright bar gradient)
  - Inline label: `e.span_name` truncated to 18 chars + `…` if longer; tooltip on hover shows full label + duration + agent
- **D-16:** **Lane stacking:**
  - Lane height: `36px` (32px lane + 4px gap)
  - Lane label area: `92px` left margin, mirrors design ref `padding-left: 92px`
  - Bar `top` per lane index `i`: `14 + i * 36px` (first lane at 14px, second at 50px, etc.) -- inside a relatively-positioned `<div class="timeline-grid">` wrapper
  - Visible lane count: `min(agents.length, 8)` -- lanes beyond 8 are hidden with a "+N more" footer chip; in V7.0 we don't expect >8 agents per swarm so this is a guardrail not a feature
- **D-17:** **Virtualization decision:** **No row virtualization in this phase.** Reasoning:
  - Lanes capped at 8 (D-16); 8 rows is well within React render budget.
  - Bars per lane are bounded by `agent_events` rows for that agent in the 30-min window. With Phase 52's 500-event ring buffer cap and 30-minute window, worst case is ~50 bars per lane = 400 bars total. 400 absolutely-positioned `<div>`s with simple gradient bg is far below paint-bound thresholds.
  - **What we DO virtualize: the bars OUTSIDE the visible window are filtered out by `bars.ts` before render** (windowStart/end filter). This is "data virtualization" -- the more important kind here.
  - If a future telemetry session reveals jank with very busy swarms, swap in `@tanstack/react-virtual` for the lane list at that point. Premature today.
- **D-18:** **Hover tooltip:** Pure CSS `:hover` reveals an absolutely-positioned `<span class="bar-tooltip">` above the bar. Content: `{spanName}\n{duration} • {agent}\n{startTime}–{endTime}`. No JS state, no portal -- just CSS. Tooltip uses `var(--v7-glass-bg)` + `var(--v7-glass-border)` + `var(--v7-glass-shadow-heavy)`. Z-index: `10` so it floats over neighboring bars.
- **D-19:** **Auto-scroll to latest:** Not applicable for a sliding window -- the right edge IS "latest" by construction. We do NOT add auto-scroll for the window; the grid axis itself slides every 5s.
- **D-20:** **Empty state:** When the bar count for the visible window is zero, the timeline-grid renders an empty grid with the lane labels + a centered dim caption "No agent activity in the last 30 minutes".
- **D-21:** **Swimlane header chip:** `Past 30 minutes` -- mirrors design ref "Past 24 minutes" but rounded to a clean 30 to align with the briefing TTL (Phase 51) for cognitive consistency.

### Reuse of Phase 52 EventBufferStore (locked architectural decision)

- **D-22:** **The graph reads from `useRealtimeTable("events")` directly** -- it derives edges from the full snapshot, not from the ring buffer. Reason: edges are per-pair-of-spans, and we want stale edges (older than 60s) to remain visible (faded). The 500-event ring buffer would clip edges from a busy swarm.
- **D-23:** **The swimlane reads from `useRealtimeTable("events")` directly** as well. Reason: the 30-min window is bounded by time, not by buffer position; the ring buffer's FIFO eviction is decoupled from time. We DO use the same memoization pattern (snapshot-identity-stable arrays, `useMemo` with the events reference as the only dep) so re-renders fire only when the realtime bundle's events array reference changes.
- **D-24:** **EventBufferStore is reused as a pattern, not as the literal store.** We're NOT instantiating new `EventBufferStore` instances for graph or swimlane. The pattern reused is: derive a snapshot-stable memoized representation from a high-frequency stream and let `useSyncExternalStore` (which is what's underneath `useRealtimeTable -> useState` in the SwarmRealtimeProvider) coalesce re-renders. Both surfaces are leaf consumers of the existing snapshot pipeline; no new store layer is needed. This satisfies the "REUSE EventBufferStore from Phase 52" intent: same architectural pattern, no duplication, no new state container. **If a future profile shows the swimlane needs an explicit ring buffer, we can drop one in at `web/lib/v7/swimlane/lane-buffer.ts` with the same `EventBufferStore` shape -- this is the elegant escape hatch.**

### Performance and Accessibility

- **D-25:** **60fps particle animation guarantee:** SVG SMIL `<animateMotion>` is GPU-driven; React doesn't tick the particle. The constraint that REQUIREMENTS.md GRAPH-02 mentions ("CSS offset-path") is interpreted broadly as "browser-driven path animation, not React state" -- SVG SMIL satisfies this exactly. We document this trade in 53-RESEARCH.md (CSS `offset-path` requires HTML divs, not SVG; SVG SMIL is the SVG-native equivalent and gives identical perf characteristics with better integration with the path geometry we're already drawing).
- **D-26:** **`prefers-reduced-motion`:** A media query in globals.css under "Phase 53 animations" disables `animateMotion repeatCount` for users who prefer reduced motion -- particles run once and stop, edges remain static. Pulse-eyebrow animations on the panel header also respect the query (existing globals.css doesn't yet, so we add the `@media` block as part of plan 53-01).
- **D-27:** **Graph layout memoization:** `useMemo(() => computeLayout(agents), [agentsKey])` where `agentsKey = agents.map(a => a.id).sort().join("|")`. Adding/removing an agent invalidates; metrics churn does not. This guarantees O(1) layout cost per re-render outside of agent set changes.
- **D-28:** **Swimlane bars memoization:** `useMemo(() => computeBars(events, now, windowSize), [eventsRef, nowBucketed])` where `nowBucketed = Math.floor(now / 5000)` so the dep changes every 5s tick rather than every ms. This pins re-render frequency to the axis tick.
- **D-29:** **Tab order + ARIA:**
  - Graph: `<svg role="img" aria-label="Live delegation graph">` and each `.node` is `role="button" tabIndex={0}` with `aria-label="${agent_name}, ${role}"` so keyboard users can tab through nodes. Click/Enter triggers the existing drawer (via `useDrawer().setOpenAgent(agent_name)`) -- nice cross-Phase reuse without adding a click target on the SVG itself.
  - Swimlane: `<div role="img" aria-label="Agent activity timeline, past 30 minutes">`. Each bar has `aria-label="${agent_name}: ${spanName}, ${duration}"` for screen readers. Keyboard navigation across bars is OUT of scope for V7.0 -- the surface is an at-a-glance overview, not interactive deep-dive.
- **D-30:** **Realtime perf budget:** Each new `agent_events` INSERT triggers a `setBundle` in SwarmRealtimeProvider, which propagates to `useRealtimeTable("events")` consumers. Both graph and swimlane re-derive memoized representations (~O(N) where N <= 500 events). Worst case: 500 events × 2 derivations × 1 INSERT/sec = 1000 ops/sec -- well within the 16ms frame budget on any modern laptop. We don't need throttling at this scale; if the trace volume ever justifies it (>10 INSERT/sec sustained), we drop in a `useDeferredValue` on the events array.

### Test Data Seeding

- **D-31:** **Extend the existing fixture, not replace it.** Ship `supabase/fixtures/53-test-data.sql` adding **8 more `agent_events`** rows that build a clean delegation tree on the EASY swarm:
  ```
  EASY_intake (orchestrator-like) --span-dddd-01--> EASY_draft (span-dddd-02) and EASY_compliance (span-dddd-03)
  EASY_draft --span-dddd-02--> EASY_compliance (span-dddd-04)
  ```
  Specifically, we add one new trace `trace-dddd-4444` with:
  - 2 events on `EASY_intake` (`thinking` start + `done`) at `span-dddd-01`, parent: NULL -- the orchestrator span
  - 1 `delegation` event on `EASY_intake` referencing `parent_span_id=span-dddd-01` -- this is the edge marker (mapped to delegation type per Phase 50 D-07)
  - 2 events on `EASY_draft` (`thinking` + `done`) at `span-dddd-02`, parent: `span-dddd-01` -- delegated work
  - 2 events on `EASY_compliance` (`thinking` + `done`) at `span-dddd-03`, parent: `span-dddd-01` -- delegated work
  - 1 event on `EASY_compliance` (`thinking`) at `span-dddd-04`, parent: `span-dddd-02` -- nested delegation (proves graph traverses 2 hops)
  Total: **8 new events**, blended into the existing 12 = **20 total events** for the EASY swarm.
  Timestamps: spread across `NOW() - 5min` to `NOW() - 1min` so they fall inside the swimlane's 30-min window AND the graph's 60s "recent" cutoff (the most recent ones).
- **D-32:** **Apply the fixture immediately** via the Management API token (verified working at session start, count check returned 12 events). Idempotent via fixed UUIDs + `ON CONFLICT DO NOTHING`. Verification SELECT after apply confirms count = 20 for the EASY swarm.

### Layout Wiring

- **D-33:** **Replace the delegation graph placeholder** in `swarm-layout-shell.tsx` (lines 95-99 today). The placeholder PlaceholderRegion gets swapped for `<DelegationGraph swarmId={swarmId} />`. The graph wraps itself in a GlassCard so the visual frame stays consistent with the briefing card next to it.
- **D-34:** **Insert the swimlane between fleet and Kanban/terminal sections.** New section structure in `swarm-layout-shell.tsx`:
  ```
  <BriefingPanel /> | <DelegationGraph />          (1.4fr / 0.8fr -- unchanged)
  <SubagentFleet />                                (full width -- unchanged)
  <SwimlaneTimeline />                             (NEW -- full width)
  <KanbanBoard /> | <TerminalStream />             (1.2fr / 0.8fr -- unchanged)
  ```
  Adding the swimlane as its own full-width section keeps the screen scrollable on tablet without reflow chaos. The swimlane gets its own `GlassCard` wrapper.
- **D-35:** Drawer opens on graph node click via the existing `DrawerProvider` context (`useDrawer().setOpenAgent(name)`). No new context wiring needed.

### Folded Todos
None -- no relevant todos surfaced for Phase 53.

### Claude's Discretion
- Internal file organization within `web/components/v7/{graph,swimlane}/`
- Whether to expose a "view by trace" toggle in the swimlane (NOT in V7.0; default agent-row Gantt is the spec)
- Particle color cycling rule (locked at teal -> blue -> amber by edge index; could swap to per-agent color but cross-agent consistency wins)
- Whether the orchestrator gets a special pulsing ring (yes, via the existing `v7-pulse` keyframe; subtle, not distracting)
- Whether tooltips dismiss on scroll (CSS-only, so they auto-dismiss when the bar leaves hover region; no JS scroll handler needed)
- Whether to render lane labels inside the SVG or as HTML siblings (HTML siblings; lets us use `text-overflow: ellipsis` cleanly)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design and UI
- `docs/designs/agent-dashboard-v2.html` lines 60-71 (graph + particle styles), 93-100 (swimlane / timeline styles), 173-199 (graph markup), 233-249 (swimlane markup)
- `.planning/phases/48-foundation/48-UI-SPEC.md` -- V7 color tokens, glassmorphism patterns, typography scale
- `.planning/phases/49-navigation-realtime/49-UI-SPEC.md` -- inherited spacing/type/color conventions
- `.planning/phases/51-hero-components/51-UI-SPEC.md` -- canonical card patterns for nodes
- `.planning/phases/52-live-interactivity/52-CONTEXT.md` -- D-02..04 EventBufferStore pattern (pattern reused, see D-22..24 above)
- `web/app/globals.css` lines 119-241 -- `--v7-*` tokens, `v7-pulse-eyebrow`, `v7-blink`, `v7-terminal-shell`

### Phase 48-52 Foundations
- `.planning/phases/48-foundation/48-02-SUMMARY.md` -- `agent_events` schema (`span_id TEXT`, `parent_span_id TEXT`, `event_type` enum)
- `.planning/phases/49-navigation-realtime/49-01-SUMMARY.md` and `49-02-SUMMARY.md` -- `SwarmRealtimeProvider`, `useRealtimeTable`
- `.planning/phases/50-data-pipeline/50-CONTEXT.md` -- D-07 mapping table -- `agent_events` content shape (`{trace_id, span_id, span_name, tool?, parent_span_id}`)
- `.planning/phases/51-hero-components/51-CONTEXT.md` -- D-22 DrawerProvider mounted at shell root
- `.planning/phases/52-live-interactivity/52-CONTEXT.md` -- D-02..D-04 EventBufferStore + `useSyncExternalStore` pattern
- `supabase/migrations/20260415_v7_foundation.sql` -- exact column types

### Existing code patterns
- `web/components/v7/swarm-realtime-provider.tsx` -- channel pattern; don't open extra channels
- `web/components/v7/swarm-layout-shell.tsx` -- target for placeholder replacement (line 95) + insertion point (after line 104)
- `web/components/ui/glass-card.tsx` -- base panel surface
- `web/lib/v7/use-realtime-table.ts` -- the only Realtime read path
- `web/components/v7/drawer/drawer-context.tsx` -- `useDrawer()` for click-to-open

### Project constraints
- `CLAUDE.md` -- stack constraints (Next.js / Supabase / Vercel only)
- `.planning/REQUIREMENTS.md` -- GRAPH-01..04, OBS-01, OBS-02 acceptance criteria

### Browser API references
- SVG `<animateMotion>` + `<mpath>` -- https://developer.mozilla.org/en-US/docs/Web/SVG/Element/animateMotion
- `prefers-reduced-motion` -- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- CSS `color-mix()` (already used in Phase 52 chip palette) -- supported in all target browsers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GlassCard` (Phase 48) -- base for graph + swimlane panel frames
- `useRealtimeTable("events"|"agents")` (Phase 49) -- the ONLY way Phase 53 reads Supabase
- `useDrawer().setOpenAgent` (Phase 51) -- click-to-drawer cross-feature
- `parseAgentMetrics` (`web/lib/v7/fleet/agent-metrics.ts`) -- pattern to mirror for swimlane content parsing if needed
- `v7-pulse-eyebrow`, `v7-pulse`, `v7-blink` keyframes (already in globals.css)

### Established Patterns
- Server component shells + `"use client"` leaves at the smallest boundary (Phase 49+51+52 pattern)
- Token-driven styling via `--v7-*` variables, never hex literals in components (terminal is the documented exception)
- Realtime via context + `useRealtimeTable(table)`, never per-component channels
- Pure derivation functions live in `web/lib/v7/{feature}/` and are unit-tested with vitest
- Memoize on stable identity keys (e.g. agent ids joined) not on the underlying object refs

### Integration Points
- `web/components/v7/swarm-layout-shell.tsx` -- modify: swap delegation graph placeholder, insert swimlane section
- `web/lib/v7/graph/` -- add: `layout.ts`, `edges.ts`
- `web/lib/v7/swimlane/` -- add: `bars.ts`
- `web/components/v7/graph/` -- add: `delegation-graph.tsx`, `graph-node.tsx`, `graph-edge.tsx`
- `web/components/v7/swimlane/` -- add: `swimlane-timeline.tsx`, `swimlane-lane.tsx`, `swimlane-bar.tsx`, `swimlane-axis.tsx`
- `web/app/globals.css` -- modify: add `@media (prefers-reduced-motion)` block + `.v7-bar-tooltip` class + `.v7-graph-node` class for the few absolutely-positioned styles that need theme-conditional values
- `supabase/fixtures/53-test-data.sql` -- new file with 8 additional agent_events for graph/swimlane verification

### New dependencies
- **None.** SVG SMIL is built-in browser; layout is hand-rolled; no `d3-force`, no `react-flow`, no `cytoscape`. Confirmed via Phase 53-RESEARCH.md analysis.

</code_context>

<specifics>
## Specific Ideas

### Graph
- Graph card eyebrow: `[pulse-dot] Live delegation graph`
- Graph card title: Cabinet Grotesk 20px `Who is talking to whom` (matches design ref subtitle line 177)
- Graph card right-side chip: `{recentEdgeCount} active path{s}` -- teal-soft bg when count > 0, muted when zero
- Graph canvas: `position: relative; height: 260px; min-height: 220px; border-radius: var(--v7-radius); border: 1px solid var(--v7-line); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); overflow: hidden`
- SVG: `position: absolute; inset: 0; width: 100%; height: 100%`
- Node positioning: `style={{ left: \`${xPct}%\`, top: \`${yPct}%\`, transform: 'translate(-50%, -50%)' }}` -- center anchor on the layout coordinate
- Edge endpoint anchoring: edges connect at the right-center of source node and left-center of target node (computed from layout coords + node width estimate of 144px)

### Swimlane
- Panel eyebrow: `[pulse-dot] Observability`
- Panel title: Cabinet Grotesk 20px `Gantt-style agent timeline`
- Panel right-side chip: `Past 30 minutes` muted style
- Axis: `position: relative; height: 22px; padding-left: 92px;` with absolutely-positioned tick labels at 6 anchor points
- Tick label: `position: absolute; transform: translateX(-50%); font-size: 11px; color: var(--v7-faint)`
- Lane area: `position: relative; height: ${14 + laneCount * 36 + 14}px; border-radius: var(--v7-radius-sm); background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); border: 1px solid var(--v7-line); overflow: hidden`
- Vertical hairlines via `::before` content with the same multi-stop gradient pattern from design ref line 96, but parameterized for our 6 ticks
- Lane label: `position: absolute; left: 0; top: ${14 + i * 36}px; height: 32px; width: 88px; padding-left: 12px; font-size: 12px; color: var(--v7-muted); display: flex; align-items: center;`

### Tooltip (CSS-only)
- `.v7-bar-tooltip` class: `position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity 0.12s ease; background: var(--v7-glass-bg); border: 1px solid var(--v7-glass-border); border-radius: var(--v7-radius-sm); padding: 8px 10px; font-size: 12px; color: var(--v7-text); white-space: nowrap; z-index: 10; box-shadow: var(--v7-glass-shadow-heavy);`
- Bar wrapper: `position: relative;` and `:hover .v7-bar-tooltip { opacity: 1; }`
- Tooltip pointer: tiny CSS triangle below tooltip via `::after`

</specifics>

<deferred>
## Deferred Ideas

- Click on a graph edge to open a trace inspector (V8 -- link out to Orq.ai instead per REQUIREMENTS Out of Scope)
- Recursive sub-graph inside the drawer (V8+, ADV-01)
- Historical replay scrubber for the swimlane (V8+, ADV-02)
- Cross-swarm correlation (V8+, ADV-03)
- Force-directed layout for very large swarms (>20 agents) -- swap algorithm; same component shell
- Bar grouping by `trace_id` with subtle vertical stripe markers (V8 polish)
- Keyboard-driven span navigation in the swimlane (V8 -- desktop hover is sufficient for V7.0 management use case)
- Particle color per-agent rather than per-edge (V8 -- per-edge cycling is more visually distinct in the small graphs we have)
- Real `offset-path` HTML particle alternative for browsers without SVG SMIL (none in our target list -- SMIL works on all modern Chromium/Webkit/Firefox)

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 53-advanced-observability*
*Context gathered: 2026-04-16*
