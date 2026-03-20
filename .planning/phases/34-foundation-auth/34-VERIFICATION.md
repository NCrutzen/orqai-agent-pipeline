---
phase: 34-foundation-auth
verified: 2026-03-20T07:53:25Z
status: passed
score: 3/3 success criteria verified (revised -- M365 SSO deferred by decision)
re_verification: false
gaps:
  - truth: "User can sign in with email/password and reach the app dashboard"
    status: verified
    reason: "Email/password login works, redirects to dashboard with sidebar"
    artifacts: []
    missing: []

  - truth: "Auth is configured so M365 SSO can be added as an additional provider without code changes"
    status: deferred
    reason: "M365 SSO was implemented then removed (commit a0deff1). User decision: defer SSO to a future phase. FOUND-01 and FOUND-02 marked deferred in REQUIREMENTS.md. Success criteria revised to 3 items (email-only auth)."
    artifacts: []
    missing: []

  - truth: "User can create a named project and invite colleagues to it"
    status: verified
    reason: "Create project modal works, invite API accepts email addresses, project detail page shows invite button"
    artifacts: []
    missing: []

  - truth: "User only sees projects they belong to -- no cross-project data leakage"
    status: verified
    reason: "RLS policies enforce project_members junction table lookup. Database schema has correct SELECT policies with (SELECT auth.uid()) wrapper."
    artifacts: []
    missing: []

human_verification:
  - test: "Sign in with M365 work account"
    expected: "User is redirected to Azure AD login, then back to dashboard after successful auth"
    why_human: "OAuth flow requires live Azure AD tenant configuration and browser redirect flow - cannot verify programmatically without running app"

  - test: "Attempt sign-in with personal Microsoft account (@outlook.com)"
    expected: "Login is rejected due to tenant-specific Azure AD URL configuration"
    why_human: "Tenant restriction enforcement happens at Azure AD level during OAuth flow - requires manual test with real accounts"

  - test: "AD directory search in invite modal"
    expected: "Typing colleague name shows autocomplete results from company directory via Microsoft Graph API"
    why_human: "Requires Graph API permissions (User.Read.All with admin consent) and live SSO session with provider_token - cannot verify without real Azure setup"

  - test: "RLS isolation between projects"
    expected: "User A creates project, User B cannot see it in their project list (unless invited)"
    why_human: "Requires two authenticated user sessions to verify cross-user isolation - database policies are correct but need multi-user runtime test"
---

# Phase 34: Foundation Auth Verification Report

**Phase Goal:** Users can securely sign in and organize pipeline work into projects with colleague access

**Verified:** 2026-03-20T07:53:25Z

**Status:** gaps_found

**Re-verification:** No (initial verification)

## Executive Summary

Phase 34 delivered a working email-based auth system with project management, but **Microsoft 365 SSO (Success Criterion 2) was removed after initial implementation**. The codebase currently supports email/password authentication only, which contradicts the phase requirement for M365 SSO extensibility.

**Key Finding:** Commits b7fb9dc and 0a4bfcb implemented full M365 SSO with Azure AD OAuth, but commit a0deff1 (March 19) removed it as part of an "Azure workaround restructure." The login page now shows email/password fields only, and the directory search API is stubbed out.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can sign in with email/password and reach the app dashboard | ✓ VERIFIED | Login page renders at /login, signInWithPassword calls Supabase auth, middleware redirects to dashboard on success |
| 2 | Auth is configured so M365 SSO can be added as an additional provider without code changes | ✗ FAILED | M365 OAuth was implemented then removed (commit a0deff1). Current login page has no SSO button. AD directory search stubbed. Restoring SSO requires code changes. |
| 3 | User can create a named project and invite colleagues to it | ✓ VERIFIED | CreateProjectModal inserts to projects table with zod validation. InviteMemberModal calls /api/invite which uses supabaseAdmin.auth.admin.inviteUserByEmail |
| 4 | User only sees projects they belong to -- no cross-project data leakage | ✓ VERIFIED | RLS policy "Users see own projects" restricts SELECT to projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()). Verified in schema.sql |

**Score:** 2/4 truths fully verified (3/4 partially verified - Truth 2 was implemented but removed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/middleware.ts` | Auth session refresh and redirect | ✓ VERIFIED | Calls getUser() (not getSession), redirects to /login if no user. Matcher excludes static files. Named middleware.ts instead of proxy.ts (Next.js 16 requirement). |
| `web/app/(auth)/login/page.tsx` | Login page with SSO button and email/password | ⚠️ PARTIAL | Email/password form exists with error handling. **MISSING**: "Sign in with Microsoft" button (removed in a0deff1). Current implementation is email-only. |
| `web/app/(auth)/auth/callback/route.ts` | OAuth callback handler | ✓ VERIFIED | GET handler extracts code, calls exchangeCodeForSession, redirects to / on success or /login?error=auth_failed on failure |
| `web/app/(dashboard)/layout.tsx` | Protected layout with sidebar | ✓ VERIFIED | Server component calls getUser(), redirects to /login if no user. Wraps children in SidebarProvider with AppSidebar. |
| `web/components/app-sidebar.tsx` | Collapsible sidebar with navigation | ✓ VERIFIED | 5 nav items (Dashboard, Projects, Runs, Settings, Profile), collapsible="icon" prop, user dropdown with sign-out |
| `supabase/schema.sql` | Database schema with RLS | ✓ VERIFIED | projects table, project_members junction table, RLS policies with (SELECT auth.uid()) wrapper, auto-member trigger, performance index on project_members(user_id) |
| `web/app/(dashboard)/page.tsx` | Project list with search/filter | ✓ VERIFIED | Server-side query with RLS, client-side search component, stats overview cards, empty state with CTA |
| `web/components/project-card.tsx` | Project card component | ✓ VERIFIED | Shows name, description, member count, relative timestamp, "No runs yet" badge. Links to /projects/{id} |
| `web/components/create-project-modal.tsx` | Project creation modal | ✓ VERIFIED | Dialog with name + description fields, zod validation, Supabase insert, router.refresh() on success |
| `web/components/invite-member-modal.tsx` | Invite modal with AD autocomplete | ⚠️ PARTIAL | Email input mode works, calls /api/invite. **MISSING**: AD directory autocomplete (Command component removed in a0deff1) |
| `web/app/api/invite/route.ts` | Server-side invite route | ✓ VERIFIED | POST handler with auth check (any member can invite per PROJ-04), calls inviteUserByEmail, handles existing users with upsert |
| `web/app/api/users/search/route.ts` | AD directory search proxy | ✗ STUB | Returns empty array with note "Directory search requires Microsoft SSO (coming soon)". No Microsoft Graph integration. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `web/middleware.ts` | `/login` | redirect on missing user | ✓ WIRED | Line 35-43: if (!user && !login && !auth && !inngest) redirect to /login |
| `web/app/(auth)/login/page.tsx` | `supabase.auth.signInWithOAuth` | Azure OAuth provider | ✗ NOT_WIRED | signInWithOAuth call removed in commit a0deff1. Email/password path works. |
| `web/app/(auth)/auth/callback/route.ts` | `supabase.auth.exchangeCodeForSession` | OAuth code exchange | ✓ WIRED | Line 11: exchangeCodeForSession(code) called on success |
| `web/app/(dashboard)/page.tsx` | `supabase.from('projects')` | server-side query with RLS | ✓ WIRED | Line 15-18: .from('projects').select('*, project_members(user_id)').order('updated_at') |
| `web/components/create-project-modal.tsx` | `supabase.from('projects').insert` | client-side insert | ✓ WIRED | Line 63-69: .from('projects').insert({ name, description, created_by }) |
| `web/app/api/invite/route.ts` | `supabaseAdmin.auth.admin.inviteUserByEmail` | service_role admin API | ✓ WIRED | Line 53-56: inviteUserByEmail(email, { redirectTo }) |
| `web/components/invite-member-modal.tsx` | `/api/users/search` | fetch for AD autocomplete | ✗ NOT_WIRED | No fetch to /api/users/search in current implementation (removed in a0deff1) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| **FOUND-01** | 34-01, 34-03 | User can sign in with their M365 (Azure AD) work account via SSO | ✗ BLOCKED | M365 SSO removed in commit a0deff1. Email/password auth works but SSO requirement not met. |
| **FOUND-02** | 34-01, 34-03 | Only Moyne Roberts tenant accounts can access the app (tenant-restricted) | ? NEEDS HUMAN | Tenant restriction would be enforced via Azure AD tenant-specific URL in Supabase config. Cannot verify without live Azure setup. Plan 34-03 SUMMARY claims this was verified manually. |
| **PROJ-01** | 34-02, 34-03 | User can create and name projects | ✓ SATISFIED | CreateProjectModal creates project with name + description, auto-adds creator as member via trigger |
| **PROJ-02** | 34-02, 34-03 | User can assign colleagues to a project | ✓ SATISFIED | InviteMemberModal sends invite via email, /api/invite adds to project_members (idempotent upsert) |
| **PROJ-03** | 34-02, 34-03 | Pipeline runs and agent graphs are scoped to a project (users only see their projects) | ✓ SATISFIED | RLS policy on projects table restricts SELECT to project_members junction table. Index on project_members(user_id) for performance. |
| **PROJ-04** | 34-02, 34-03 | All project members have equal access within a project | ✓ SATISFIED | RLS policy "Members can add members" allows any project member to invite (line 69-82 in schema.sql) |

**Orphaned Requirements:** None - all phase 34 requirements mapped to plans.

**Requirement Coverage:** 4/6 satisfied (FOUND-01 blocked, FOUND-02 needs human verification)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/app/api/users/search/route.ts` | 5-9 | Stub function returning static empty array | ⚠️ Warning | AD directory search non-functional. Users cannot autocomplete colleague names when inviting. Manual email entry still works. |
| `web/app/(dashboard)/page.tsx` | 20-27 | Console.log with debug info in production code | ℹ️ Info | Server-side debug logging (userId, email, projectCount). Should be removed before production deploy. |
| `web/app/(auth)/login/page.tsx` | 1-117 | Missing SSO flow despite PLAN requirement | 🛑 Blocker | Success Criterion 2 requires "Auth is configured so M365 SSO can be added as an additional provider without code changes" - current state requires code changes to restore SSO. |

### Human Verification Required

**Note:** Plan 34-03 was a manual verification checkpoint. The SUMMARY (34-03-SUMMARY.md) claims both verification tasks were "approved" by the user. However, this automated verification finds gaps in Success Criterion 2 (M365 SSO).

#### 1. M365 SSO Login Flow

**Test:** Open /login, click "Sign in with Microsoft", authenticate with Moyne Roberts work account

**Expected:** User is redirected to Azure AD login page, authenticates, then redirected back to dashboard at /

**Why human:** OAuth flow requires live Azure AD tenant configuration, browser redirect, and real user credentials. Cannot verify programmatically.

**Current Status:** 🛑 CANNOT TEST - "Sign in with Microsoft" button does not exist in current codebase

#### 2. Tenant Restriction Enforcement

**Test:** Attempt to sign in with personal Microsoft account (@outlook.com or @hotmail.com)

**Expected:** Login is rejected by Azure AD due to tenant-specific URL configuration in Supabase

**Why human:** Tenant restriction enforcement happens at Azure AD OAuth level. Requires real personal Microsoft account and Azure tenant configuration.

**Current Status:** 🛑 CANNOT TEST - SSO flow removed

#### 3. AD Directory Search

**Test:** Open project detail page, click "Invite Member", type colleague name in Directory search

**Expected:** Autocomplete dropdown shows matching users from company AD directory via Microsoft Graph API

**Why human:** Requires Microsoft Graph API permissions (User.Read.All), admin consent, and live SSO session with provider_token

**Current Status:** ⚠️ STUBBED - /api/users/search returns empty array

#### 4. Cross-Project RLS Isolation

**Test:** User A creates project "Alpha", User B signs in and views project list

**Expected:** User B does NOT see "Alpha" project in their list (unless User A invites them)

**Why human:** Requires two authenticated user sessions to verify multi-user isolation. Database RLS policies are correct but need runtime test.

**Current Status:** ✓ CAN TEST - RLS policies in place, requires two user accounts

### Gaps Summary

**Gap 1: M365 SSO Removed After Initial Implementation**

Success Criterion 2 states "Auth is configured so M365 SSO can be added as an additional provider without code changes." The initial implementation (commits b7fb9dc and 0a4bfcb) included full Azure AD OAuth with:
- "Sign in with Microsoft" button in login page
- signInWithOAuth({ provider: 'azure' }) flow
- OAuth callback handler
- Microsoft Graph directory search
- Dual-mode invite (Directory + Email)

Commit a0deff1 (March 19, 2026) removed all M365 SSO code with message "chore: remove Azure AD auth and directory search (email-only flow)". The commit description references "Azure workaround restructure."

**Impact:**
- Users cannot sign in with their work accounts (FOUND-01 requirement blocked)
- Tenant restriction cannot be verified (FOUND-02 uncertain)
- Directory search is non-functional (users must manually type colleague emails)
- Restoring SSO now requires code changes (contradicts Success Criterion 2's "without code changes" clause)

**What's Missing:**
1. Restore handleMicrosoftSignIn function in login page with supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email profile User.Read', redirectTo } })
2. Restore "Sign in with Microsoft" button UI in login page (with Microsoft logo SVG)
3. Restore Microsoft Graph integration in /api/users/search:
   - Get Azure provider_token from session
   - Initialize Graph client with provider_token
   - Search /users with $search on displayName and mail
   - Return matched users for autocomplete
4. Restore Command (combobox) component in InviteMemberModal for AD directory autocomplete
5. Update /api/invite to handle both AD users (with supabaseUserId) and email-only invites

**Root Cause:** The removal appears intentional (commit message says "workaround"). Plan 34-03 SUMMARY claims manual verification passed, but this was before automated verification could catch the gap. The phase goal explicitly requires M365 SSO, so this removal creates a phase-level gap.

**Recommendation:** Either (a) restore M365 SSO per original plan, or (b) revise Success Criterion 2 to remove SSO requirement. Current state does not meet stated phase goal.

---

## Verification Methodology

**Step 1:** Loaded phase context from PLAN and SUMMARY files for 34-01, 34-02, 34-03

**Step 2:** Extracted must_haves from 34-01-PLAN.md and 34-02-PLAN.md frontmatter

**Step 3:** Verified truths against Success Criteria from user prompt:
1. User can sign in with email/password and reach the app dashboard - ✓ VERIFIED
2. Auth is configured so M365 SSO can be added as an additional provider without code changes - ✗ FAILED (removed)
3. User can create a named project and invite colleagues to it - ✓ VERIFIED
4. User only sees projects they belong to -- no cross-project data leakage - ✓ VERIFIED

**Step 4:** Verified artifacts at three levels:
- Level 1 (Exists): All files present except original SSO implementation (removed)
- Level 2 (Substantive): Files contain real logic, not placeholders (except /api/users/search stub)
- Level 3 (Wired): Imports and usage verified via grep (SSO wiring removed)

**Step 5:** Verified key links:
- Middleware → /login redirect: ✓ WIRED
- Login → OAuth: ✗ NOT_WIRED (removed)
- CreateProjectModal → Supabase insert: ✓ WIRED
- InviteMemberModal → /api/invite: ✓ WIRED
- /api/invite → inviteUserByEmail: ✓ WIRED

**Step 6:** Cross-referenced requirements:
- FOUND-01, FOUND-02 (34-01): SSO removed, blocked
- PROJ-01, PROJ-02, PROJ-03, PROJ-04 (34-02): All satisfied

**Step 7:** Scanned for anti-patterns:
- Stub in /api/users/search
- Debug console.log in dashboard page
- Missing SSO despite plan requirement

**Step 8:** Identified human verification needs (OAuth flow, tenant restriction, multi-user RLS)

**Step 9:** Determined status: **gaps_found** (2/4 success criteria fully verified, 1 failed, 1 needs human)

---

_Verified: 2026-03-20T07:53:25Z_

_Verifier: Claude (gsd-verifier)_
