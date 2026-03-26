# Architecture: V6.0 Executive Dashboard & UI Revamp

**Domain:** Adding executive dashboard, 360-degree data integration, project model extension, automated status monitoring, Azure AD SSO, and full UI redesign to existing Next.js + Supabase + Vercel app
**Researched:** 2026-03-26
**Confidence:** MEDIUM-HIGH -- Supabase Azure OAuth verified via official docs; Inngest cron patterns verified via official docs; existing codebase thoroughly analyzed; Orq.ai analytics API has limited public documentation (MEDIUM confidence); Zapier has no public API for analytics (confirmed -- browser scraper is the right approach)

## Executive Summary

V6.0 adds an executive-facing layer on top of the existing pipeline-centric architecture. The core challenge is **data aggregation from three independent sources** (Agent Workforce DB, Zapier dashboard via browser scraping, Orq.ai analytics API) into unified dashboard metrics. The architecture introduces a **data aggregation layer** consisting of: (1) a `dashboard_snapshots` table storing pre-computed metrics, (2) Inngest cron functions that periodically collect and compute these metrics, and (3) server components that read from the snapshot table for fast page loads.

The project model extends the existing `projects` table with `status` and `automation_type` columns. An Inngest cron function monitors activity and transitions statuses automatically. Azure AD integrates as an OAuth social provider in Supabase Auth alongside existing email/password -- requiring no middleware changes, only a login page update and Azure AD app registration. The UI redesign works entirely through CSS variable overrides in `globals.css` and shadcn theme tokens, touching zero component internals.

## Recommended Architecture

### High-Level System Diagram

```
                    +-------------------+
                    |   Login Page      |
                    | email/pw + Azure  |
                    +--------+----------+
                             |
                    Supabase Auth (middleware.ts unchanged)
                             |
                    +--------v----------+
                    |  Dashboard Layout |
                    |  (app-sidebar.tsx) |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+ +-----v--------+
     | Executive  |  | Projects    | | Existing     |
     | Dashboard  |  | (extended)  | | Pages        |
     | (NEW page) |  | status/type | | (restyled)   |
     +--------+---+  +------+------+ +--------------+
              |              |
     +--------v--------------v----------+
     |     Data Aggregation Layer       |
     |  dashboard_snapshots table       |
     |  (pre-computed metrics)          |
     +--------+----------+---------+---+
              |          |         |
     +--------v--+ +----v----+ +--v-----------+
     | Supabase  | | Zapier  | | Orq.ai       |
     | DB queries| | Scraper | | Analytics    |
     | (direct)  | | (cron)  | | API (cron)   |
     +-----------+ +---------+ +--------------+
                     |                |
              Browserless.io    api.orq.ai/v2
              (existing)        (server-side)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `app/(dashboard)/executive/page.tsx` | Executive dashboard page with KPI cards, charts, project status grid | Reads `dashboard_snapshots`, `projects` | **NEW** server component |
| `lib/dashboard/aggregator.ts` | Computes dashboard metrics from all three sources, writes to `dashboard_snapshots` | Supabase DB, `zapier_snapshots`, `orqai_snapshots` | **NEW** lib module |
| `lib/inngest/functions/zapier-scraper.ts` | Inngest cron function: connects to Browserless.io, scrapes Zapier admin dashboard, stores metrics | Browserless.io, Supabase `zapier_snapshots` table | **NEW** Inngest cron function |
| `lib/inngest/functions/orqai-collector.ts` | Inngest cron function: calls Orq.ai analytics/traces API, stores metrics | Orq.ai REST API, Supabase `orqai_snapshots` table | **NEW** Inngest cron function |
| `lib/inngest/functions/dashboard-aggregator.ts` | Inngest cron function: reads all source tables, computes aggregated KPIs, writes `dashboard_snapshots` | Supabase DB (reads sources, writes snapshot) | **NEW** Inngest cron function |
| `lib/inngest/functions/status-monitor.ts` | Inngest cron function: checks project activity, transitions statuses (idea -> building -> testing -> live -> stale) | Supabase `projects` table, `pipeline_runs`, `zapier_snapshots` | **NEW** Inngest cron function |
| `projects` table | Extended with `status`, `automation_type`, `roi_estimate_hours`, `time_saved_hours` columns | Existing queries add new columns to SELECT | **MODIFIED** (migration) |
| `app/(auth)/login/page.tsx` | Add "Sign in with Microsoft" button alongside email/password form | Supabase Auth `signInWithOAuth({ provider: 'azure' })` | **MODIFIED** |
| `app/api/inngest/route.ts` | Register new cron functions with Inngest serve | All new Inngest functions | **MODIFIED** |
| `lib/inngest/events.ts` | Add new event types for cron triggers (optional, cron functions auto-fire) | Referenced by new functions | **MODIFIED** (minor) |
| `globals.css` | New color palette, typography scale, spacing overrides via CSS variables | All components inherit changes | **MODIFIED** |
| `components/project-card.tsx` | Add status badge, automation type indicator | Reads new project columns | **MODIFIED** |
| `components/app-sidebar.tsx` | Add "Executive Dashboard" nav item, update branding | New route link | **MODIFIED** (minor) |
| `components/dashboard/` | New chart components (KPI cards, trend lines, status grid) | Read from server component props | **NEW** components |
| `components/ui/` | No changes to shadcn internals -- all theming via CSS variables | N/A | **UNCHANGED** |

### Data Flow

#### 1. Zapier Analytics Collection (Inngest Cron -> Browserless.io -> Supabase)

```
Every 6 hours:
  Inngest cron "zapier-scraper/collect"
    |
    +-> step.run("scrape-zapier-dashboard")
    |     Connect to Browserless.io via connectOverCDP
    |     Load Zapier admin dashboard (credentials from Supabase credentials table)
    |     Extract: active zap count, task usage, error rate, last 7-day runs
    |     Screenshot the dashboard for audit
    |
    +-> step.run("store-snapshot")
          INSERT INTO zapier_snapshots (
            active_zaps, tasks_used, tasks_limit,
            error_rate_pct, zap_runs_7d, raw_data,
            screenshot_path, scraped_at
          )
```

**Why browser scraping:** Zapier has no public API for analytics or Zap history data. The admin dashboard is the only source. This pattern already exists in the codebase via Browserless.io for other no-API systems (NXT, iController). Credentials are stored in the existing `credentials` table with AES-256-GCM encryption.

**Frequency rationale:** 4 times/day (every 6 hours) balances freshness with Browserless.io costs. Executive dashboards do not need real-time Zapier data.

#### 2. Orq.ai Analytics Collection (Inngest Cron -> REST API -> Supabase)

```
Every 4 hours:
  Inngest cron "orqai-collector/collect"
    |
    +-> step.run("fetch-orqai-analytics")
    |     GET /v2/agents (list all agents, extract per-agent metadata)
    |     GET analytics/traces data (usage, cost, latency per agent)
    |     Aggregate: total cost, total tokens, avg latency, error rates
    |
    +-> step.run("store-snapshot")
          INSERT INTO orqai_snapshots (
            total_agents, total_cost_usd, total_tokens,
            avg_latency_ms, error_rate_pct,
            per_agent_metrics JSONB, collected_at
          )
```

**Confidence note (MEDIUM):** Orq.ai's analytics API documentation is sparse. The platform provides dashboard analytics (latency, token usage, error rates, costs) but the exact REST endpoints for programmatic access are not fully documented publicly. The `/v2/agents` endpoint is confirmed. For traces/analytics, Orq.ai may expose this via the Enterprise API or require custom reporting endpoints. **Phase-specific research needed** to verify exact endpoints before building. Fallback: browser-scrape the Orq.ai dashboard similar to Zapier.

#### 3. Dashboard Aggregation (Inngest Cron -> Supabase)

```
Every 2 hours (or triggered after scraper/collector completes):
  Inngest cron "dashboard/aggregate"
    |
    +-> step.run("compute-metrics")
    |     Query projects table (status distribution, types)
    |     Query pipeline_runs (success rate, avg duration, throughput)
    |     Query zapier_snapshots (latest: active zaps, tasks, errors)
    |     Query orqai_snapshots (latest: agents, cost, performance)
    |     Compute derived metrics:
    |       - ROI estimate = SUM(projects.time_saved_hours) * hourly_rate
    |       - Adoption rate = active users / total users
    |       - Health score = weighted average of error rates
    |
    +-> step.run("write-snapshot")
          UPSERT INTO dashboard_snapshots (id='latest', ...)
          Also INSERT historical row for trend charts
```

#### 4. Dashboard Page Rendering (Server Component -> Supabase)

```
User visits /executive
  |
  Next.js Server Component
    |
    +-> Parallel queries (Promise.all):
    |     SELECT * FROM dashboard_snapshots WHERE id = 'latest'
    |     SELECT id, name, status, automation_type, ... FROM projects
    |     SELECT ... FROM dashboard_snapshots ORDER BY computed_at DESC LIMIT 30
    |
    +-> Render:
          KPI cards (pre-computed values, instant load)
          Project status grid (from projects query)
          Trend charts (from historical snapshots)
```

**Why pre-computed snapshots instead of live queries:** Executive dashboards must load instantly. Aggregating across three sources on every page load would be slow and fragile (external API calls on render). The cron-based snapshot pattern gives sub-100ms page loads and decouples page rendering from external service availability.

#### 5. Project Status Monitor (Inngest Cron -> Supabase)

```
Every 1 hour:
  Inngest cron "status-monitor/check"
    |
    +-> step.run("evaluate-all-projects")
          For each project with status != 'archived':
            Query latest pipeline_run, latest zapier activity,
            latest orqai agent activity
            |
            Apply transition rules:
              idea -> building: first pipeline_run started
              building -> testing: pipeline_run completed, agents deployed
              testing -> live: agents active in Orq.ai for 7+ days
              live -> stale: no activity for 30+ days
              any -> stale: no activity for 60+ days
            |
            UPDATE projects SET status = new_status
              WHERE id = project_id AND status != new_status
            |
            Log transition in project_status_history table
```

#### 6. Azure AD SSO Flow (Supabase Auth OAuth)

```
User clicks "Sign in with Microsoft" on login page
  |
  supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid',
      redirectTo: `${origin}/auth/callback`
    }
  })
  |
  Redirects to Azure AD consent screen
  |
  Azure AD redirects to /auth/callback with code
  |
  Existing callback route exchanges code for session
  (app/(auth)/auth/callback/route.ts -- UNCHANGED)
  |
  middleware.ts validates session (UNCHANGED)
  |
  User lands on dashboard
```

**Critical: User identity linking.** Supabase Auth does NOT automatically link OAuth identities to existing email/password accounts with the same email. This means an existing user (email/password) who signs in via Azure AD will get a NEW user account. Mitigation approaches:

1. **Pre-migration (recommended):** Before enabling Azure SSO, manually link Azure identities to existing users via Supabase Admin API: `admin.auth.admin.updateUserById(existingUserId, { app_metadata: { provider: 'azure', ... } })`
2. **Post-login merge:** After Azure OAuth login, check if an email/password account exists with the same email, and prompt the user to link accounts
3. **Enforce single provider:** Once Azure SSO is live, disable email/password for migrated users

**Recommendation:** Use approach 1 (pre-migration) since there are only 5-15 users. This is a one-time manual step.

### New Database Tables

#### `zapier_snapshots`

```sql
CREATE TABLE zapier_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active_zaps     INTEGER NOT NULL DEFAULT 0,
  tasks_used      INTEGER NOT NULL DEFAULT 0,
  tasks_limit     INTEGER NOT NULL DEFAULT 0,
  error_rate_pct  DECIMAL(5,2) DEFAULT 0,
  zap_runs_7d     INTEGER DEFAULT 0,
  raw_data        JSONB,
  screenshot_path TEXT,
  scraped_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_zapier_snapshots_scraped_at ON zapier_snapshots(scraped_at DESC);
```

#### `orqai_snapshots`

```sql
CREATE TABLE orqai_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_agents      INTEGER NOT NULL DEFAULT 0,
  total_cost_usd    DECIMAL(10,4) DEFAULT 0,
  total_tokens      BIGINT DEFAULT 0,
  avg_latency_ms    INTEGER DEFAULT 0,
  error_rate_pct    DECIMAL(5,2) DEFAULT 0,
  per_agent_metrics JSONB,
  collected_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orqai_snapshots_collected_at ON orqai_snapshots(collected_at DESC);
```

#### `dashboard_snapshots`

```sql
CREATE TABLE dashboard_snapshots (
  id                    TEXT PRIMARY KEY,  -- 'latest' for current, UUID for history
  -- Project metrics
  total_projects        INTEGER DEFAULT 0,
  projects_by_status    JSONB,  -- {"idea": 2, "building": 3, "live": 5}
  projects_by_type      JSONB,  -- {"zapier-only": 4, "hybrid": 2, "orqai-agent": 3}
  -- Pipeline metrics
  total_runs            INTEGER DEFAULT 0,
  runs_this_week        INTEGER DEFAULT 0,
  success_rate_pct      DECIMAL(5,2) DEFAULT 0,
  avg_run_duration_s    INTEGER DEFAULT 0,
  -- Zapier metrics (from latest zapier_snapshot)
  zapier_active_zaps    INTEGER DEFAULT 0,
  zapier_tasks_used     INTEGER DEFAULT 0,
  zapier_error_rate_pct DECIMAL(5,2) DEFAULT 0,
  -- Orq.ai metrics (from latest orqai_snapshot)
  orqai_total_agents    INTEGER DEFAULT 0,
  orqai_total_cost_usd  DECIMAL(10,4) DEFAULT 0,
  orqai_avg_latency_ms  INTEGER DEFAULT 0,
  orqai_error_rate_pct  DECIMAL(5,2) DEFAULT 0,
  -- Derived metrics
  roi_estimate_eur      DECIMAL(10,2) DEFAULT 0,
  total_time_saved_hrs  DECIMAL(10,2) DEFAULT 0,
  health_score_pct      DECIMAL(5,2) DEFAULT 0,
  adoption_score_pct    DECIMAL(5,2) DEFAULT 0,
  -- Meta
  computed_at           TIMESTAMPTZ DEFAULT now()
);
```

#### `project_status_history`

```sql
CREATE TABLE project_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  old_status  TEXT NOT NULL,
  new_status  TEXT NOT NULL,
  reason      TEXT,
  changed_by  TEXT DEFAULT 'status-monitor',  -- 'status-monitor' or user_id
  changed_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_status_history_project ON project_status_history(project_id, changed_at DESC);
```

### Project Table Extension

```sql
-- Add new columns to existing projects table
ALTER TABLE projects
  ADD COLUMN status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'building', 'testing', 'live', 'stale', 'archived')),
  ADD COLUMN automation_type TEXT DEFAULT 'unknown'
    CHECK (automation_type IN ('zapier-only', 'hybrid', 'standalone-app', 'orqai-agent', 'unknown')),
  ADD COLUMN roi_estimate_hours DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN time_saved_hours DECIMAL(10,2) DEFAULT 0;

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_automation_type ON projects(automation_type);
```

**RLS impact:** The existing RLS policy on `projects` uses `project_members.user_id = auth.uid()` for access control. Adding columns does NOT break existing RLS policies -- they continue to work because RLS policies filter rows, not columns. The new columns are visible to all users who can already see the project row.

**Existing query impact:** Current queries like `supabase.from("projects").select("*, project_members(user_id)")` will automatically include the new columns. No query changes needed for existing pages. The `ProjectCard` component will need a minor update to display status badges, but this is additive, not breaking.

## Patterns to Follow

### Pattern 1: Pre-computed Snapshot for Dashboard Metrics
**What:** Cron functions collect data from external sources and compute aggregated metrics into a snapshot table. Dashboard pages read only from the snapshot table.
**When:** Any dashboard that aggregates data from multiple sources where freshness requirements are measured in hours, not seconds.
**Why:** Decouples page rendering from external service availability. Sub-100ms page loads. External failures degrade data freshness, not page functionality.
**Example:**
```typescript
// lib/inngest/functions/dashboard-aggregator.ts
export const aggregateDashboard = inngest.createFunction(
  { id: "dashboard/aggregate" },
  { cron: "0 */2 * * *" },  // Every 2 hours
  async ({ step }) => {
    const metrics = await step.run("compute-metrics", async () => {
      const admin = createAdminClient();

      const [projects, runs, zapier, orqai] = await Promise.all([
        admin.from("projects").select("status, automation_type, roi_estimate_hours, time_saved_hours"),
        admin.from("pipeline_runs").select("status, created_at, completed_at, started_at"),
        admin.from("zapier_snapshots").select("*").order("scraped_at", { ascending: false }).limit(1).single(),
        admin.from("orqai_snapshots").select("*").order("collected_at", { ascending: false }).limit(1).single(),
      ]);

      // Compute aggregated metrics...
      return computeMetrics(projects.data, runs.data, zapier.data, orqai.data);
    });

    await step.run("write-snapshot", async () => {
      const admin = createAdminClient();
      // Upsert 'latest' for current dashboard
      await admin.from("dashboard_snapshots").upsert(
        { id: "latest", ...metrics, computed_at: new Date().toISOString() },
        { onConflict: "id" }
      );
      // Also insert historical row for trend charts
      await admin.from("dashboard_snapshots").insert(
        { id: crypto.randomUUID(), ...metrics, computed_at: new Date().toISOString() }
      );
    });
  }
);
```

### Pattern 2: Browserless.io Scraper as Inngest Cron
**What:** Scheduled function connects to Browserless.io, navigates authenticated web pages, extracts structured data.
**When:** External service has no API but has a web dashboard with the data you need.
**Why:** Zapier has no analytics API. Browser scraping is the only viable approach. Inngest provides retries, logging, and scheduling. Browserless.io is already in the stack.
**Example:**
```typescript
// lib/inngest/functions/zapier-scraper.ts
export const scrapeZapier = inngest.createFunction(
  { id: "zapier-scraper/collect", retries: 2 },
  { cron: "0 */6 * * *" },  // Every 6 hours
  async ({ step }) => {
    const data = await step.run("scrape-dashboard", async () => {
      const { chromium } = await import("playwright-core");
      const admin = createAdminClient();

      // Load Zapier credentials from credentials table
      const creds = await loadCredential(admin, "zapier-admin");

      const browser = await chromium.connectOverCDP(
        `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`,
        { timeout: 30_000 }
      );

      try {
        const context = browser.contexts()[0] || await browser.newContext();
        // Load saved session state if available
        // Navigate, authenticate, extract metrics
        // ... (see browserless-patterns.md for session reuse)
        const page = await context.newPage();
        // Scrape logic here
      } finally {
        await browser.close();
      }
    });
  }
);
```

### Pattern 3: Azure OAuth Alongside Email/Password
**What:** Add `signInWithOAuth` for Azure as an additional login method without removing email/password.
**When:** Adding SSO to an existing app with email/password users.
**Why:** Supabase supports multiple auth providers simultaneously. Azure OAuth is a "social login" provider -- it coexists with email/password with zero middleware changes.
**Example:**
```typescript
// In login page -- add alongside existing email/password form
async function handleAzureSignIn() {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email profile openid",
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) setFormError(error.message);
}
```

### Pattern 4: CSS Variable Theme Override (Non-Breaking Redesign)
**What:** Override shadcn CSS variables in `globals.css` :root and .dark blocks to change colors, spacing, and typography across all components simultaneously.
**When:** Full visual redesign without touching component source code.
**Why:** shadcn/ui components reference semantic CSS variables (`--primary`, `--background`, etc.). Changing these variables propagates to every component automatically. Zero risk of breaking existing functionality.
**Example:**
```css
/* globals.css -- executive theme override */
:root {
  /* Replace neutral grays with branded palette */
  --primary: oklch(0.55 0.15 250);        /* Brand blue */
  --primary-foreground: oklch(0.98 0 0);
  --accent: oklch(0.92 0.03 250);          /* Subtle brand tint */

  /* Executive-grade typography */
  --radius: 0.5rem;                        /* Slightly sharper corners */

  /* Chart colors for dashboard */
  --chart-1: oklch(0.65 0.18 145);         /* Success green */
  --chart-2: oklch(0.60 0.20 250);         /* Primary blue */
  --chart-3: oklch(0.70 0.15 50);          /* Warning amber */
  --chart-4: oklch(0.55 0.20 25);          /* Error red */
  --chart-5: oklch(0.50 0.10 280);         /* Info purple */
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Live-Querying External APIs on Page Render
**What:** Calling Orq.ai API or scraping Zapier every time the dashboard loads.
**Why bad:** Page load times become unpredictable (500ms-5s+). External service downtime breaks the dashboard. Rate limiting on external APIs.
**Instead:** Pre-computed snapshots via Inngest cron. Dashboard reads only from Supabase.

### Anti-Pattern 2: Forking shadcn Components for Visual Changes
**What:** Copying shadcn `button.tsx`, `card.tsx` etc. and modifying styles directly.
**Why bad:** Loses ability to update shadcn components. Creates maintenance burden. Theme changes require touching every forked component.
**Instead:** Use CSS variables and Tailwind utility classes. If a component needs structural changes, extend it (wrapper component), do not fork it.

### Anti-Pattern 3: Separate Auth System for Azure AD
**What:** Building custom Azure OIDC flow, token handling, or using next-auth alongside Supabase Auth.
**Why bad:** Two auth systems means double session management, split user tables, and middleware conflicts.
**Instead:** Use Supabase Auth's built-in Azure OAuth provider. It uses the same session cookies, same middleware, same `auth.getUser()` call.

### Anti-Pattern 4: Single Monolithic Aggregator Function
**What:** One Inngest function that scrapes Zapier, calls Orq.ai, queries Supabase DB, and computes all metrics.
**Why bad:** If Zapier scraping fails, Orq.ai data is also lost. Retry would re-run everything. Debugging is harder.
**Instead:** Separate Inngest functions for each data source (zapier-scraper, orqai-collector, dashboard-aggregator). Aggregator runs after collectors and reads from Supabase tables.

### Anti-Pattern 5: Automatic Status Transitions Without History
**What:** Updating project status without logging what changed and why.
**Why bad:** Executives will ask "why did this project change to stale?" No audit trail means no answers.
**Instead:** Always write to `project_status_history` before updating the project status. Include the reason for the transition.

## New vs Modified Components Summary

### NEW Components (14)

| Component | Type | Dependencies |
|-----------|------|-------------|
| `app/(dashboard)/executive/page.tsx` | Page | dashboard_snapshots, projects |
| `components/dashboard/kpi-card.tsx` | UI | shadcn Card |
| `components/dashboard/status-grid.tsx` | UI | projects data |
| `components/dashboard/trend-chart.tsx` | UI | recharts (new dep) |
| `components/dashboard/source-status.tsx` | UI | zapier/orqai snapshot freshness |
| `lib/dashboard/aggregator.ts` | Lib | Supabase admin client |
| `lib/dashboard/metrics.ts` | Lib | Type definitions for metrics |
| `lib/inngest/functions/zapier-scraper.ts` | Inngest | Browserless.io, credentials |
| `lib/inngest/functions/orqai-collector.ts` | Inngest | Orq.ai API |
| `lib/inngest/functions/dashboard-aggregator.ts` | Inngest | Supabase queries |
| `lib/inngest/functions/status-monitor.ts` | Inngest | Supabase projects + runs |
| `zapier_snapshots` table | DB | -- |
| `orqai_snapshots` table | DB | -- |
| `dashboard_snapshots` table | DB | -- |
| `project_status_history` table | DB | projects |

### MODIFIED Components (7)

| Component | Change | Risk |
|-----------|--------|------|
| `projects` table | Add status, automation_type, roi/time columns | LOW -- additive columns, RLS unchanged |
| `app/(auth)/login/page.tsx` | Add Azure OAuth button | LOW -- additive, email/pw unchanged |
| `app/api/inngest/route.ts` | Register 4 new functions | LOW -- additive array push |
| `components/app-sidebar.tsx` | Add Executive Dashboard nav item | LOW -- additive nav item |
| `components/project-card.tsx` | Display status badge, type indicator | LOW -- additive rendering |
| `globals.css` | New color palette, typography, chart colors | MEDIUM -- visual change across all pages |
| `app/(dashboard)/page.tsx` | Live stats from dashboard_snapshots | MEDIUM -- replaces hardcoded "0" values |

### UNCHANGED Components

All existing pipeline functionality, Inngest pipeline function, approval flow, chat panel, graph visualization, credential management, health checks, broadcast system, middleware, auth callback route, terminal panel -- all remain completely unchanged.

## Suggested Build Order

Based on dependency analysis:

```
Phase 1: Foundation (no external dependencies)
  1. Project model extension (migration + RLS)
  2. CSS variable redesign (globals.css)
  3. Project card status badges

Phase 2: Data Collection Infrastructure
  4. New DB tables (zapier_snapshots, orqai_snapshots, dashboard_snapshots, project_status_history)
  5. Zapier browser scraper (Inngest cron + Browserless.io)
  6. Orq.ai analytics collector (Inngest cron + REST API)

Phase 3: Dashboard
  7. Dashboard aggregator (Inngest cron)
  8. Executive dashboard page + components
  9. Status monitor (Inngest cron)

Phase 4: Auth
  10. Azure AD app registration (Azure portal)
  11. Supabase Azure provider configuration
  12. Login page Microsoft button
  13. User identity pre-migration

Phase 5: Polish
  14. Dashboard page real stats (replace hardcoded values on home page)
  15. Full UI redesign pass (all pages)
```

**Rationale:** Project model extension comes first because status badges are needed by both the dashboard and the existing project list. Data collection infra comes before the dashboard because the dashboard needs data to display. Auth is independent and can be done in parallel with Phase 2-3 but is placed later because Azure AD tenant setup may have organizational dependencies. The UI redesign is last because it is purely visual and can be refined iteratively.

## Scalability Considerations

| Concern | At 5-15 users (current) | At 50 users | At 200+ users |
|---------|------------------------|-------------|---------------|
| Dashboard load time | Sub-100ms (snapshot read) | Same (snapshot pattern) | Same |
| Snapshot storage | 4 rows/day, negligible | Same | Same |
| Zapier scraping | 4x/day, ~$0.05/month | Same (1 account) | Same (1 account) |
| Orq.ai API calls | 6x/day, within free tier | Same (1 workspace) | Same (1 workspace) |
| Browserless.io usage | ~2min/day sessions | Same | Same |
| Status monitor | 1 query/hour, < 50 projects | Fast | Add pagination at 500+ projects |

No scalability concerns at the target user range. The cron-based architecture scales by adjusting frequency, not by adding infrastructure.

## Sources

- [Supabase Azure OAuth Login](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- Official docs for Azure provider setup
- [Supabase Auth signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth) -- JavaScript API reference
- [Supabase SAML SSO for Projects](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml) -- Enterprise SSO (SAML alternative)
- [Inngest Cron/Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions) -- Official cron syntax and patterns
- [Inngest createFunction Reference](https://www.inngest.com/docs/reference/functions/create) -- Function creation API
- [Inngest Vercel Integration](https://www.inngest.com/docs/deploy/vercel) -- Auto-sync and env setup
- [Orq.ai Analytics Docs](https://docs.orq.ai/docs/analytics) -- Dashboard metrics (latency, token usage, error rates, costs)
- [Orq.ai Agent API](https://docs.orq.ai/docs/agents/agent-api) -- v2 agents endpoint
- [Orq.ai Traces](https://docs.orq.ai/docs/traces) -- Execution traces and observability
- [Zapier Zap History](https://help.zapier.com/hc/en-us/articles/8496291148685-View-and-manage-your-Zap-history) -- No API available, UI only
- [Zapier Admin Center](https://help.zapier.com/hc/en-us/articles/38925392216973-Review-your-account-in-the-admin-center) -- Dashboard metrics (UI only)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming) -- CSS variable approach
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) -- Current OKLCH color system
- [Next.js Data Fetching Patterns](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns) -- Parallel fetching in server components
