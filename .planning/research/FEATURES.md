# Feature Landscape: V6.0 Executive Dashboard & UI Revamp

**Domain:** Executive automation management dashboard with 360-degree data integration, project lifecycle tracking, visual redesign, and O365 SSO
**Researched:** 2026-03-26
**Confidence:** MEDIUM-HIGH -- Feature requirements from PROJECT.md. ROI calculation patterns verified against UiPath Insights and Automation Anywhere. Dashboard design patterns verified against 2026 SaaS research. Supabase Azure OAuth verified via official docs. Orq.ai analytics API availability LOW confidence (programmatic access not confirmed). Zapier analytics scraper approach MEDIUM confidence (no API, scraper required).

---

## Context: What This Research Covers

This research answers: **what features does V6.0 need so that Moyne Roberts executives (CEO, CTO, CFO) can see ROI, activity, and health metrics across all automation types through a polished, professional dashboard?**

The app currently serves pipeline builders (non-technical colleagues creating agent swarms). V6.0 adds a second audience: executives who want to understand the business impact of automations. They do not create agents -- they monitor value creation.

Key constraints:
- 5-15 users total (3-5 executives, rest are pipeline users)
- Existing email/password auth + need O365 SSO for Microsoft 365 login
- Three data sources: Agent Workforce DB (direct), Zapier dashboard (browser scraper), Orq.ai analytics (API or scraper)
- Zapier has NO analytics API -- browser automation scraper required
- Orq.ai analytics API availability uncertain -- verify before committing to approach
- Must not disrupt existing pipeline, conversational chat, HITL approval, credential vault, or systems registry functionality

---

## Table Stakes

Features users expect. Missing = product feels incomplete for a management dashboard.

| Feature | Why Expected | Complexity | Depends On | Notes |
|---------|--------------|------------|------------|-------|
| **Project status lifecycle** (idea/building/testing/live/paused) | Every project management tool has status tracking. Without it, the dashboard has nothing to aggregate. | Low | Extended `projects` table | Add `status` column + `automation_type` enum. Simple DB migration. Foundation for everything else. |
| **KPI summary cards with real data** | The existing dashboard has placeholder cards showing "0" and "--" for Runs This Week, Success Rate, Pending Approvals. Users expect real numbers. | Low | Existing `pipeline_runs` table | Replace hardcoded values with Supabase aggregation queries. Quick win. |
| **Run success/failure metrics** (total runs, success %, failure %, avg duration) | UiPath Orchestrator, Automation Anywhere Bot Insights, and Zapier's dashboard all show successful run rates. Industry standard. | Low | Existing `pipeline_runs` table | Data already exists. Needs aggregation queries + display. |
| **Time-range filtering** (7d, 30d, 90d, custom) | Zapier analytics offers 7d, billing cycle, calendar month, and custom range. Every dashboard tool does this. Without filtering, data is noise. | Low | All metric queries | Single date range filter component propagating to all metric cards and charts. |
| **Activity timeline** (recent pipeline runs, approvals, project changes) | Management needs to see "what happened recently" at a glance. This is the heartbeat of the dashboard. | Medium | Existing tables | Aggregate recent events from `pipeline_runs`, `pipeline_steps`, project updates into a chronological feed. |
| **Per-project status and type display** | The existing project detail page needs status badge, automation type indicator, and health signal. Users expect to know a project's state at a glance. | Low | Extended `projects` table | Extend existing ProjectCard and project detail page. Not a rebuild. |
| **Visual redesign: typography, spacing, color palette** | Current UI is developer-focused (basic shadcn defaults). C-suite users expect polish: consistent spacing, professional typography hierarchy, refined color palette. | Medium | Nothing -- pure CSS/Tailwind | Tailwind v4 + shadcn v4 theming. No new dependencies needed. |
| **Visual redesign: navigation restructure** | Current sidebar: Dashboard, Projects, Creations, Settings. Need to add management/analytics section for the executive dashboard. | Low | Nothing | Add "Analytics" nav group to existing AppSidebar. |
| **O365 SSO login button** | Moyne Roberts runs on Microsoft 365. Every internal tool supports M365 login. Email/password login feels dated. | Medium | Azure AD tenant setup in Azure Portal, Supabase OAuth provider config | Supabase has built-in Azure OAuth via `signInWithOAuth({ provider: 'azure' })`. Main effort is Azure portal config (IT admin) + login page UI update. |
| **Dual auth support** (email/password + O365 SSO side by side) | Must keep email/password for non-M365 accounts (contractors, service accounts). Both methods on same login page. | Low | O365 SSO feature | Supabase handles coexisting providers natively. Add "Sign in with Microsoft" button alongside existing email/password form. |
| **Cost tracking** | "How much are we spending on AI?" is a day-one CFO question. Even approximate numbers demonstrate cost awareness. | Medium | Orq.ai usage data (scraped or API) + known Zapier plan costs | Orq.ai tracks per-call costs. Zapier plan cost is a known fixed amount. Show as total monthly cost card. |
| **Dark mode** | 2026 SaaS standard. Power users expect it. Executives presenting on projectors may prefer light mode. Toggle in settings. | Low | Tailwind v4 dark mode, shadcn theming | shadcn/ui already supports dark mode via CSS variables. Ensure all new components use semantic color tokens. |

## Differentiators

Features that set the product apart. Not expected, but create the "wow" factor for CEO/CTO/CFO.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| **ROI & time saved estimates** | THE killer feature for executive buy-in. Shows business value in hours saved and euros. Industry standard formula (UiPath): `TIME_SAVED = (executions * manual_minutes) - (executions * automated_minutes)`. `MONEY_SAVED = TIME_SAVED * hourly_cost`. | Medium | Per-project manual time estimate (user-entered), run count from pipeline data | User enters "manual time per task" and "hourly cost" per project. System calculates from run data. Always labeled "estimated." NOT automatic -- requires user input for manual baseline. |
| **360-degree data integration** (Agent Workforce + Zapier + Orq.ai in one view) | Single pane of glass across all automation types. No other tool at MR combines these three data sources. Unique organizational visibility. | High | Zapier browser scraper, Orq.ai analytics API/scraper, internal pipeline data | Three data sources, three collection mechanisms. The integration layer normalizes everything into a unified view. |
| **Zapier analytics integration** (active zaps, task usage, success rates, error rates) | Zapier has no analytics API. Browser scraper gives data nobody else at MR can aggregate programmatically. Shows zap count, task consumption, error rates. | High | Browserless.io scraper on Inngest cron schedule, `zapier_snapshots` table | Most technically complex feature. Scraper authenticates to Zapier, navigates analytics dashboard, extracts KPIs. Multiple snapshots/day for trend data. |
| **Orq.ai analytics integration** (agent usage, cost, latency, token consumption) | Shows operational cost and performance of deployed AI agents. CFO cares about cost; CTO cares about latency and error rates. | Medium | Orq.ai analytics API (if available) or scraper fallback | Orq.ai tracks latency, token usage, error rates, costs. Verify REST API access first. Scraper fallback reuses Zapier scraper pattern. |
| **Automated project status monitoring** | Projects auto-transition between statuses based on real signals. "idea" on creation, "building" when pipeline runs, "testing" during experiments, "live" when agents active, "degraded" when errors spike. Human override always available. | Medium | Status lifecycle, health signals from all data sources | Inngest cron function (every 15 min) checks signals and applies state machine transitions. Status changes logged for audit trail. |
| **Health/reliability indicators per project** | Traffic light indicator (green/yellow/red) per project. At a glance: "are our automations healthy?" Executives scan for red indicators. | Medium | Run data aggregation, threshold config | Green: >90% success + ran in last 24h. Yellow: 70-90% OR no run in 48h. Red: <70% OR no run in 7d. Configurable thresholds. |
| **Trend charts** (runs over time, success rate over time, ROI accumulation) | Line/area charts showing improvement over time. Executives love upward-trending lines. Shows the story: "automation is working and growing." | Medium | Time-series aggregation from `pipeline_runs`, `zapier_snapshots`, `orq_snapshots` | shadcn/ui charts (Recharts v3). Area charts for volume, line for success rate, cumulative area for ROI. |
| **Automation type classification** (zapier-only, hybrid, standalone-app, orqai-agent) | Executives want distribution overview: "what kinds of automations do we have?" Pie chart showing type breakdown across projects. | Low | Extended `projects` table | Add `automation_type` enum. User selects during project creation or edits later. |

## Anti-Features

Features to explicitly NOT build. These are tempting but wrong for V6.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic ROI calculation without user input** | Cannot algorithmically determine "how long this task took manually." Every platform (UiPath, Automation Anywhere, Zapier) requires user-entered manual baseline. Estimating erodes trust. | Require user to enter `manual_minutes_per_task` and `hourly_cost_eur` per project. Label ROI as "estimated" with clear methodology tooltip. |
| **Real-time Zapier data via API** | Zapier has no public analytics API. API v2 covers zap CRUD, not analytics. Reverse-engineering internal API is fragile and potentially against ToS. | Browser automation scraper on schedule. Accept 4-hour data staleness. |
| **Custom dashboard builder** (drag-and-drop widget arrangement) | Massive engineering effort for 5-15 users. ROI of customizable layout for 15 people is negative. | Fixed, well-designed layout. One executive dashboard with curated metrics. Layout changes via code. |
| **Real-time streaming dashboard** (WebSocket-driven live updates) | Executive dashboards are not operations centers. Nobody watches a management dashboard in real-time. Adds complexity for zero value. | Server-rendered dashboard with `revalidate` or client-side polling every 5 minutes. |
| **Multi-tenant / multi-organization support** | Only Moyne Roberts uses this. Multi-tenancy adds auth complexity, data isolation, and schema overhead for zero users. | Single-tenant. All data belongs to one organization. |
| **PDF/email report generation** | Tempting for executives, but premature. Build the dashboard first. Reports can be added if explicitly requested. | Print-friendly CSS for the dashboard page. Browser print or screenshot for sharing. |
| **Zapier Zap creation/management from dashboard** | Out of scope. Zapier has its own UI. Our dashboard aggregates analytics only. | Display Zapier analytics data. Deep-link to Zapier for management actions. |
| **Custom alerting / notification rules** | Complex feature (threshold config, delivery channels, snooze logic). Health indicators + existing credential failure notifications cover critical path. | Traffic light health indicators visible on dashboard. Existing email notifications for credential failures. |
| **SAML SSO / Enterprise SSO** | Supabase OAuth with Azure provider is simpler, free-tier compatible, and sufficient for single-tenant M365 integration. SAML requires Supabase Pro plan and more config. | Use OAuth. Switch to SAML only if OAuth cannot meet tenant restrictions (unlikely for single-tenant). |
| **Role-based dashboard views** (different views for CEO vs CTO vs engineer) | Over-engineering for 15 users. One dashboard, one view. Same metrics matter to everyone at this scale. | Single executive dashboard. All authenticated users see the same data. |
| **AI-generated insights** ("Your ROI is up 23% because...") | Unreliable. Executives will not trust AI-generated business analysis at current state. Risk of hallucinated explanations damaging credibility. | Show data clearly with trend indicators. Let executives draw conclusions. |
| **Historical data backfill** | Scraper data starts from when scraping begins. Reconstructing past metrics from partial data is unreliable. | Show "data available since [start date]" on charts. Start scraping in the first phase to accumulate data early. |

## Feature Dependencies

```
Extended Project Model ─────→ Status Lifecycle
     │                              │
     ├─→ Automation Type Enum       ├─→ Automated Status Monitoring (cron)
     │                              ├─→ Health Indicators (derived)
     └─→ ROI Fields (manual_mins,   └─→ KPI Summary Cards (aggregation)
         hourly_cost)
              │
              └─→ ROI Calculation ──→ ROI Dashboard Cards ──→ Trend Charts

O365 SSO (Azure OAuth) ─────→ Login Page Update ──→ Dual Auth Support
  (independent of dashboard features)

Visual Redesign (theme) ─────→ Applied to All Pages
  (independent, can be done first or last)

Charts Library (shadcn chart) ──→ All Trend Charts + ROI + Status Distribution
  (install once, use everywhere)

Zapier Browser Scraper ──────→ zapier_snapshots table ──→ 360-degree Dashboard
  │                                                         │
  └─→ Depends on: Browserless.io credential (V4.0 setup)   └─→ Zapier cost data

Orq.ai Analytics ────────────→ orq_snapshots table ──→ 360-degree Dashboard
  │                                                       │
  └─→ Depends on: Verify API access first                └─→ Orq.ai cost data

Internal Pipeline Data ──────→ Already in pipeline_runs ──→ 360-degree Dashboard
  (no new collection needed)
```

**Critical path:** Extended Project Model must come first -- everything depends on it. Zapier scraper has the longest lead time and highest risk, start early. Charts library is a one-time install needed before any visualization work.

## MVP Recommendation

### Phase 1: Foundation (data model + quick wins)

1. **Extended project model** -- Add `status`, `automation_type`, `manual_minutes_per_task`, `hourly_cost_eur` to `projects` table. 10-minute migration, but everything depends on it.
2. **KPI summary cards with real data** -- Replace hardcoded "0"/"--" on existing dashboard with actual aggregation queries from `pipeline_runs`.
3. **Project status lifecycle UI** -- Status badges on project cards. Manual status changes via dropdown. Foundation for automated transitions later.
4. **Charts library** -- `npx shadcn add chart` to install Recharts v3 integration. One-time setup.

### Phase 2: Executive Dashboard + ROI

5. **Executive dashboard page** -- New `/analytics` route: project status distribution (donut chart), run volume over time (area chart), success rate trend (line chart), ROI summary cards.
6. **ROI calculation engine** -- User enters manual baseline per project. System calculates cumulative time saved and money saved.
7. **Health indicators** -- Traffic light per project based on recent run success rate + recency.
8. **Navigation restructure** -- Add "Analytics" section to sidebar.

### Phase 3: Data Integration (Zapier + Orq.ai scrapers)

9. **Zapier browser scraper** -- Browserless.io cron job scraping Zapier analytics dashboard. Stores in `zapier_snapshots`.
10. **Orq.ai analytics integration** -- API first, scraper fallback. Stores in `orq_snapshots`.
11. **360-degree unified view** -- Combine all three sources in executive dashboard. "Total automations" = Zapier zaps + Agent Workforce projects.

### Phase 4: Auth, Polish, Automation

12. **O365 SSO** -- Azure AD OAuth provider in Supabase. "Sign in with Microsoft" button alongside email/password.
13. **Visual redesign** -- Typography scale, color palette, spacing system, card styles across all pages.
14. **Automated status monitoring** -- Inngest cron for automatic status transitions.
15. **Dark mode** -- Ensure all components respect shadcn theme tokens. Add theme toggle.
16. **Activity timeline** -- Recent events feed on dashboard.

### Defer to V7.0+

- PDF report generation
- Custom alerting / notification rules
- Dashboard widget customization
- SAML SSO (if OAuth insufficient)
- Historical ROI comparisons (QoQ)
- Agent performance leaderboard
- Cross-source correlation views

## Detailed Feature Specifications

### ROI & Time Saved Calculation

**Industry standard approach** (verified against UiPath Insights, Automation Anywhere Bot Insights, Zapier ROI calculator):

```
Per project, user provides:
  - manual_minutes_per_task: number  (how long a human takes per task execution)
  - hourly_cost_eur: number          (cost per hour of human labor, default: 45)

System calculates:
  - total_executions: COUNT(*) FROM pipeline_runs WHERE project_id = X AND status = 'complete'
  - avg_automated_minutes: AVG(EXTRACT(EPOCH FROM completed_at - started_at) / 60) FROM pipeline_runs
  - time_saved_minutes: (total_executions * manual_minutes) - (total_executions * avg_automated_minutes)
  - money_saved_eur: (time_saved_minutes / 60) * hourly_cost_eur
  - roi_percentage: (money_saved_eur / total_cost) * 100
    where total_cost = orqai_cost + estimated_dev_hours * hourly_cost
```

**Key design decision:** ROI is ALWAYS labeled "estimated" on the dashboard. The `manual_minutes` value is a user estimate, not a measurement. Presenting it as precise would erode executive trust.

**Display pattern (F-shaped scanning):** Large stat cards at top of dashboard:
- "~X hours saved this month" (time_saved_minutes / 60, rounded)
- "~EUR Y saved this month" (money_saved_eur, rounded)
- "X automations active" (projects WHERE status = 'live')
- "X% success rate" (successful_runs / total_runs * 100)

Each card includes a trend indicator (up/down arrow + percentage vs previous period).

### Zapier Analytics Scraper

**What data to extract** (verified from Zapier analytics dashboard documentation):

| Metric | Where in Zapier UI | Storage Column |
|--------|-------------------|----------------|
| Active Zaps count | KPI card at top | `zapier_snapshots.active_zaps` |
| Task usage (used / limit) | KPI card + usage chart | `tasks_used`, `tasks_limit` |
| Successful run rate % | KPI card | `success_rate` |
| Active members count | KPI card | `active_members` |
| Error count | Reports section | `error_count` |
| Top zaps by usage | Reports table | `top_zaps` (JSONB) |
| Alert count | KPI card | `alert_count` |

**Scraper architecture:**
```
Schedule: Inngest cron function, every 4 hours (6x/day)
Steps:
1. Load Zapier session cookie from credential vault (encrypted in Supabase)
2. Launch Browserless.io session (connectOverCDP)
3. Set session cookie, navigate to zapier.com/app/settings/analytics
4. Wait for KPI cards to render (DOM selectors)
5. Extract text content from each KPI element
6. Navigate to reports tab
7. Extract top zaps by usage table rows
8. Store snapshot row in zapier_snapshots table with timestamp
9. Close browser session
10. On failure: store error screenshot, retry via Inngest retry (3 attempts)
```

**Estimated Browserless.io cost:** 6 runs/day * ~3 units/run = 18 units/day = ~540 units/month. Well within Starter plan (10K units/month).

**Risk:** Zapier DOM changes break the scraper. Mitigation: use semantic selectors (aria-labels, data-testid) where possible, and robust error handling with screenshot capture on failure.

### Orq.ai Analytics Integration

**Available data** (from Orq.ai documentation -- dashboards, traces, logs):
- Latency per agent/deployment call
- Token usage (input + output tokens)
- Cost per call (model-specific pricing)
- Error rates per deployment
- Traces (full request/response chains)
- Custom events and metadata

**Integration approach (ordered by preference):**
1. **REST API** -- Check if Orq.ai exposes analytics endpoints. Documentation mentions dashboards but does not explicitly document an analytics REST API. MEDIUM confidence this exists but is undocumented. Query: `GET /v2/analytics/...` or similar.
2. **OpenTelemetry export** -- Orq.ai documentation mentions traces can be exported via OpenTelemetry. If available, pipe to a lightweight collector that stores in Supabase.
3. **Dashboard scraper** -- Fallback. Same Browserless.io pattern as Zapier scraper. Navigate to Orq.ai Studio dashboard, extract metrics.

**Recommendation:** Verify option 1 (REST API) during Phase 3 infrastructure setup. If unavailable, implement option 3 (scraper) which reuses the Zapier scraper framework.

### O365 SSO via Azure AD

**Implementation approach** (from Supabase official documentation):

```
Step 1 -- Azure Portal (IT admin task):
  - Register application in Microsoft Entra ID
  - Set redirect URI: https://<supabase-ref>.supabase.co/auth/v1/callback
  - Configure as single-tenant (Moyne Roberts organization only)
  - Create client secret
  - Configure xms_edov optional claim (email verification signal)
  - Grant openid, email, profile scopes

Step 2 -- Supabase Dashboard:
  - Navigate to Auth > Providers > Azure
  - Enter Client ID + Client Secret from Azure
  - Set Azure Tenant URL: https://login.microsoftonline.com/<tenant-id>
  - Enable provider

Step 3 -- Login Page Code:
  - Add "Sign in with Microsoft" button below existing email/password form
  - onClick: supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: window.location.origin + '/auth/callback' }
    })
  - Add /auth/callback route to handle OAuth code exchange (PKCE flow)
  - Supabase @supabase/ssr handles PKCE automatically

Step 4 -- Account linking:
  - Configure allow_linking in Azure provider settings
  - When existing email/password user signs in via M365 with matching email,
    accounts merge automatically
```

**Complexity:** LOW-MEDIUM. Supabase does the heavy lifting. Azure portal config is the bottleneck (requires IT admin access). Code changes are minimal: one button + one callback route.

### Automated Status Monitoring

**Status state machine:**
```
idea ──→ building ──→ testing ──→ live ──→ paused
  │         │           │          │         │
  └─────────┴───────────┴──────────┴─────────┘
              (manual override: any → any)

Automatic transitions:
  idea → building:     First pipeline run starts for this project
  building → testing:  Pipeline completes successfully, OR Orq.ai experiments detected
  testing → live:      Agent deployed on Orq.ai AND receiving production calls
  live → paused:       No activity for 30 days OR manual pause
  any → degraded:      Error rate > 30% in last 24 hours (overlay status, not a replacement)
```

**Implementation:** Inngest cron function (`0 */15 * * *` -- every 15 minutes):
1. Query all projects WHERE `status` NOT IN ('paused', 'archived') AND `status_locked_by` IS NULL
2. For each project: check latest signals (pipeline_runs, orq_snapshots, zapier_snapshots)
3. Apply state machine transition rules
4. If transition warranted: update `projects.status`, insert row in `project_status_log`
5. Human override: set `status_locked_by = user_id` to prevent automatic transitions

### Visual Redesign Principles

**Design principles for executive audience** (synthesized from 2026 SaaS dashboard research):

1. **F-shaped scanning pattern:** Most important metrics in top-left. KPI summary row at top. Secondary data flows down-left.
2. **Big numbers, not busy charts:** CEO wants to see "47 hours saved" not a multi-axis chart. Large stat cards with trend indicators (up/down arrow + percentage change).
3. **Minimal clutter:** Show what matters NOW. Drill-down available but not prominent. Avoid showing everything on one screen.
4. **Consistent spacing:** Tailwind v4 spacing scale. `space-y-8` between dashboard sections, `gap-4` within card grids.
5. **Typography hierarchy:** Page title (text-2xl font-semibold), Section header (text-lg font-medium), Card title (text-sm font-medium), Stat number (text-3xl font-bold), Body text (text-sm), Caption (text-xs text-muted-foreground).
6. **Semantic colors:** Green = healthy/success. Amber = warning/attention. Red = failure/critical. Blue = informational/neutral. No decorative colors.
7. **Accessibility:** WCAG AA contrast ratios. Data tables alongside visual charts for screen readers.

**No new UI library needed.** shadcn/ui v4 + Tailwind v4 + Recharts v3 (via `npx shadcn add chart`) covers everything. The redesign is about consistent application of existing tools, not new dependencies.

### Charts Specification

**Library:** shadcn/ui charts (Recharts v3). Install: `npx shadcn add chart`. Already in the shadcn ecosystem. No lock-in -- uses Recharts directly without abstraction layer.

| Chart Type | Data Source | Dashboard Location | Purpose |
|------------|-------------|-------------------|---------|
| Donut/pie | Project status counts | Top section | Status distribution at a glance |
| Area (filled) | pipeline_runs count by day/week | Metrics section | Run volume trend |
| Line | Success rate % by day/week | Metrics section | Reliability trend |
| Stacked bar | Project count by automation_type | Overview section | Automation type distribution |
| Cumulative area | ROI money_saved_eur over time | ROI section | Value accumulation story |
| Horizontal bar | Top 5 projects by run count | Activity section | Most active automations |

**Bundle impact:** ~50KB gzipped (Recharts v3). Acceptable for a dashboard app. Significantly lighter than Tremor (~200KB+).

## Complexity Summary

| Feature | Effort | Risk | Priority | Notes |
|---------|--------|------|----------|-------|
| Extended project model | XS | LOW | P0 | DB migration, everything depends on it |
| KPI cards with real data | XS | LOW | P0 | Replace hardcoded values |
| Project status lifecycle UI | S | LOW | P0 | Badges + dropdown |
| Charts library install | XS | LOW | P0 | `npx shadcn add chart` |
| Executive dashboard page | L | LOW | P1 | New route + layout + all chart components |
| ROI calculation engine | M | MEDIUM | P1 | User input UX + calculation logic |
| Health indicators | S | LOW | P1 | Derived from run data |
| Navigation restructure | XS | LOW | P1 | Add sidebar section |
| O365 SSO | M | LOW-MED | P1 | Azure config is the bottleneck |
| Visual redesign | L | LOW | P2 | No technical risk, design effort |
| Zapier browser scraper | XL | HIGH | P2 | Auth, DOM selectors, maintenance |
| Orq.ai analytics | M-L | MEDIUM | P2 | API availability uncertain |
| Automated status monitoring | M | MEDIUM | P2 | State machine edge cases |
| 360-degree unified view | M | MEDIUM | P3 | Normalizing three data sources |
| Dark mode + theme toggle | S | LOW | P3 | shadcn already supports it |
| Activity timeline | M | LOW | P3 | Event aggregation feed |
| Cost tracking | M | MEDIUM | P3 | Depends on Orq.ai + Zapier data |

## Data Sources Summary

| Source | Collection Method | Freshness | Confidence |
|--------|-------------------|-----------|------------|
| Agent Workforce pipeline runs | Direct Supabase query | Real-time | HIGH -- own database |
| Agent Workforce project data | Direct Supabase query | Real-time | HIGH -- own database |
| Zapier analytics | Browserless.io scraper, Inngest cron | 4-hour intervals | MEDIUM -- scraper fragility, DOM changes |
| Orq.ai agent metrics | REST API (preferred) or scraper | Depends on method | LOW -- programmatic API access not confirmed |
| User-entered ROI baselines | Supabase `projects` table columns | Real-time | HIGH -- user-managed values |
| Zapier plan cost | Manual configuration in settings | Static until changed | HIGH -- known fixed amount |

## Sources

### ROI & Time Saved
- [Forecasting and tracking the ROI of automation (Red Hat)](https://www.redhat.com/en/blog/forecast-track-measure-roi-automation)
- [10 Metrics to Measure Automation ROI (Latenode)](https://latenode.com/blog/workflow-automation-business-processes/automation-roi-metrics/10-metrics-to-measure-automation-roi)
- [UiPath Insights ROI customizations and calculations](https://docs.uipath.com/insights/automation-cloud/latest/user-guide/roi-customizations-and-calculations)
- [UiPath Business ROI Dashboard](https://docs.uipath.com/insights/automation-cloud/latest/user-guide/business-roi)
- [ROI Dashboard: Ultimate Guide 2026 (Improvado)](https://improvado.io/blog/roi-dashboard)
- [ROI tracking (Automation Anywhere)](https://docs.automationanywhere.com/bundle/enterprise-v2019/page/roi-tracking.html)

### Executive Dashboard Design
- [Anatomy of High-Performance SaaS Dashboard Design 2026 (SaaSFrame)](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns)
- [9 Executive Dashboard Examples for C-Suite (AugmentedTechLabs)](https://www.augmentedtechlabs.com/blog/9-executive-dashboard-examples)
- [Smart SaaS Dashboard Design Guide 2026 (F1Studioz)](https://f1studioz.com/blog/smart-saas-dashboard-design/)
- [Design Thoughtful Dashboards for B2B SaaS (UX Collective)](https://uxdesign.cc/design-thoughtful-dashboards-for-b2b-saas-ff484385960d)
- [Top SaaS Design Trends 2026 (DesignStudioUIUX)](https://www.designstudiouiux.com/blog/top-saas-design-trends/)

### Zapier Analytics
- [Review your account usage in the analytics dashboard (Zapier Help)](https://help.zapier.com/hc/en-us/articles/25444544607373-Review-your-account-usage-in-the-analytics-dashboard)
- [Enhanced Zap analytics and reporting (Zapier Help)](https://help.zapier.com/hc/en-us/articles/31466726600461-Enhanced-Zap-analytics-and-reporting)
- [Zapier Analytics Dashboard (Zapier Help)](https://help.zapier.com/hc/en-us/articles/25444514945037-Use-the-Analytics-dashboard-to-easily-monitor-your-account-Beta)
- [Get usage insights for your Zaps (Zapier Help)](https://help.zapier.com/hc/en-us/articles/37717572014861-Get-usage-insights-for-your-Zaps)

### Orq.ai Analytics
- [Orq.ai Analytics Documentation](https://docs.orq.ai/docs/analytics)
- [Orq.ai Observability & Monitoring](https://orq.ai/platform/observability-monitoring)
- [Orq.ai Logs and Metrics Enhancement (Changelog)](https://docs.orq.ai/changelog/log-and-metrics-enhacements)

### O365 SSO
- [Supabase Login with Azure (Microsoft) -- Official Docs](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase Enterprise SSO with SAML 2.0](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [Supabase Set Up SSO with Azure AD](https://supabase.com/docs/guides/platform/sso/azure)

### Charts & Visualization
- [shadcn/ui Charts -- Area, Line, Bar, Pie (Recharts v3)](https://ui.shadcn.com/docs/components/radix/chart)
- [Build a Dashboard with shadcn/ui -- Complete Guide 2026](https://designrevision.com/blog/shadcn-dashboard-tutorial)
- [How to Build an Admin Dashboard with shadcn/ui and Next.js 2026](https://adminlte.io/blog/build-admin-dashboard-shadcn-nextjs/)

### Data Integration Patterns
- [Polling vs Webhooks: When to Use One Over the Other (Merge.dev)](https://www.merge.dev/blog/webhooks-vs-polling)
- [Real-Time Data and Next.js: Building Interactive Dashboards (OpsMatters)](https://opsmatters.com/posts/real-time-data-and-nextjs-building-interactive-dashboards)

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
