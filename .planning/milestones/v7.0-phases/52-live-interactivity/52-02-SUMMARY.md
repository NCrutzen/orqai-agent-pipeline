---
phase: 52-live-interactivity
plan: 02
subsystem: kanban board with dnd-kit
tags: [react, dnd-kit, server-actions, supabase-realtime, optimistic-ui, sonner, v7]

# Dependency graph
requires:
  - phase: 49
    provides: useRealtimeTable("jobs"), SwarmRealtimeProvider single channel
  - plan: 52-01
    provides: shell wiring pattern (modified swarm-layout-shell)
provides:
  - @dnd-kit/{core,sortable,modifiers} dependencies
  - KANBAN_STAGES + STAGE_LABELS + isKanbanStage
  - SMART_FILTERS + getFilterPredicate (consumed by 52-03 too)
  - moveJob server action with auth + service-role update
  - JobTagPill / KanbanJobCard / KanbanColumn / KanbanBoard components
  - 10-row swarm_jobs fixture seeded into Supabase
affects: [52-03, 53]

tech-stack:
  added: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/modifiers"]
  patterns:
    - dnd-kit-multi-column-sortable
    - optimistic-overlay-with-realtime-reconcile
    - server-action-with-zod-and-service-role-auth
    - column-droppable-plus-sortable-context

key-files:
  created:
    - web/lib/v7/kanban/stages.ts
    - web/lib/v7/kanban/filters.ts
    - web/lib/v7/kanban/actions.ts
    - web/components/v7/kanban/job-tag-pill.tsx
    - web/components/v7/kanban/kanban-job-card.tsx
    - web/components/v7/kanban/kanban-column.tsx
    - web/components/v7/kanban/kanban-board.tsx
    - supabase/fixtures/52-test-data.sql
  modified:
    - web/components/v7/swarm-layout-shell.tsx (KanbanBoard wired in)
    - web/package.json (3 new deps)
    - web/package-lock.json

key-decisions:
  - "dnd-kit chosen over react-dnd: smaller bundle, better keyboard accessibility out of the box, no monkey-patching"
  - "Cross-column drops only -- within-column reorder is visual-only, not persisted (avoids concurrent-write merge complexity for V7)"
  - "Optimistic overlay as Map<jobId, stage>; pruned by useEffect when realtime row catches up. Robust against Realtime ordering delays"
  - "Server action uses service-role for the UPDATE but verifies project_members membership manually before the write -- mirrors Phase 49 access pattern"
  - "Realtime broadcast (Phase 48 publication on swarm_jobs) handles propagation to all viewers including the originator -- no manual invalidation"
  - "Sonner toast already mounted in app/layout.tsx; reused via toast.error()"

patterns-established:
  - "dnd-kit DndContext at the board root, column-id pattern 'column:stage', useSortable on cards"
  - "Optimistic overlay reconcile: useEffect prunes entries whose realtime row already shows the optimistic stage"
  - "Per-swarm fixture SQL files at supabase/fixtures/{phase}-test-data.sql, applied via Management API"

requirements-completed: [KAN-01, KAN-02, KAN-03, KAN-04]

duration: ~50min
completed: 2026-04-16
commit_range: a67a84e..305a878
---

# Phase 52 Plan 02 Summary

**5-column Kanban board with dnd-kit + optimistic moveJob server action.**

## Accomplishments

- Installed `@dnd-kit/core` (^6.3.1), `@dnd-kit/sortable` (^10.0.0), `@dnd-kit/modifiers` (^9.0.0).
- `KANBAN_STAGES` + `STAGE_LABELS` constants locked to the swarm_jobs CHECK constraint values.
- `SMART_FILTERS` + `getFilterPredicate` -- shared helpers consumed by both Kanban and the sidebar (Plan 52-03).
- `moveJob(jobId, newStage)` server action: Zod input validation, `auth.getUser()` authentication, manual `project_members` authorization, service-role UPDATE.
- Card component (`KanbanJobCard`) wires `useSortable`, derives priority + tag pills, supports `isDragOverlay` for the DragOverlay portal render.
- Column component (`KanbanColumn`) combines `useDroppable` (for empty-area drops) + `SortableContext` (for child cards) + drop-target outline.
- Board component (`KanbanBoard`) wires DndContext + 5 columns + DragOverlay + optimistic overlay + reconcile effect + sonner-on-fail.
- 10-row fixture for swarm_jobs seeded via Management API: 2 backlog / 2 ready / 3 progress / 2 review / 1 done. Verified in DB.

## Deviations from Plan
None.

## Verification
- `npx tsc --noEmit` -- no new errors.
- DB query confirms expected stage distribution and total of 10 rows.
- All grep checks pass (see `52-REVIEW.md`).

## Issues Encountered
- npm reported 11 pre-existing transitive vulnerabilities; not introduced by dnd-kit.

## Next Plan Readiness
52-03 can now consume `SMART_FILTERS` from `web/lib/v7/kanban/filters.ts` and the Kanban's URL-param read path is ready to receive filter changes.
