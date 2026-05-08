# Phase 48: Foundation - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — decisions derived from milestone discussion + research)

<domain>
## Phase Boundary

Establish the V7 design system (fonts, glassmorphism tokens, dark/light theme), create the 4 new Supabase tables (agent_events, swarm_jobs, swarm_agents, swarm_briefings), and configure Azure AD OAuth SSO with automatic identity linking. After this phase, all V7 visual and data-driven features can build on a stable foundation without breaking existing V6 pages.

</domain>

<decisions>
## Implementation Decisions

### Design System
- Use Satoshi Variable (body) and Cabinet Grotesk Variable (headings) loaded via `next/font/local` — self-hosted woff2 from Fontshare (free commercial license)
- Parallel CSS namespace: all V7 tokens use `--v7-*` prefix, existing shadcn `--` tokens remain untouched
- Glassmorphism tokens: `--v7-glass-bg`, `--v7-glass-border`, `--v7-glass-blur` with dark/light variants
- Color palette from HTML design: teal (#3ac7c9), blue (#69a8ff), lime (#8ad05e), amber (#ffb547), pink (#ff78cf), red (#ff6b7a) for dark mode
- Use `next-themes` with `attribute="data-theme"` (not class-based) to prevent hydration mismatch
- Design reference: `docs/designs/agent-dashboard-v2.html` — follow color system, spacing, border-radius patterns exactly

### Azure AD SSO
- Use Supabase Auth Azure OAuth provider (NOT SAML) for automatic identity linking
- Already configured in Supabase Dashboard (done during this session: client ID, secret, tenant URL set)
- Single-tenant URL: `https://login.microsoftonline.com/771b9422-2016-420b-8ad2-4a6424a231b2`
- Add "Sign in with Microsoft" button to login page
- Post-login check: users without `project_members` rows redirect to "access pending" page
- Env vars already in Vercel: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`

### Database Schema
- Create `agent_events` table with Realtime publication enabled (`REPLICA IDENTITY FULL`)
- Create `swarm_jobs` table for Kanban state
- Create `swarm_agents` table for agent registry per swarm
- Create `swarm_briefings` table for cached AI narratives
- All tables linked to `projects` table via `swarm_id` (FK to projects.id)
- RLS policies: authenticated users can read all, write restricted to service role

### Claude's Discretion
- Exact Tailwind config for glassmorphism utility classes
- Component structure for theme toggle (shadcn DropdownMenu vs custom)
- Migration file organization (single file vs per-table)
- Whether to add V7 tokens to existing `globals.css` or create a separate `v7-tokens.css`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/app/layout.tsx` — root layout with Geist fonts (will be swapped to Satoshi/Cabinet Grotesk)
- `web/app/globals.css` — existing oklch color tokens, Tailwind config
- `web/app/(dashboard)/layout.tsx` — dashboard layout with sidebar
- `web/components/app-sidebar.tsx` — existing sidebar component
- `web/lib/supabase/admin.ts` — admin client for service role operations
- `web/app/auth/callback/route.ts` — existing OAuth callback handler

### Established Patterns
- CSS variables in `globals.css` with oklch color space
- Supabase Auth middleware in `middleware.ts`
- Server Components for data, Client Components for interactivity
- shadcn/ui component library with Tailwind CSS

### Integration Points
- `layout.tsx` — font loading and theme provider
- `globals.css` — V7 token namespace addition
- `middleware.ts` — Azure OAuth redirect handling
- Login page — "Sign in with Microsoft" button addition
- Supabase Dashboard — Azure provider already configured

</code_context>

<specifics>
## Specific Ideas

- HTML design uses CSS custom properties with `[data-theme="dark"]` selector — match this pattern exactly
- Design uses `border-radius: 22px` (--radius) and `14px` (--radius-sm) — follow these values
- Glassmorphism: `backdrop-filter: blur(18px)` with `rgba` backgrounds at low opacity
- Brand mark gradient: `linear-gradient(135deg, var(--teal), var(--blue))`

</specifics>

<deferred>
## Deferred Ideas

- Font weight optimization (only load needed weights) — verify during implementation
- Custom 404/500 pages with V7 styling — defer to Phase 54 (Polish)

</deferred>
