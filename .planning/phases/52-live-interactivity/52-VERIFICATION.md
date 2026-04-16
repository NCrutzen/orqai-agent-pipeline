# Phase 52 Verification

**Phase:** 52-live-interactivity
**Status:** code-complete; browser walkthrough deferred to user
**Date:** 2026-04-16

## Must-haves

### Code-complete checks (PASSING)

| # | Item | Status |
|---|------|--------|
| 1 | TerminalStream renders inside swarm-layout-shell | PASS (grep KanbanBoard + TerminalStream = 2 each) |
| 2 | Ring buffer enforces 500-event max FIFO | PASS (event-buffer.ts capacity arg + eviction loop) |
| 3 | Terminal reads via useRealtimeTable("events"), no extra channel | PASS (no `supabase.channel` in `terminal/`) |
| 4 | Pause + Resume + Clear controls present | PASS (Pause/Play/Eraser icons in TerminalStream header) |
| 5 | "N new events" pill appears when scrolled-up + new events arrive | PASS (missedCount + followBottom logic) |
| 6 | KanbanBoard renders 5 columns with correct labels | PASS (KANBAN_STAGES + STAGE_LABELS exported) |
| 7 | Drag-and-drop via dnd-kit (not react-dnd, not HTML5) | PASS (DndContext + useSortable + useDroppable) |
| 8 | moveJob server action validates + auths + updates | PASS (Zod input + auth.getUser + project_members count + service-role update) |
| 9 | Optimistic overlay reverts on rejection with sonner toast | PASS (catch block + revertOverlay + toast.error) |
| 10 | Optimistic overlay prunes when realtime row matches | PASS (useEffect on [jobs, overlay]) |
| 11 | SidebarSmartFilters writes ?filter= via router.replace | PASS (URL state via setFilter) |
| 12 | Smart filter chips hidden outside /swarm/* | PASS (usePathname guard) |
| 13 | KanbanBoard reads filter from useSearchParams | PASS (params.get("filter") + getFilterPredicate) |
| 14 | Fixture applied to DB | PASS (10 swarm_jobs verified via Management API) |
| 15 | TypeScript compiles with no new errors | PASS |

### Manual browser walkthrough (DEFERRED to user)

User must perform after running `npm run dev` from `web/`:

1. Open `http://localhost:3000/swarm/f8df0bce-ed24-4b77-b921-7fce44cabbbb`
2. **Terminal:** confirm 12 events from the Phase 51 fixture render at the bottom of the right panel; the latest row has the blinking teal caret. Scroll up; a "N new events" pill appears if any new event lands while scrolled up. Click Pause; the chip turns amber; Clear empties the buffer.
3. **Kanban:** confirm 10 cards distributed across 5 columns (2/2/3/2/1). Drag a card from "Backlog" to "Ready" -- the column accepts the drop with a teal dashed outline; the move persists to DB; opening a second tab on the same swarm shows the move appear in real time via Realtime.
4. **Smart filters:** click "Needs review" in the sidebar; URL becomes `/swarm/...?filter=review`; only the 2 review-stage cards remain visible; click chip again to clear; URL params drop. Navigate to `/` -- the smart filters group hides.
5. **Toast revert (optional):** open dev tools, network-block the `/swarm/.../moveJob` server action (or kill the API), then drag a card; expect a sonner error toast and the card snaps back.

## Resume signal
"Phase 52 verified" -- after user completes the browser walkthrough.

## Files in scope (all committed)
- web/lib/v7/terminal/event-buffer.ts
- web/lib/v7/terminal/use-event-buffer.ts
- web/lib/v7/terminal/format.ts
- web/components/v7/terminal/event-type-chip.tsx
- web/components/v7/terminal/terminal-row.tsx
- web/components/v7/terminal/terminal-stream.tsx
- web/lib/v7/kanban/stages.ts
- web/lib/v7/kanban/filters.ts
- web/lib/v7/kanban/actions.ts
- web/components/v7/kanban/job-tag-pill.tsx
- web/components/v7/kanban/kanban-job-card.tsx
- web/components/v7/kanban/kanban-column.tsx
- web/components/v7/kanban/kanban-board.tsx
- web/components/v7/sidebar-smart-filters.tsx
- web/components/v7/swarm-layout-shell.tsx (modified)
- web/components/v7/swarm-sidebar.tsx (modified)
- web/app/globals.css (modified)
- web/package.json (modified)
- supabase/fixtures/52-test-data.sql (NEW; APPLIED to DB)
