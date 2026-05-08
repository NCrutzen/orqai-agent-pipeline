---
phase: 48-foundation
plan: 03
subsystem: auth
tags: [supabase-auth, oauth, azure-ad, microsoft-sso, rls]

# Dependency graph
requires:
  - phase: 34
    provides: project_members table, Supabase auth scaffold, /login page, /auth/callback route
provides:
  - Microsoft SSO button on /login that initiates Azure AD OAuth
  - /access-pending page for users without project_members rows
  - project_members gate on (dashboard) layout that redirects unauthorized users
  - /access-pending exempted from auth middleware
affects: [49-navigation-realtime, 50-data-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [supabase-oauth-azure, oauth-identity-auto-linking, server-side-access-gate]

key-files:
  created:
    - web/app/(auth)/access-pending/page.tsx
  modified:
    - web/app/(auth)/login/page.tsx
    - web/app/(dashboard)/layout.tsx
    - web/middleware.ts

key-decisions:
  - "OAuth (not SAML) for Azure AD -- Supabase Auth auto-links Azure identity to existing email/password user when email matches"
  - "Access gate in (dashboard) layout server component -- project_members COUNT(*) with head:true for efficiency, no row data fetched"
  - "Access-pending page placed OUTSIDE (dashboard) layout group to avoid infinite redirect loop"
  - "Middleware exempts /access-pending path so unauthorized users can reach the page"

patterns-established:
  - "Supabase OAuth via signInWithOAuth({ provider: 'azure', options: { scopes: 'email profile openid', redirectTo: '/auth/callback' } })"
  - "Server-side access gates use supabase.from('table').select('*', { count: 'exact', head: true }) for zero-row count checks"
  - "Error surface uses ?error= query param with typed cases (no_access, auth_failed, invalid_link, sso_failed)"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: ~12min (3 commits across 20:29-20:30)
completed: 2026-04-15
---

# Phase 48 Plan 03: Azure AD SSO & Access Gate Summary

**Microsoft SSO button on /login, access-pending page for unauthorized users, and project_members gate on the dashboard layout with middleware exemption.**

## Performance

- **Duration:** ~12 min (3 feat commits, 2026-04-15T20:29:35 -> 20:30:44)
- **Tasks:** 2 automated + 1 human-verify checkpoint (deferred)
- **Files created:** 1
- **Files modified:** 3

## Accomplishments

- Microsoft SSO button renders on /login above the email/password form, calling `signInWithOAuth({ provider: 'azure' })` with email/profile/openid scopes and the existing `/auth/callback` redirect
- Existing `/auth/callback` handler unchanged -- already supports any OAuth provider
- `/access-pending` page created as server component with shadcn Card, copy from UI-SPEC, and "Back to sign in" Link
- Dashboard layout (`web/app/(dashboard)/layout.tsx`) now performs `project_members` COUNT(*) check after authentication and redirects to `/access-pending` when count is 0
- Middleware (`web/middleware.ts`) exempts `/access-pending` from the auth redirect so unauthenticated users can reach it
- New `?error=sso_failed` case added with Microsoft-specific messaging
- Existing email/password login flow completely unchanged (visually separated by "or" divider below the SSO button)

## Task Commits

Each task was committed atomically:

1. **Task 1 (SSO button + access-pending page)** - `038a8c4` (feat) + `cccdebc` (feat, middleware exemption + polish)
2. **Task 2 (project_members gate in dashboard layout)** - `83d00c6` (feat)
3. **Task 3 (Human-verify Azure AD SSO end-to-end)** - DEFERRED (see below)

## Files Created/Modified

- `web/app/(auth)/access-pending/page.tsx` -- new server component, centered card with empty-state messaging
- `web/app/(auth)/login/page.tsx` -- added `MicrosoftIcon` SVG, `handleMicrosoftLogin` handler, SSO button above the email/password form with "or" divider, `sso_failed` error case
- `web/app/(dashboard)/layout.tsx` -- added `project_members` COUNT(*) check after authenticated redirect, redirects to `/access-pending` when count is 0
- `web/middleware.ts` -- added `!request.nextUrl.pathname.startsWith("/access-pending")` exemption to the auth redirect condition

## Decisions Made

- **OAuth, not SAML** -- Supabase Auth auto-links the Azure identity to any existing email/password user when emails match. SAML would require explicit identity mapping logic; OAuth gives us the link for free. This directly satisfies AUTH-02.
- **Gate on server layout, not middleware** -- placing the project_members check in the `(dashboard)` server layout keeps the auth concern close to the layout, avoids running the query on every request (middleware runs on all paths), and guarantees the check runs on every dashboard render.
- **`head: true` for efficiency** -- the COUNT(*) query uses `{ count: 'exact', head: true }` so Supabase returns the count without row data -- one integer over the wire per dashboard render.
- **Access-pending outside the (dashboard) group** -- placing it in `(auth)/access-pending` means the dashboard layout doesn't run against it, preventing infinite redirect.

## Deviations from Plan

None in code. The human-verify checkpoint (Task 3) was deferred pending Azure AD tenant provisioning -- see below.

## Deferred: Human Verification (Task 3)

The human-verify checkpoint (Task 3 in 48-03-PLAN.md) is **deferred until Azure AD tenant is provisioned and IT admin has configured the Microsoft app registration in the Moin Roberts tenant**. This is an organizational dependency flagged in STATE.md Blockers.

**To complete the checkpoint later, the user must:**

1. IT admin creates an Azure AD app registration in the Moin Roberts tenant with redirect URI `https://<app-domain>/auth/callback`
2. Configure the Azure provider in the Supabase dashboard (Authentication -> Providers -> Azure) with client ID + client secret from the app registration
3. Visit `/login`, click "Sign in with Microsoft" -- expect redirect to Microsoft login
4. Sign in with a Microsoft account that matches an existing email/password user -- expect to land on dashboard, not access-pending
5. Inspect `auth.users` table to verify Azure identity is linked to the existing user (no duplicate row)
6. Test with a Microsoft account that has NO matching email -- expect a new `auth.users` row and redirect to `/access-pending`
7. Verify `/access-pending` shows the correct copy and the "Back to sign in" button navigates to `/login`
8. Verify existing email/password login still works unchanged

**Resume signal when verified:** Respond "SSO verified" or describe issues with the flow.

## Issues Encountered

None at code level. Pre-existing infrastructure constraints noted:

- `next build` fails on an unrelated Turbopack + `@napi-rs/keyring` native addon issue introduced by the Zapier SDK in `web/app/api/tools/outlook/archive/route.ts` (`bed05af`, pre-dating this plan). Not caused by 48-03; tracked separately.
- `tsc --noEmit` passes for all 48-03 files. Pre-existing type errors in `debtor-email-analyzer/` and `lib/automations/sales-email-analyzer/` are unrelated.

## User Setup Required

**Required before Task 3 verification can run:**

- Azure AD app registration in the Moin Roberts tenant
- Supabase project -> Authentication -> Providers -> Azure enabled with the client ID + secret
- Redirect URL configured: `<app-url>/auth/callback`

No code changes required from the user -- only external Azure/Supabase configuration.

## Next Phase Readiness

- All Phase 48 infrastructure in place: V7 design tokens + theme (48-01), V7 database tables (48-02), Azure AD SSO + access gate (48-03)
- Phase 49 (Navigation & Realtime) can begin immediately -- no blocker from the deferred SSO checkpoint
- When IT delivers the Azure tenant, verification is a user-driven test; no further code changes anticipated

## Self-Check: PASSED

- [x] SUMMARY.md exists at `.planning/phases/48-foundation/48-03-SUMMARY.md`
- [x] Task commits `038a8c4`, `cccdebc`, `83d00c6` found in git log
- [x] `signInWithOAuth({ provider: "azure" ... })` present in `web/app/(auth)/login/page.tsx:50`
- [x] "Sign in with Microsoft" button renders above email/password form
- [x] `/access-pending` page renders at `web/app/(auth)/access-pending/page.tsx` with UI-SPEC copy
- [x] project_members COUNT(*) check present in `web/app/(dashboard)/layout.tsx:21-28`
- [x] `/access-pending` exempted in `web/middleware.ts:38`
- [x] No TypeScript errors in 48-03 scope (login, access-pending, dashboard layout, middleware)
- [x] Task 3 (human-verify) documented as deferred with explicit resume path

---
*Phase: 48-foundation*
*Completed (code): 2026-04-15*
*Checkpoint deferred: Azure AD tenant pending from IT*
