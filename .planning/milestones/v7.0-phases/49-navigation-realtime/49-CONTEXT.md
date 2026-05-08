# Phase 49: Navigation & Realtime - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode -- decisions derived from milestone discussion + Phase 48 deliverables + design reference)

<domain>
## Phase Boundary

Deliver the swarm navigation surface and the single Realtime channel architecture that every later V7 phase depends on. After this phase:

1. The dashboard sidebar is rebuilt against the V7 design system, lists all swarms dynamically from the `projects` table, and shows live mini-stats per swarm (active jobs from `swarm_jobs`, agent count from `swarm_agents`).
2. Clicking a swarm in the sidebar navigates to `/swarm/[swarmId]` -- a swarm-specific shell page that renders the V7 layout grid with placeholder regions (briefing, fleet, workbench, kanban) for later phases to fill.
3. A single Supabase Realtime channel per swarm view is opened by a `SwarmRealtimeProvider` (React Context) and consumed via a `useRealtimeTable(table)` hook by all child components -- no per-component subscriptions.
4. Navigating between swarms cleanly tears down the previous channel and opens a new one (no leaks, no stale data) -- verified by inspecting `supabase.getChannels()` between navigations.

**Out of scope (later phases):**
- Briefing panel content (Phase 51)
- Fleet cards content (Phase 51)
- Kanban board (Phase 52)
- Terminal stream (Phase 52)
- Delegation graph and swimlanes (Phase 53)
- Smart filter buttons NAV-04 (Phase 52)
- Migrating existing executive/projects/settings pages to V7 tokens (Phase 54)

</domain>

<decisions>
## Implementation Decisions

### Sidebar (NAV-01, NAV-03)
- **D-01:** Sidebar is a NEW V7 component (`web/components/v7/swarm-sidebar.tsx`) -- the existing `app-sidebar.tsx` (shadcn) stays untouched and renders only on legacy routes (`/`, `/executive`, `/projects`, `/runs`, `/settings`). The (dashboard) layout chooses which sidebar to render based on whether the route starts with `/swarm`.
- **D-02:** Swarm list is loaded server-side in the (dashboard) layout (or a parallel route) by querying `projects` filtered to ones the user has `project_members` access to. Initial render is SSR; updates flow through Realtime.
- **D-03:** Live mini-stats (active jobs count, agent count) are rendered per swarm row. Initial counts come from the SSR query (LEFT JOIN with COUNT). Updates come from the same `SwarmRealtimeProvider` channel when the user is viewing a swarm; the sidebar uses a separate, dashboard-wide Realtime subscription that watches `swarm_jobs` and `swarm_agents` table-wide so the counts stay live regardless of which swarm is open.
- **D-04:** Sidebar uses V7 tokens (`--v7-glass-bg`, `--v7-line`, `--v7-radius-inner`) and the gradient sidebar pattern from UI-SPEC. Brand mark at top reads "Agent OS" + "Control room for swarms" (per Phase 48 copywriting contract).
- **D-05:** Active swarm highlight: the row with `swarmId === params.swarmId` gets the `--v7-teal-soft` background and a left teal accent bar. No localStorage persistence -- the URL is the source of truth.
- **D-06:** Empty-state copy when user has zero swarms: per UI-SPEC (`"No swarms configured"` + body).

### Routing (NAV-02)
- **D-07:** Route structure is `/swarm/[swarmId]/page.tsx` under the existing `(dashboard)` group. This inherits the `(dashboard)/layout.tsx` auth gate and `project_members` check.
- **D-08:** The `(dashboard)/swarm/[swarmId]/layout.tsx` wraps the page in a `<SwarmRealtimeProvider swarmId={params.swarmId}>` and validates that the user has `project_members` access to that specific swarm; otherwise `notFound()` (404, not access-pending -- access-pending is the no-projects-at-all case).
- **D-09:** The `/swarm/[swarmId]/page.tsx` server component renders the V7 layout shell: brand header, briefing region (placeholder), fleet region (placeholder), workbench region (placeholder), kanban region (placeholder). Placeholders use `<GlassCard>` from Phase 48 with a centered "Phase XX delivers this" caption. This proves the layout grid works end-to-end before later phases drop in real components.

### Realtime Architecture (RT-01)
- **D-10:** ONE Supabase Realtime channel per swarm view, owned by `SwarmRealtimeProvider`. Channel name pattern: `swarm:${swarmId}`.
- **D-11:** Provider subscribes to `postgres_changes` for the 4 V7 tables filtered by `swarm_id=eq.${swarmId}`: `agent_events`, `swarm_jobs`, `swarm_agents`, `swarm_briefings`. All filters live on the SAME channel (Supabase supports multiple `postgres_changes` events on one channel).
- **D-12:** Provider exposes context value `{ events, jobs, agents, briefings, status }` where each table is a normalized array kept in sync via INSERT/UPDATE/DELETE handlers. Initial snapshots are loaded by an internal SSR-or-effect fetch on mount, then mutated by Realtime events.
- **D-13:** Public hook is `useRealtimeTable(tableName)` returning the typed array for that table. Child components import and call it -- no direct Supabase access from leaves.
- **D-14:** Provider tears down on unmount via `supabase.removeChannel(channel)` in the cleanup return. Navigating from `/swarm/A` to `/swarm/B` unmounts the layout-level provider for A (Next.js layouts unmount when the dynamic segment changes), the cleanup runs, and a fresh provider mounts for B.
- **D-15:** Subscription status (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) is tracked in provider state and exposed so components can show a "Reconnecting..." indicator. Auto-reconnect is handled by Supabase JS internally.
- **D-16:** Ring buffer is NOT introduced in this phase (deferred to Phase 52 when the terminal stream lands). Phase 49 keeps full arrays -- swarm_jobs/swarm_agents/swarm_briefings are bounded by design; agent_events will accumulate but the only consumer in Phase 49 is the placeholder, which doesn't render them.

### Mini-Stats Subscription (NAV-03)
- **D-17:** Mini-stats use a SEPARATE dashboard-level Realtime subscription (one channel, `dashboard:swarms`) owned by the sidebar component. This is the only deliberate "second channel" -- it's dashboard-wide, not swarm-scoped, so it does not violate RT-01. The constraint in RT-01 is "single subscription per swarm view"; the sidebar is layout-level, not swarm-view-level.
- **D-18:** Sidebar subscription listens to `postgres_changes` on `swarm_jobs` (INSERT/DELETE/UPDATE for stage transitions) and `swarm_agents` (INSERT/DELETE) without a `swarm_id` filter -- the sidebar needs all swarms' counts. Counts are recomputed from the in-memory rows on each event.
- **D-19:** "Active jobs" definition for mini-stats: `swarm_jobs` rows where `stage IN ('ready', 'progress', 'review')`. "Agent count": all `swarm_agents` rows for the swarm regardless of status.

### Claude's Discretion
- Exact Tailwind/CSS-module structure for the V7 sidebar (utility classes vs `@layer` styles)
- Whether to use Suspense streaming for the initial swarm list or block the layout
- Loading skeleton appearance for the swarm list while initial fetch is in flight
- Internal file organization within `web/components/v7/` (single-file vs split per region)
- TypeScript types for Realtime payloads -- generated from schema or hand-written
- Test approach: integration test against real Supabase (preferred per CLAUDE.md "don't mock Supabase") or stubbed channel for unit tests

### Folded Todos
None -- no relevant todos surfaced from cross_reference_todos check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design and UI
- `docs/designs/agent-dashboard-v2.html` -- HTML prototype that defines the V7 visual language for sidebar, layout grid, placeholder regions
- `.planning/phases/48-foundation/48-UI-SPEC.md` -- color tokens (`--v7-*`), glassmorphism CSS pattern, spacing scale, copywriting contract used by Phase 49
- `web/app/globals.css` -- existing V7 CSS tokens (delivered Phase 48)

### Phase 48 Foundation
- `.planning/phases/48-foundation/48-CONTEXT.md` -- design system decisions, glass component pattern, theme strategy
- `.planning/phases/48-foundation/48-02-SUMMARY.md` -- V7 database schema (4 tables, REPLICA IDENTITY FULL, supabase_realtime publication, RLS policies)
- `.planning/phases/48-foundation/48-03-SUMMARY.md` -- (dashboard) layout auth gate pattern, project_members access check
- `supabase/migrations/20260415_v7_foundation.sql` -- exact schema for agent_events, swarm_jobs, swarm_agents, swarm_briefings

### Existing patterns
- `web/lib/supabase/broadcast-client.ts` -- existing `useBroadcast` hook pattern; `useRealtimeTable` should follow the same lifecycle conventions (ref-stabilized callback, cleanup on unmount)
- `web/lib/supabase/client.ts` and `web/lib/supabase/server.ts` -- Supabase client factories
- `web/app/(dashboard)/layout.tsx` -- where the swarm/legacy sidebar choice lands
- `web/components/app-sidebar.tsx` -- legacy sidebar (kept untouched, used by non-/swarm routes)
- `web/components/ui/glass-card.tsx` -- Phase 48 GlassCard primitive used for placeholder regions

### Project constraints
- `CLAUDE.md` -- Vercel + Supabase stack, no mocking Supabase in tests, Next.js 16 with Turbopack
- `.planning/REQUIREMENTS.md` -- NAV-01, NAV-02, NAV-03, RT-01 acceptance criteria
- `.planning/ROADMAP.md` Phase 49 -- "useRealtimeTable hook" pattern named explicitly

### Supabase Realtime docs
- https://supabase.com/docs/guides/realtime/postgres-changes -- multi-event channel pattern, filter syntax
- https://supabase.com/docs/reference/javascript/subscribe -- channel lifecycle, status callback

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/components/ui/glass-card.tsx` (Phase 48) -- use for all placeholder region containers in `/swarm/[swarmId]/page.tsx`
- `web/lib/supabase/broadcast-client.ts` -- mirror its lifecycle pattern (callbackRef, removeChannel cleanup) when writing the `SwarmRealtimeProvider`
- `web/lib/supabase/client.ts` -- the only correct way to get a client-side Supabase instance for Realtime
- `web/components/ui/sidebar` (shadcn) -- NOT used by V7 sidebar; V7 needs its own component because the design diverges from shadcn's collapsible-icon pattern
- `web/app/(dashboard)/layout.tsx` -- already does the auth + project_members gate; Phase 49 adds the sidebar choice and (for /swarm routes) the SwarmRealtimeProvider boundary

### Established Patterns
- Server components for data fetching, client components for interactivity (`"use client"` boundary at the smallest leaf possible)
- Supabase queries via the typed client; `select("*", { count: "exact", head: true })` for cheap counts (used in Phase 48-03)
- shadcn Card / Button / DropdownMenu still available for any non-V7 chrome
- Realtime via `useBroadcast` is per-component today; Phase 49 introduces the per-view-provider pattern that all later V7 phases follow

### Integration Points
- `web/app/(dashboard)/layout.tsx` -- branch on pathname to choose sidebar; pass user's accessible swarm list
- New file `web/app/(dashboard)/swarm/[swarmId]/layout.tsx` -- mounts SwarmRealtimeProvider, validates swarm access
- New file `web/app/(dashboard)/swarm/[swarmId]/page.tsx` -- renders V7 layout grid with placeholders
- `web/components/v7/` -- destination for `swarm-sidebar.tsx`, `swarm-realtime-provider.tsx`, `swarm-layout-shell.tsx`
- `web/lib/v7/` -- destination for `useRealtimeTable.ts` hook + types

</code_context>

<specifics>
## Specific Ideas

- Sidebar mini-stat row format: `{count} active` and `{count} agents` as small pill labels under the swarm name, using `--v7-faint` text and `--v7-radius-pill`
- Active swarm row uses a 3px left accent bar in `--v7-teal` plus the soft teal background -- matches the "active state dots" usage in UI-SPEC
- Layout shell placeholders display the destination phase as a subtle caption (e.g., "Briefing panel -- Phase 51") so anyone testing knows what's coming
- Channel name `swarm:${swarmId}` (colon-separated) follows the convention used in existing `web/lib/supabase/broadcast.ts` channel names
- `useRealtimeTable<T>(table: 'agent_events' | 'swarm_jobs' | 'swarm_agents' | 'swarm_briefings')` returns `{ rows: T[], status: ChannelStatus }`

</specifics>

<deferred>
## Deferred Ideas

- Smart filter buttons in sidebar (NAV-04) -- explicitly deferred to Phase 52 per REQUIREMENTS.md traceability
- Ring buffer for agent_events (max 500) -- deferred to Phase 52 when terminal stream is built and actually renders events
- Persisting "last visited swarm" in localStorage so the sidebar opens that swarm on next session -- nice-to-have, not in scope; URL is canonical
- Optimistic UI for sidebar mini-stats (predict counts before the round-trip) -- not needed; Realtime latency is sub-second and stats update fluidly
- Skeleton loading components for the V7 layout shell -- Claude's discretion during execution
- Migrating the legacy sidebar to V7 tokens -- Phase 54 (Polish) handles this

### Reviewed Todos (not folded)
None -- no todos relevant to Phase 49 surfaced.

</deferred>

---

*Phase: 49-navigation-realtime*
*Context gathered: 2026-04-16*
