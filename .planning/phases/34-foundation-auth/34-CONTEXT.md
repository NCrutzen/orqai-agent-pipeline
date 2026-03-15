# Phase 34: Foundation & Auth - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Next.js app shell with Supabase DB, M365 SSO authentication with tenant restriction, email/password for external users, and project CRUD with colleague access. Users can securely sign in and organize pipeline work into projects. Pipeline execution, dashboard, and HITL approval are separate phases.

</domain>

<decisions>
## Implementation Decisions

### App shell & navigation
- Fixed left sidebar with nav items (Dashboard, Projects, Runs, Settings, Profile)
- Sidebar is collapsible to icons-only mode for more content space
- Clean minimal visual style — white/light background, subtle borders, Tailwind defaults
- No corporate branding — generic professional app appearance
- Greenfield Next.js app — no existing web code to integrate with

### Auth flow
- Login page shows both "Sign in with Microsoft" SSO button AND email/password fields
- M365 SSO for Moyne Roberts internal users (Azure AD tenant restriction)
- Email/password for external users not in the AD directory
- External users are invite-only — must be invited to a project before they can sign up
- Unauthorized users see friendly error: "You don't have access to this app. Contact your project admin to get invited."
- No onboarding flow — users land straight on the dashboard after sign-in
- Must test that personal Microsoft accounts are rejected (noted blocker from STATE.md)

### Project management
- Inline quick-create via modal: name field + optional description, no page navigation
- Invite flow: autocomplete search from Azure AD directory for internal users + manual email entry for external users
- External users get full access within projects they're invited to (same capabilities as internal users)
- Project list page with search/filter as the primary project switcher (must scale to 100+ projects)

### Dashboard landing
- Home page IS the project list — shows all projects with search/filter
- Plus an activity overview section with aggregate stats: total runs this week, success rate, pending approvals count
- Each project card shows: name, member count, last activity timestamp, latest run status
- Empty state for new users: centered "Create your first project to get started" with prominent Create Project button

### Claude's Discretion
- Exact sidebar width and collapse animation
- Spacing, typography, and color palette details
- Database schema design and RLS policies
- Session management implementation
- Loading states and error handling patterns

</decisions>

<specifics>
## Specific Ideas

- Project list must handle 100+ projects — search/filter is critical, not optional
- External user support is a first-class feature, not an afterthought — invite flow must handle both AD and non-AD users cleanly

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield Next.js app. Existing repo contains only markdown-based Claude Code skills (orq-agent/)

### Established Patterns
- Existing pipeline logic lives in orq-agent/ as markdown instruction files
- Pipeline prompts will be shared between Claude Code skill and web app (GitHub repo as single source of truth)

### Integration Points
- Supabase for auth (M365 SSO + email/password), database, and realtime (future phases)
- Vercel for hosting (frontend + API routes)
- Azure AD for tenant restriction and user directory autocomplete
- Orq.ai API for pipeline execution (Phase 35+)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-foundation-auth*
*Context gathered: 2026-03-15*
