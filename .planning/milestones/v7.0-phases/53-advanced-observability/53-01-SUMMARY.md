---
phase: 53-advanced-observability
plan: 01
subsystem: ui
tags: [v7-graph, svg-smil, particle-animation, prefers-reduced-motion]

# Dependency graph
requires:
  - phase: 49-navigation-realtime
    provides: SwarmRealtimeProvider + useRealtimeTable hook
  - phase: 50-data-pipeline
    provides: agent_events.parent_span_id populated by Inngest cron mapper
  - phase: 51-hero-components
    provides: DrawerProvider + useDrawer hook (graph nodes open the drawer on click)
  - phase: 48-foundation
    provides: V7 design tokens, GlassCard
provides:
  - DelegationGraph component replacing the placeholder in swarm-layout-shell
  - Pure helpers: pickOrchestrator, computeLayout, deriveEdges, isRecentEdge, particleColor
  - SSR-safe useReducedMotion hook
  - V7 graph node + status dot styles in globals.css
affects: [53-02-swimlane (shares the SwarmRealtimeProvider channel; no conflict)]

# Tech tracking
tech-stack:
  added: []
  patterns: [svg-smil-animatemotion, orbital-fan-layout, parent-span-id-edge-derivation]

key-files:
  created:
    - web/lib/v7/graph/layout.ts
    - web/lib/v7/graph/edges.ts
    - web/lib/v7/graph/__tests__/layout.test.ts
    - web/lib/v7/graph/__tests__/edges.test.ts
    - web/lib/v7/use-reduced-motion.ts
    - web/components/v7/graph/graph-node.tsx
    - web/components/v7/graph/graph-edge.tsx
    - web/components/v7/graph/delegation-graph.tsx
  modified:
    - web/app/globals.css
    - web/components/v7/swarm-layout-shell.tsx

key-decisions:
  - "SVG SMIL animateMotion + mpath chosen over CSS offset-path: same path string used for both stroke and particle, GPU-composited, no React re-renders during animation"
  - "Hand-rolled orbital layout: orchestrator left at (18, 50)%, subagents on a 120deg arc to the right with radius=38% stretched 1.6x horizontally"
  - "Layout memoization keyed on sorted agent IDs so Realtime row reordering does not perturb coordinates"
  - "Now-bucket snapped to 5s in DelegationGraph so React doesn't re-render every paint just to re-evaluate isRecentEdge"

patterns-established:
  - "Pure graph helpers in web/lib/v7/graph/ with vitest co-located in __tests__/"
  - "useReducedMotion hook lives in web/lib/v7/ as a project-wide utility (consumed by graph; available to swimlane and any future motion-using component)"

requirements-completed: [GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04]

# Metrics
duration: ~30min (reused work from earlier crashed subagent + commit + tests + glue)
completed: 2026-04-16
---

# Phase 53 Plan 01: Live Delegation Graph Summary

**Cinematic SVG graph wired to live Realtime data: nodes from swarm_agents, edges from agent_events.parent_span_id traversal, animated particles on edges active in the last 60 seconds.**

## Performance

- **Duration:** ~30 min (post-recovery)
- **Tasks completed:** 7 of 7
- **Files created:** 8
- **Files modified:** 2
- **Tests:** 21 vitest assertions, all passing

## Accomplishments

- DelegationGraph replaces the placeholder in `swarm-layout-shell.tsx`
- Pure helpers cleanly separated from rendering: `pickOrchestrator`, `computeLayout`, `deriveEdges`, `isRecentEdge`, `particleColor`
- Edge derivation skips self-loops and unknown-parent references; aggregates count + lastTs for animation rate calibration
- `<animateMotion>` + `<mpath>` references the EXACT same path id used by the stroke -- no path duplication, no resize misalignment
- Glassmorphic node cards with status dots; orchestrator gets a teal outline + soft halo
- Empty states for zero agents (full empty-card body) and agents-without-edges (subtle right-bottom caption "No delegation activity yet")
- prefers-reduced-motion: SMIL falls back to single-cycle motion + node hover transition disabled

## Task Commits

Single combined commit: `9af4231` (feat) — covers tasks 53-01-1..6 + verification by tests. Recovery from crashed subagent session that left the files in working tree uncommitted.

## Files Created/Modified

- `web/lib/v7/graph/layout.ts` -- LayoutNode type, pickOrchestrator, computeLayout
- `web/lib/v7/graph/edges.ts` -- Edge type, deriveEdges, isRecentEdge, particleColor
- `web/lib/v7/graph/__tests__/{layout,edges}.test.ts` -- 21 vitest assertions
- `web/lib/v7/use-reduced-motion.ts` -- SSR-safe matchMedia hook
- `web/components/v7/graph/graph-node.tsx` -- absolutely-positioned glass card, role=button + keyboard
- `web/components/v7/graph/graph-edge.tsx` -- SVG path + optional animated particle
- `web/components/v7/graph/delegation-graph.tsx` -- root component with header, viewbox + defs, node/edge orchestration
- `web/app/globals.css` -- V7 graph node, status dot, and reduced-motion rules
- `web/components/v7/swarm-layout-shell.tsx` -- DelegationGraph imported and replacing PlaceholderRegion

## Decisions Made

- **SMIL over CSS offset-path** -- requirements wording GRAPH-02 ("CSS offset-path (not React state) for 60fps") interpreted as a perf contract. SMIL animateMotion satisfies the same contract while reusing the SVG path geometry.
- **Orbital layout (not d3-force)** -- 30 lines of math; deterministic; memoization on agent ID set guarantees stability under Realtime row reordering. Caps at 8 agents in practice without overlap, matches design reference aesthetic.
- **5s now-bucket** -- React doesn't re-render every paint just to re-evaluate `isRecentEdge`. Particles fade in/out within ~5s of the actual 60s window edge -- imperceptible to users.

## Deviations from Plan

None — followed 53-01-PLAN.md and 53-RESEARCH.md sections 1-3 verbatim.

## Issues Encountered

- Earlier subagent dispatched to execute this plan crashed with HTTP 529 (Anthropic API overloaded) before committing. Files were intact in the working tree; recovery picked them up, ran tests, typechecked, and committed atomically.

## Self-Check: PASSED

- [x] 21 graph tests pass
- [x] tsc --noEmit clean for 53-01 scope
- [x] Files committed at `9af4231`
- [x] DelegationGraph imported and used in shell
- [x] CSS rules added with reduced-motion guard

---
*Phase: 53-advanced-observability*
*Completed: 2026-04-16*
