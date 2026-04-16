# Phase 52: Live Interactivity - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode -- decisions derived from milestone discussion, Phase 48-51 deliverables, design reference, REQUIREMENTS.md, and locked architectural constraints)

<domain>
## Phase Boundary

Replace the two remaining Phase 49 placeholders in `swarm-layout-shell.tsx` (Kanban + Terminal) with the real **always-on monitoring surfaces** for the V7 swarm view, and add **smart sidebar filters** that focus the Kanban on exception slices. After this phase:

1. The bottom-right region renders a **Claude-style terminal event stream**: monospaced rows with timestamp + event-type chip + payload, scrolling new events into view in real-time, with auto-scroll, pause, and clear controls. Memory-bounded by an in-memory ring buffer (max 500 events).
2. The bottom-left region renders a **5-column Kanban board** keyed off `swarm_jobs.stage` (backlog / ready / progress / review / done): drag-and-drop via `dnd-kit`, optimistic UI, server-action persistence (`moveJob(jobId, newStage)`), Realtime broadcast of the stage change reconciles all connected viewers.
3. The sidebar gains a **Smart filters** group (only blocked / needs review / high SLA risk) that sets URL search params; the Kanban board filters its visible cards accordingly. Filters compose with stage columns.
4. Drag rejections (server-action error or invalid transition) **revert the optimistic UI** and surface a sonner toast.

**Out of scope (later phases):**
- Live delegation graph + Gantt-style swimlanes (Phase 53)
- Migrating existing legacy pages to V7 tokens (Phase 54)
- Per-job detail drawer (V8+; click on Kanban card is a no-op for now)
- Cross-swarm Kanban roll-up (V8+)
- Terminal event filtering by agent / event type (UI for it deferred; ring buffer keeps everything)
- Mobile drag-and-drop (out of scope per REQUIREMENTS.md "Out of Scope")

</domain>

<decisions>
## Implementation Decisions

### Terminal Event Stream (OBS-03..05)
- **D-01:** Terminal lives at `web/components/v7/terminal/terminal-stream.tsx`. Reads from `useRealtimeTable("events")` (NEVER opens its own Realtime channel). New events from the bundle are appended to a **client-side ring buffer**.
- **D-02:** The ring buffer is **NOT** plain React state. We use a tiny module-scoped store + `useSyncExternalStore` so:
  - Buffer mutations don't trigger upstream re-renders.
  - `Object.is` snapshot comparison cleanly avoids re-renders when no new event landed.
  - The buffer survives provider re-mounts within the same swarm view (it's keyed by `swarmId`).
  File: `web/lib/v7/terminal/event-buffer.ts` -- pure store + reducer.
- **D-03:** Capacity = **500** events (REQUIREMENTS.md OBS-04). Eviction is FIFO: when length > 500, drop oldest. `pushEvent` is a no-op if `event.id` is already in the buffer (idempotent vs duplicate INSERT signals).
- **D-04:** Hook API: `useEventBuffer(swarmId): { events, paused, setPaused, clear }`. Internally subscribes to the store via `useSyncExternalStore`; passes through the realtime feed via a small bridge in `terminal-stream.tsx` that calls `store.pushMany(newEvents)` whenever the realtime bundle's events array grows.
- **D-05:** Auto-scroll behavior: when `events.length` changes AND user is within 32px of the bottom, scroll to bottom (`element.scrollTop = element.scrollHeight`). If user has scrolled up, do NOT auto-scroll (preserve their inspect position) -- show a "N new events" pill at bottom-right; clicking it scrolls + dismisses.
- **D-06:** Pause toggle: when paused, the bridge stops pushing into the store; new events accumulate in a side-buffer and are flushed on un-pause. Visual indicator: PAUSED chip in header. Clear button drops all events from the store (does NOT touch DB).
- **D-07:** Event row layout (matches design reference lines 102-104):
  - Mono font (`Geist Mono` via `--font-mono` from globals.css)
  - Time column: `HH:mm:ss` formatted from `created_at` (use `Intl.DateTimeFormat`, locale `en-GB`, no `date-fns` dependency for hot path)
  - Event-type chip: pill with type-specific bg color (see chip color map below)
  - Payload column: derived label from `agent_name` + `content` (e.g. `EASY_intake -> tool: priority_score` for tool_call)
- **D-08:** Event-type chip color map (uses Phase 48 tokens):
  | event_type | bg | border | label |
  |---|---|---|---|
  | `thinking` | `--v7-pink-soft` | `color-mix(--v7-pink, transparent 80%)` | `Reasoning` |
  | `tool_call` | `rgba(105,168,255,0.12)` (matches design) | `rgba(105,168,255,0.15)` | `PreToolUse` |
  | `tool_result` | `rgba(58,199,201,0.12)` | `rgba(58,199,201,0.15)` | `PostToolUse` |
  | `waiting` | `--v7-amber-soft` | `color-mix(--v7-amber, transparent 80%)` | `HumanGate` |
  | `done` | `--v7-teal-soft` | `color-mix(--v7-teal, transparent 80%)` | `Done` |
  | `error` | `rgba(255,107,122,0.16)` | `rgba(255,107,122,0.30)` | `Error` |
  | `delegation` | `--v7-blue-soft` | `color-mix(--v7-blue, transparent 80%)` | `Delegation` |
- **D-09:** Empty state: terminal-shell with a single dim row `> Awaiting events ...` -- consistent with the design's blinking caret affordance.
- **D-10:** Terminal renders **all 500** events in DOM. We do NOT add virtualization in this phase (premature: 500 rows of <1KB markup is well within React render budget). Reason for ring buffer is memory-bound, not paint-bound. If a future telemetry session reveals jank we add virtualization in Phase 54 polish.

### Kanban Board (KAN-01..04)
- **D-11:** Board lives at `web/components/v7/kanban/kanban-board.tsx`. Reads `useRealtimeTable("jobs")`. 5 columns rendered from a static `KANBAN_STAGES` array preserving order.
- **D-12:** Column-to-stage mapping (DB stage -> display label, locked by Phase 48 schema CHECK constraint):
  | DB stage | Display label |
  |---|---|
  | `backlog` | `Backlog` |
  | `ready` | `Ready` |
  | `progress` | `In progress` |
  | `review` | `Human review` |
  | `done` | `Done` |
  Constants live at `web/lib/v7/kanban/stages.ts` -- single source of truth for both columns and filter options.
- **D-13:** Drag-drop uses **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`) -- not in package.json yet, install via `pnpm add` in plan 52-02. `restrictToVerticalAxis` modifier within column for visual polish; `restrictToWindowEdges` globally; cross-column drops detected via `useDroppable` per column.
- **D-14:** Drop semantics: **stage transitions only** in this phase. Within-column reordering is OUT (`position` field exists but the server action does not touch it -- jobs in a column show in `created_at desc` order). Reason: position reordering needs careful concurrent-write merge logic that's out of scope for V7.0; design reference also doesn't show ordering affordance.
- **D-15:** Optimistic UI pattern:
  1. On `onDragEnd`, build the new stage value.
  2. Update local `optimisticOverlay: Map<jobId, newStage>` immediately (`useState`).
  3. Call server action `moveJob(jobId, newStage)` via `useTransition`.
  4. On success: clear the override key (Realtime UPDATE will also flow in; the entry remains coherent because the realtime row already has `stage = newStage`).
  5. On failure: clear the override key AND show sonner error toast `"Couldn't move job. Reverted."`.
  Display layer merges: `displayedJobs = jobs.map(j => optimisticOverlay.has(j.id) ? { ...j, stage: optimisticOverlay.get(j.id)! } : j)`.
- **D-16:** Server action `web/lib/v7/kanban/actions.ts#moveJob(jobId, newStage)`:
  - Server-side input validation: `newStage` must be in `STAGES`.
  - Authorize: load job via service-role; verify caller has `project_members` row for `swarm_id` (mirrors Phase 48 access pattern).
  - Update `swarm_jobs SET stage = $1, updated_at = NOW() WHERE id = $2` returning the row.
  - Realtime publication on `swarm_jobs` (Phase 48 already enabled) auto-broadcasts UPDATE to every viewer including the originator.
  - Throws on auth or invalid stage; `useTransition` catches and we show the toast.
- **D-17:** Job card visual: `<KanbanJobCard>` -- glass surface, title (Cabinet Grotesk 16px), description (muted 14px, line-clamp-2), tag pills row (priority + risk). Drag handle is the entire card. `cursor: grab` on idle, `cursor: grabbing` while dragging (dnd-kit native).
- **D-18:** Tag pills derived from job columns: priority pill always, risk pill (warn) if `priority IN ('high','urgent')` OR `tags` contains `"risk"`/`"blocked"`/`"sla"`. We surface up to 3 tag pills; truncated with `+N` overflow indicator.
- **D-19:** Empty column copy: `"No jobs in {label}"` muted text centered in the column body.
- **D-20:** Keyboard accessibility: dnd-kit's `KeyboardSensor` with the default sortable keyboard coordinates getter. Cards have `tabIndex=0`, `role="button"`, `aria-grabbed` flips during drag. Cross-column moves via Space (pick up) -> Arrow (move) -> Space (drop), per dnd-kit docs.

### Sidebar Smart Filters (NAV-04)
- **D-21:** Filters live in `web/components/v7/swarm-sidebar.tsx` (extending the existing dashboard sidebar). New "Smart filters" group below "Swarms".
- **D-22:** Three filter chips:
  | Chip label | URL param value | Predicate |
  |---|---|---|
  | `Only blocked` | `filter=blocked` | `priority IN ('urgent','high')` AND `stage = 'review'` |
  | `Needs review` | `filter=review` | `stage = 'review'` |
  | `High SLA risk` | `filter=sla` | `tags` array contains `"sla"` OR `"blocked"` OR `"risk"` |
  Filters are mutually exclusive; clicking the active one clears it (toggle behavior). Predicate definitions live in `web/lib/v7/kanban/filters.ts` for shared client/server use.
- **D-23:** URL state via `useSearchParams` + `router.replace(...)` (Next.js 16 App Router). The filter is a single search param `?filter=<key>`; absence means no filter. Stage is implicit (visible columns), no `?stage=` param yet.
- **D-24:** Active chip state: read from `useSearchParams`. Chip uses `data-active` attribute -> teal soft bg + teal border + teal text. Inactive chips use the existing `nav-btn` style.
- **D-25:** Filter is consumed by `KanbanBoard`: when `filter !== null`, `displayedJobs` is filtered with the predicate before slicing into columns. Filter respects optimistic overrides: optimistic stage is used for the predicate, so a job dragged into `review` immediately appears under "Needs review" filter.
- **D-26:** Filter chip is also reachable from any `/swarm/[swarmId]` route (since the sidebar persists across routes). On the swarm dashboard root (`/`) the filters are inactive (no Kanban there); the chip click still navigates to the most-recently-viewed swarm with the filter applied. **Simpler decision for V7:** filter chips are visible only when the URL matches `/swarm/*` -- conditional render via `usePathname`. Outside swarm view, the "Smart filters" group is hidden.

### Test Data Seeding
- **D-27:** Ship a fixture SQL file `supabase/fixtures/52-test-data.sql` that seeds **10** `swarm_jobs` on the EASY swarm `f8df0bce-ed24-4b77-b921-7fce44cabbbb` distributed as: 2 backlog / 2 ready / 3 progress / 2 review / 1 done. Mix of priorities (1 urgent, 2 high, 5 normal, 2 low). Tags include realistic mix: `"new"`, `"sla"`, `"blocked"`, `"risk"`, `"approved"`.
- **D-28:** Apply the fixture immediately via the Management API token (`sbp_5cd4ece3a65960acab9ade58dcd2c0ea236a1ece`). Token verified working at session start. Idempotent via fixed UUIDs + `ON CONFLICT (id) DO UPDATE`.

### Layout Wiring
- **D-29:** Replace the two remaining placeholders in `swarm-layout-shell.tsx`:
  - Kanban placeholder -> `<KanbanBoard swarmId={swarmId} />` (reads filter from URL internally)
  - Terminal placeholder -> `<TerminalStream swarmId={swarmId} />`
- **D-30:** The Kanban panel keeps its `1.2fr` column width; the terminal keeps `0.8fr`. No grid changes.

### Folded Todos
None -- no relevant todos surfaced for Phase 52.

### Claude's Discretion
- Internal file organization within `web/components/v7/{terminal,kanban}/`
- dnd-kit sensor configuration (Pointer + Keyboard sufficient; no Touch sensor needed for desktop-first per REQUIREMENTS.md scope)
- Whether to expose pause+clear controls inline in the terminal header or as a small dropdown (start inline; small icon buttons)
- Sonner toast styling (use existing sonner installed for shadcn)
- Whether `KanbanJobCard` lifts via `transform` while dragging (yes; dnd-kit defaults look good with our glass surface)
- Whether the optimistic Map clears on Realtime UPDATE arrival or after server-action settle (after settle is simpler and avoids races)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design and UI
- `docs/designs/agent-dashboard-v2.html` lines 82-105 (workbench / kanban / terminal styles), 222-263 (kanban + terminal markup + JS handlers), 307-314 (terminalEvents fixture)
- `.planning/phases/48-foundation/48-UI-SPEC.md` -- V7 color tokens, glassmorphism patterns, typography scale
- `.planning/phases/49-navigation-realtime/49-UI-SPEC.md` -- inherited spacing/type/color conventions, sidebar styling
- `.planning/phases/51-hero-components/51-UI-SPEC.md` -- canonical drawer + badge patterns we mirror for chips
- `web/app/globals.css` lines 119-235 -- `--v7-*` tokens + `v7-pulse-eyebrow` + `v7-drawer-content` (Phase 51)

### Phase 48-51 Foundations
- `.planning/phases/48-foundation/48-02-SUMMARY.md` -- swarm_jobs CHECK constraint values (`backlog/ready/progress/review/done`)
- `.planning/phases/49-navigation-realtime/49-01-SUMMARY.md` and `49-02-SUMMARY.md` -- `SwarmRealtimeProvider`, `useRealtimeTable`, sidebar pattern
- `.planning/phases/50-data-pipeline/50-01-SUMMARY.md` and `50-02-SUMMARY.md` -- `agent_events` content shape (`{trace_id, span_id, span_type, span_name, tool?}`)
- `.planning/phases/51-hero-components/51-CONTEXT.md` D-22 -- `<DrawerProvider>` mounted at shell root, no URL state for ephemeral overlays
- `supabase/migrations/20260415_v7_foundation.sql` -- exact column types for swarm_jobs CHECK + agent_events shape

### Existing code patterns
- `web/components/v7/swarm-realtime-provider.tsx` -- channel pattern; don't open extra channels
- `web/components/v7/swarm-layout-shell.tsx` -- target for placeholder replacement (lines 105-115)
- `web/components/v7/swarm-sidebar.tsx` -- target for smart filter chip insertion (after line 192)
- `web/components/ui/glass-card.tsx` -- base panel surface for column + terminal frame
- `web/lib/v7/use-realtime-table.ts` -- the only Realtime read path
- `web/lib/supabase/server.ts` (and `createAdminClient`) -- service-role client for server action

### Project constraints
- `CLAUDE.md` -- stack constraints (Next.js / Supabase / Vercel only)
- `.planning/REQUIREMENTS.md` -- OBS-03..05, KAN-01..04, NAV-04 acceptance criteria

### dnd-kit docs
- https://docs.dndkit.com/introduction/getting-started -- core install + DndContext setup
- https://docs.dndkit.com/presets/sortable -- SortableContext, useSortable
- https://docs.dndkit.com/api-documentation/modifiers -- restrictToVerticalAxis, restrictToWindowEdges

### Next.js 16 server-action docs
- App Router server actions with form + `useTransition` for optimistic UI
- `useSearchParams` + `router.replace` for shallow URL state

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GlassCard` (Phase 48) -- base for column wrapper + terminal frame
- `useRealtimeTable("jobs"|"events")` (Phase 49) -- the ONLY way Phase 52 reads Supabase
- `createAdminClient` (server) -- for service-role writes from `moveJob` server action
- `sonner` (already installed for shadcn) -- toast for revert error
- `Geist Mono` via `--font-mono` (already loaded in globals.css for shadcn)

### Established Patterns
- Server component shells + `"use client"` leaves at the smallest boundary (Phase 49+51 pattern)
- Token-driven styling via `--v7-*` variables, never hex literals in components
- Realtime via context + `useRealtimeTable(table)`, never per-component channels
- Phase 51 D-22: ephemeral overlay state in React Context, not URL (drawer)
- Phase 49 sidebar pattern: `usePathname()` to know which route we are on

### Integration Points
- `web/components/v7/swarm-layout-shell.tsx` -- modify: swap 2 placeholders for real components
- `web/components/v7/swarm-sidebar.tsx` -- modify: add Smart filters group conditional on `/swarm/*` pathname
- `web/lib/v7/kanban/` -- add: `stages.ts`, `actions.ts`, `filters.ts`
- `web/lib/v7/terminal/event-buffer.ts` -- add: ring buffer store
- `supabase/fixtures/52-test-data.sql` -- test seed for verification

### New dependencies
- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/modifiers` -- via `pnpm add` (or whichever package manager the repo uses; agent-workforce uses npm based on package-lock per Phase 49 verification)

</code_context>

<specifics>
## Specific Ideas

- Terminal frame: `bg: #071018; border: 1px solid rgba(105,168,255,0.14); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 70px rgba(0,0,0,0.24)` (matches design ref line 102, dark-themed even in light mode -- intentional, terminal feel)
- Terminal panel header eyebrow: `[pulse-dot] Live event stream` -- uses `v7-pulse-eyebrow` keyframe like Phase 51
- Terminal log row: `grid-template-columns: auto auto 1fr; gap: 10px; font-size: 0.84rem; line-height: 1.45; color: #b8d7ff` (design ref line 103)
- Time column: `color: #6f8ab1; font-size: 0.78rem`
- Event chip: `padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; border: 1px solid {chipBorder}`
- Payload column: `color: #dbeaff` (matches design ref line 104)
- "N new events" pill: bottom-right inside scroll container, sticky-positioned, teal-soft bg, pulse animation
- Live blinking caret on the most-recent row: 10x1.1em background `--v7-teal`, animated `blink 1s steps(1) infinite` (re-uses design ref keyframe; we add it to globals.css under Phase 52 section)

- Kanban column wrap: `border-radius: 22px; padding: 10px; background: rgba(255,255,255,0.025); border: 1px solid var(--v7-line); display: grid; grid-template-rows: auto 1fr` (matches design ref line 86)
- Column head: `display: flex; justify-content: space-between; align-items: center; padding: 6px 6px 12px 6px` (design ref line 87)
- Column title: Cabinet Grotesk 14px 700; count: muted 12px
- Job card: `padding: 14px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02)); border: 1px solid var(--v7-line); cursor: grab; transition: 0.18s ease` (design ref line 89)
- Job hover lift: `translateY(-2px)`
- Tag pill default bg: `rgba(255,255,255,0.04)`; warn bg: `var(--v7-amber-soft)`; risk bg: `var(--v7-pink-soft)`; ok bg: `var(--v7-teal-soft)` (design ref line 91)
- Job-list overflow: `overflow: auto; padding-right: 3px; gap: 10px` for vertical scroll inside columns
- Drop target hover: column gets a 2px dashed `--v7-teal` outline + teal-soft bg overlay

- Smart filter group label: same uppercase 12px style as `Swarms` group label
- Smart filter chip: same `nav-btn` style as existing sidebar items; active state mirrors `swarm-list-item` active (3px teal left border + soft teal bg)
- Chip arrow indicator: `→` aligned right via `justify-between`; replaced with `✓` when active

</specifics>

<deferred>
## Deferred Ideas

- Within-column position reordering (Phase 54 polish or V8)
- Terminal filter chips by event type / agent name (V8)
- Terminal pause across page navigation (V8 -- ephemeral pause is fine)
- Per-job detail drawer (V8)
- Filter persistence across sessions in localStorage (V8)
- Filter URL multi-key composition (`?filter=blocked&priority=high`) -- single key is simpler for V7
- Touch sensor + mobile drag-and-drop (out of scope per REQUIREMENTS)
- Dropdown to swap stage labels (e.g. "In progress" -> "WIP") -- design reference is the source of truth

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 52-live-interactivity*
*Context gathered: 2026-04-16*
