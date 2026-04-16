# Phase 49: Navigation & Realtime - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 49-navigation-realtime
**Mode:** --auto (recommended-default selection per gray area)
**Areas discussed:** Sidebar architecture, Routing & layout, Realtime distribution, Mini-stats data flow, Active state, Tear-down semantics

---

## Sidebar Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| New V7 sidebar component, legacy untouched | Build `web/components/v7/swarm-sidebar.tsx` and branch in (dashboard) layout based on pathname. Legacy app-sidebar stays for /executive, /projects, /runs, /settings. | ✓ |
| Replace shadcn sidebar entirely | Rewrite app-sidebar to V7 style; all routes use V7 sidebar | |
| Augment existing sidebar with V7 styles | Keep one sidebar, add V7 classes conditionally | |

**Auto-selected:** New V7 sidebar component, legacy untouched
**Rationale:** Lowest risk -- no regressions on existing pages; legacy migration is Phase 54 anyway.

---

## Routing & Layout

| Option | Description | Selected |
|--------|-------------|----------|
| `/swarm/[swarmId]` under (dashboard) group | Inherits auth + project_members gate; new layout adds Realtime provider + swarm-specific access check | ✓ |
| Top-level `/swarm/[swarmId]` outside (dashboard) | Standalone group, duplicate auth code | |
| Modal/overlay swarm view | Renders inside dashboard without route change | |

**Auto-selected:** /swarm/[swarmId] under (dashboard) group
**Rationale:** Reuses existing auth gate; URL-driven navigation is required by NAV-02; matches REQUIREMENTS exactly.

---

## Realtime Distribution Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| React Context provider with useRealtimeTable hook | One channel per swarm view; provider exposes typed arrays per table; child components consume via hook | ✓ |
| Zustand store with single channel | Global store; channel writes mutate slices; no provider | |
| Prop drilling from page component | Channel created in page; data passed down explicitly | |

**Auto-selected:** React Context provider with useRealtimeTable hook
**Rationale:** Roadmap explicitly names "useRealtimeTable hook"; Context naturally scopes lifecycle to the swarm route layout (mount/unmount on segment change); no new dependency (zustand isn't installed).

---

## Channel Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Single channel `swarm:{id}` with multiple postgres_changes events | Subscribes to 4 V7 tables filtered by swarm_id on one channel | ✓ |
| Channel per table | Four channels per swarm view | |
| One global channel for everything | Single dashboard-wide channel watching all V7 tables | |

**Auto-selected:** Single channel with multiple postgres_changes events
**Rationale:** Satisfies RT-01 ("single subscription per swarm view") literally; Supabase Realtime supports multiple `postgres_changes` filters on one channel; cleaner teardown.

---

## Mini-Stats Data Source (NAV-03)

| Option | Description | Selected |
|--------|-------------|----------|
| SSR initial counts + dashboard-wide Realtime channel | One additional channel `dashboard:swarms` watching swarm_jobs and swarm_agents table-wide; sidebar recomputes counts on each event | ✓ |
| Materialized view with periodic refresh | Postgres view with cron refresh; sidebar polls the view | |
| Per-swarm channel for each row in sidebar | One channel per visible swarm row | |

**Auto-selected:** SSR initial counts + dashboard-wide Realtime channel
**Rationale:** No additional infra needed; one extra channel for the entire dashboard is acceptable (RT-01 constrains the swarm-view channel count, not dashboard-level chrome); per-row channels would explode at N>5 swarms.

---

## Active Swarm Indicator

| Option | Description | Selected |
|--------|-------------|----------|
| URL-driven highlight (no localStorage) | Compare row swarmId to params.swarmId; teal accent bar + soft bg | ✓ |
| URL + localStorage "last visited swarm" | Auto-open last swarm on dashboard entry | |
| Cookie-based last-visited | Server-set cookie | |

**Auto-selected:** URL-driven highlight
**Rationale:** Single source of truth (URL); no hydration mismatch risk; localStorage is a Phase 8+ nice-to-have, not in scope.

---

## Tear-Down Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Provider in route layout, Next.js handles unmount on segment change | Cleanup runs in useEffect return; supabase.removeChannel(channel) | ✓ |
| Manual abort via beforeunload | useEffect with explicit window listener | |
| Keep channel alive across swarms, switch swarm_id filter | Reuse one channel across navigations | |

**Auto-selected:** Provider in route layout, Next.js handles unmount on segment change
**Rationale:** Idiomatic React/Next; no custom lifecycle code; verified by `supabase.getChannels()` after navigation per success criterion #4.

---

## Layout Shell Content

| Option | Description | Selected |
|--------|-------------|----------|
| Empty placeholders with phase captions | GlassCard placeholder regions labeled "Briefing -- Phase 51" etc. | ✓ |
| Skeleton-only with no labels | Visually empty until later phases fill | |
| Stub fleet cards using fake data | Render approximate data to demo layout | |

**Auto-selected:** Empty placeholders with phase captions
**Rationale:** Proves the V7 grid renders end-to-end; tells reviewers exactly what each region becomes; no fake data risk; minimal code.

---

## Claude's Discretion

- Tailwind utility vs `@layer` styles for the V7 sidebar
- Suspense streaming vs blocking SSR for the swarm list
- Skeleton appearance for the swarm list during initial fetch
- Exact file split inside `web/components/v7/`
- Hand-written vs schema-generated TypeScript types for Realtime payloads
- Test approach (real Supabase integration vs stubbed channel for unit tests)

## Deferred Ideas

- Smart filter buttons (NAV-04) -- Phase 52
- Ring buffer for agent_events -- Phase 52
- localStorage "last visited swarm" -- not in scope
- Optimistic mini-stats UI -- not needed
- Migrate legacy sidebar to V7 tokens -- Phase 54

---

*Generated: 2026-04-16 -- auto mode*
