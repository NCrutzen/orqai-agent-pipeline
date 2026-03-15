---
phase: 34-foundation-auth
plan: 02
subsystem: ui
tags: [nextjs, supabase, rls, shadcn-ui, microsoft-graph, zod, project-management, invite-flow]

# Dependency graph
requires:
  - phase: 34-01
    provides: "Supabase client factories, auth proxy, dashboard layout, database schema with RLS"
provides:
  - Project list home page with search/filter and stats overview
  - Project creation modal with zod validation
  - Project detail page with member list and pipeline placeholder
  - AD directory search API route via Microsoft Graph
  - Invite API route with dual path (AD user / email invite)
  - Invite member modal with Directory/Email toggle
affects: [34-03, 35-pipeline-execution]

# Tech tracking
tech-stack:
  added: []
  patterns: [client-side search/filter, dual-mode invite (AD + email), server-side invite with service_role, debounced API search]

key-files:
  created:
    - web/app/(dashboard)/page.tsx
    - web/app/(dashboard)/project-search.tsx
    - web/components/project-card.tsx
    - web/components/create-project-modal.tsx
    - web/components/invite-member-modal.tsx
    - web/app/api/invite/route.ts
    - web/app/api/users/search/route.ts
    - web/app/(dashboard)/projects/[id]/page.tsx
  modified: []

key-decisions:
  - "Database trigger handles auto-membership on project creation -- no client-side second insert needed"
  - "Invite API uses upsert with onConflict for idempotent member addition"
  - "AD search passes email to invite API (not Supabase user ID) since Graph IDs != Supabase IDs"

patterns-established:
  - "Client-side search: server-side data fetch, client-side filter with useMemo for instant results"
  - "Dual-mode invite: Directory autocomplete via Graph API + manual email with inviteUserByEmail"
  - "API route auth: verify calling user membership before allowing operations"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 34 Plan 02: Project Management Summary

**Project list home page with search/filter, create modal, AD directory invite with autocomplete, and project detail page with member management**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T12:35:49Z
- **Completed:** 2026-03-15T12:40:17Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Home page replaced with full project list showing activity stats overview (runs, success rate, approvals) and client-side search/filter
- Create Project modal with zod validation, Supabase insert, and auto-refresh (database trigger handles membership)
- Invite member modal with dual mode: AD directory autocomplete via Microsoft Graph and manual email entry for external users
- Project detail page with breadcrumb navigation, member list, and pipeline runs placeholder
- Server-side API routes for AD user search (with graceful 403 handling) and invite flow (idempotent, auth-checked)

## Task Commits

Each task was committed atomically:

1. **Task 1: Project list home page with search, stats overview, and create modal** - `6d73c76` (feat)
2. **Task 2: Invite member modal, AD search API, invite API route, and project detail page** - `736d21e` (feat)

## Files Created/Modified
- `web/app/(dashboard)/page.tsx` - Project list home page with stats overview, search, empty state
- `web/app/(dashboard)/project-search.tsx` - Client-side search/filter component with useMemo
- `web/components/project-card.tsx` - Project card with name, member count, relative time, run status badge
- `web/components/create-project-modal.tsx` - Modal with name + description fields, zod validation, loading state
- `web/components/invite-member-modal.tsx` - Dual-mode invite (Directory autocomplete + Email), current members display
- `web/app/api/users/search/route.ts` - Microsoft Graph AD search proxy with 2-char minimum, graceful error handling
- `web/app/api/invite/route.ts` - Invite route with auth check, dual path (AD/email), idempotent upsert
- `web/app/(dashboard)/projects/[id]/page.tsx` - Project detail with breadcrumb, members, pipeline placeholder

## Decisions Made
- Relied on database trigger (from 34-01) for auto-adding project creator as member rather than dual client-side inserts -- simpler and atomic
- Used upsert with `onConflict: "project_id,user_id"` for idempotent invite handling -- prevents errors when inviting already-existing members
- AD search passes email (not Supabase user ID) to invite API because Microsoft Graph user IDs are different from Supabase auth IDs
- Empty state uses prominent CTA button with FolderOpen icon for visual clarity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict typing for project members map**
- **Found during:** Task 2 (Project detail page)
- **Issue:** TypeScript `noImplicitAny` error on `members.map()` callback parameter
- **Fix:** Added explicit type annotation `{ user_id: string; email?: string }[]` to members array
- **Files modified:** web/app/(dashboard)/projects/[id]/page.tsx
- **Verification:** Build passes
- **Committed in:** 736d21e (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Graph API authProvider type mismatch**
- **Found during:** Task 2 (AD search route)
- **Issue:** `session.provider_token` can be `undefined` but `done()` callback expects `string | null`
- **Fix:** Added nullish coalescing `?? null` to convert undefined to null
- **Files modified:** web/app/api/users/search/route.ts
- **Verification:** Build passes
- **Committed in:** 736d21e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor TypeScript strictness fixes. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Project CRUD and invite flow complete -- Phase 34 core functionality delivered
- Plan 34-03 can build on this foundation for any remaining phase tasks
- Pipeline runs section shows placeholder, ready for Phase 35 to populate
- AD directory search will work once Azure App Registration has `User.Read.All` permission with admin consent

## Self-Check: PASSED

All 8 key files verified present. Both task commits (6d73c76, 736d21e) confirmed in git log.

---
*Phase: 34-foundation-auth*
*Completed: 2026-03-15*
