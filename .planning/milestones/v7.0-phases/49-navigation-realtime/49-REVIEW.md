---
phase: 49-navigation-realtime
reviewed: 2026-04-16
reviewer: inline (autonomous mode)
depth: standard
files_reviewed: 14
findings:
  critical: 0
  high: 0
  medium: 2
  low: 3
  info: 3
status: approved_with_recommendations
---

# Phase 49 Code Review

Inline review of the 14 files touched by Phase 49 (`feat(49-01)` + `feat(49-02)`). Focus areas: Realtime provider correctness, React effect lifecycle, access gate safety, type safety, XSS surface.

## Critical

None.

## High

None.

## Medium

### M-01: Initial snapshot sort order vs Realtime INSERT append order

**File:** `web/components/v7/swarm-realtime-provider.tsx`
**Lines:** 89-99 (initial fetch), 39-43 (applyMutation INSERT branch)

The initial snapshot for `agent_events` and `swarm_briefings` is ordered by `created_at DESC` / `generated_at DESC` (newest first). But the `applyMutation` INSERT branch appends new rows to the end of the array: `return [...current, next]`. When a new event arrives, it ends up at the tail of an array that is otherwise newest-first.

**Impact:** Any downstream component that treats the array as sorted will see newcomers in the wrong position. Phase 49 has no such consumer (placeholders don't render events), but Phase 52's terminal stream relies on order.

**Recommendation:** Either (a) drop the `.order()` clauses on initial fetch and let consumers sort, or (b) change the INSERT branch to prepend: `return [next, ...current]`. Prepending is cheaper and matches Supabase's convention of "latest first". Log this for Phase 52 pickup rather than fixing now — the terminal stream design there will decide.

**Severity:** Medium (latent; no current consumer is affected).

### M-02: State persists across swarmId changes within a single mount

**File:** `web/components/v7/swarm-realtime-provider.tsx`
**Lines:** 79-179

If `swarmId` changes while the provider is mounted (which in practice doesn't happen today, because the route layout unmounts on dynamic segment change), the effect's cleanup runs and a new subscription starts — but `bundle` state retains rows from the previous swarm until the new snapshot resolves.

**Impact:** In the current architecture, this is not reachable (Next.js always unmounts the `[swarmId]` layout on segment change). If a future refactor reuses the provider across swarmId changes (e.g. side-by-side dual-swarm view), stale rows would leak into the new swarm's view.

**Recommendation:** Add `setBundle(EMPTY_BUNDLE)` at the top of the useEffect body before starting the new fetch. Cheap, defensive, zero runtime cost today. NOT fixing in this review cycle; tracked for when it matters.

**Severity:** Medium (defensive; unreachable in current architecture).

## Low

### L-01: Dashboard-wide Realtime channel receives events from all swarms (RLS-backed but noisy)

**File:** `web/components/v7/swarm-sidebar.tsx`
**Lines:** 76-103

The `dashboard:swarms` channel subscribes to `swarm_jobs` and `swarm_agents` without a `swarm_id` filter. Supabase Realtime v2 honors RLS on postgres_changes — events for rows a user cannot SELECT are not delivered. However, the current V7 RLS policy (Phase 48-02) is `FOR SELECT TO authenticated USING (true)`, so every authenticated user receives every event globally.

**Impact:** Today, a user sees Realtime events for swarms they cannot open (because those swarms don't appear in their `swarms` prop). The events are filtered to nothing on the client (swarms map lookup misses), so no data leaks — but bandwidth and CPU are wasted.

**Recommendation:** Tighten the RLS policy on `swarm_jobs` and `swarm_agents` to require a matching `project_members` row (scoped by `swarm_id`). This is a Phase 50+ concern once real data starts flowing. Log as deferred.

**Severity:** Low (no data leak; only efficiency).

### L-02: `<a aria-current="page">` on the active swarm row uses Next.js `<Link>`, which forwards props correctly

**File:** `web/components/v7/swarm-list-item.tsx`
**Lines:** 30-40

`aria-current={isActive ? "page" : undefined}` is attached to `<Link>`. Next.js forwards unknown props to the underlying `<a>`, so this is valid. No change needed; noting for awareness.

**Severity:** Info (not a finding; documented for verifier).

### L-03: Sidebar "jobs today" count is a proxy, not a true "today" filter

**File:** `web/components/v7/swarm-sidebar.tsx`
**Lines:** 117-119, 195-198

`jobsToday = jobs.length` -- the sidebar labels the total count of jobs in the Realtime state as "jobs today". The state contains all jobs the user can see, not just jobs created today.

**Impact:** Label is slightly misleading. UI-SPEC called it "Jobs today" as a copywriting decision; Phase 49 doesn't have time-of-day filtering infrastructure.

**Recommendation:** Either rename the label to "Jobs in view" or add a `created_at >= today` filter. The simplest fix is to rename the label. Defer to polish pass (Phase 54) or revisit when Phase 51 ships briefings.

**Severity:** Low (copywriting, not functional).

## Info

### I-01: `applyMutation` INSERT idempotency guard is correct

The INSERT branch checks `current.some((r) => r.id === next.id)` before appending. This correctly handles the race where the initial snapshot resolves AFTER a Realtime INSERT arrives for the same row.

### I-02: useEffect deps list `[swarmId]` is correct

The Supabase client from `createClient()` is module-cached (see `web/lib/supabase/client.ts`) and returns a fresh instance each call, but the instance itself is independent. Adding `supabase` to deps would cause the effect to re-run unnecessarily (since it's a new reference per render). `[swarmId]` is the minimal correct deps.

### I-03: `notFound()` called twice in swarm layout is defensive, not redundant

The swarm layout calls `notFound()` once when `!user` (defensive — parent dashboard layout should have redirected) and once when `!count` (the actual unauthorized case). Both are intentional.

## Files reviewed (14)

- `web/lib/v7/types.ts` — clean type definitions, no issues
- `web/lib/v7/swarm-data.ts` — server-only helper, uses RLS-gated query correctly
- `web/lib/v7/use-realtime-table.ts` — minimal hook, no issues
- `web/components/v7/swarm-realtime-provider.tsx` — M-01, M-02 (both non-blocking)
- `web/components/v7/sidebar-mini-stat.tsx` — clean presentational component
- `web/components/v7/realtime-status-indicator.tsx` — clean, accessible (aria-hidden on dot)
- `web/components/v7/swarm-list-item.tsx` — L-02 (info only)
- `web/components/v7/swarm-sidebar.tsx` — L-01, L-03
- `web/components/v7/sidebar-chooser.tsx` — clean branch logic
- `web/components/v7/swarm-layout-shell.tsx` — clean; all regions captioned
- `web/app/(dashboard)/swarm/[swarmId]/layout.tsx` — I-03 (defensive correctness)
- `web/app/(dashboard)/swarm/[swarmId]/page.tsx` — clean
- `web/app/(dashboard)/swarm/[swarmId]/not-found.tsx` — clean
- `web/app/(dashboard)/layout.tsx` — Phase 48-03 gate preserved

## Security

- No new RLS policies; Phase 48-02 `USING (true)` SELECT policy inherited (see L-01 for implication)
- No user-controlled input passed to SQL (`eq("swarm_id", swarmId)` is parameterized by Supabase client)
- No dangerouslySetInnerHTML; all rendering goes through React auto-escape
- No new env vars or secrets
- Auth flow unchanged from Phase 48-03

## Recommendation

**Approved with recommendations.** Medium findings are latent or defensive; no blocker for phase completion. Log M-01 and L-03 for Phase 52 (terminal) and Phase 54 (polish) respectively. L-01 (RLS tightening) is a Phase 50+ concern when real swarm ownership semantics land.

No auto-fix pass needed.
