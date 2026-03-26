# Project Research Summary

**Project:** Agent Workforce V6.0 — Executive Dashboard & UI Revamp
**Domain:** Executive automation management dashboard with 360-degree data integration, project lifecycle tracking, ROI estimation, and Azure AD SSO
**Researched:** 2026-03-26
**Confidence:** HIGH

---

## Executive Summary

V6.0 adds an executive-facing layer to an already-functional pipeline-centric app. The core challenge is aggregating data from three independent sources — Agent Workforce's own Supabase DB, Zapier's analytics-only-accessible-via-browser-scraping dashboard, and Orq.ai's programmatic analytics API — into a single coherent executive view. The recommended approach is a pre-computed snapshot architecture: Inngest cron functions collect data from each source on a schedule and write to intermediate Supabase tables; the executive dashboard page reads only from those pre-computed snapshots for sub-100ms loads. This decouples page rendering from external service availability entirely.

**Critical correction applied:** Multiple researcher agents incorrectly concluded that Orq.ai has no analytics API. Orq.ai DOES expose programmatic analytics via MCP: `get_analytics_overview` provides workspace snapshots (total requests, cost, tokens, errors, error rate, average latency, top 5 models; configurable periods: 1h, 6h, 24h, 7d, 30d) and `query_analytics` supports flexible drill-down with metrics for usage, cost, latency, errors, agents, and model performance — with grouping by provider/model/project_id/agent_name, time ranges, filtering, and granularity control. The correct architecture for Orq.ai data is: call these APIs on a schedule via Inngest cron and store results in Supabase. No browser scraping is needed for Orq.ai. Only Zapier requires browser automation.

The key risk areas are: (1) Zapier scraper fragility — Zapier has no analytics API, so browser scraping is mandatory and will break when Zapier ships UI updates; resilient multi-selector strategies and data-validation layers are non-negotiable from day one. (2) SSO account duplication — use Azure as an OAuth provider (not SAML) to get automatic identity linking with existing email/password users. (3) Executive trust in ROI numbers — always label estimated metrics clearly, require user-entered manual baselines, and separate measured from estimated data at the architecture level from the start.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 16, Supabase, Inngest, shadcn/ui, Tailwind v4, TypeScript) handles everything V6.0 needs except charting and theme switching. Only four new npm packages are required: `recharts@^3.8` (via `npx shadcn add chart` for pre-themed chart components), `next-themes@^0.4.6` (theme provider for dark mode — CSS variables are defined but there is no runtime switcher), `date-fns@^4.1` (tree-shakeable date formatting for relative timestamps and ranges), and `@orq-ai/node@4.4.9` (exact pin due to beta SDK). Azure AD SSO requires zero new packages — Supabase's built-in Azure OAuth provider handles it via existing `@supabase/supabase-js`. Total bundle size addition: ~45KB gzipped; `@orq-ai/node` is server-only.

**Core technologies (new additions only):**
- `recharts@^3.8` via `npx shadcn add chart`: dashboard visualizations — integrated into shadcn theming with CSS variable support, no competing design system
- `next-themes@^0.4.6`: runtime dark/light mode switching — `suppressHydrationWarning` already in layout.tsx; CSS variables already defined in globals.css
- `date-fns@^4.1`: date formatting for timestamps and ranges — tree-shakeable, TypeScript-first, shadcn ecosystem standard
- `@orq-ai/node@4.4.9`: Orq.ai SDK for agent listing and deployment data — pin exact version due to beta instability
- `Intl.NumberFormat` (built-in): EUR formatting, compact KPI numbers, percentages — zero new dependency
- Supabase Azure OAuth (no new package): O365 SSO via `signInWithOAuth({ provider: 'azure' })` — existing `@supabase/ssr` and auth callback route handle the rest

**React 19 compatibility note:** Recharts 3.x requires a `package.json` override: `"overrides": { "react-is": "^19.0.0" }`. Documented in shadcn-ui/ui#7669.

### Expected Features

**Must have (table stakes):**
- Project status lifecycle (idea/building/testing/live/paused) with status badges — foundation for all aggregation; nothing works without it
- KPI summary cards with real data — existing dashboard shows hardcoded "0"/"--" placeholders
- Run success/failure metrics — data exists in `pipeline_runs`, needs aggregation queries
- Time-range filtering (7d, 30d, 90d) — industry standard for any metrics view
- Activity timeline — recent pipeline runs, approvals, project changes as chronological feed
- O365 SSO login (Azure OAuth alongside email/password) — Moyne Roberts runs on M365; email-only login is a friction blocker for executives
- Dark mode toggle — shadcn CSS variables already defined; just needs next-themes provider wired up

**Should have (differentiators):**
- ROI and time-saved estimates — the executive buy-in feature; requires user-entered manual baselines (never auto-computed)
- 360-degree data integration — single pane across Agent Workforce + Zapier + Orq.ai
- Zapier analytics integration (active zaps, task usage, success rates) — no API; browser scraper gives unique organizational visibility
- Orq.ai analytics integration (agent usage, cost, latency, token consumption) — programmatic via MCP analytics APIs, scheduled via Inngest cron
- Health/reliability indicators per project (green/yellow/red traffic lights)
- Automated project status monitoring — suggests transitions based on signals; never auto-applies without human confirmation
- Trend charts (area, line, cumulative ROI) — shadcn/ui chart components on Recharts v3

**Defer to V7.0+:**
- PDF/email report generation
- Custom alerting/notification rules with delivery channels
- Dashboard widget customization (drag-and-drop)
- SAML SSO (OAuth is sufficient for single-tenant M365)
- Historical ROI comparisons quarter-over-quarter
- AI-generated insights ("Your ROI is up 23% because...")
- Role-based dashboard views (single view is correct for 15 users)

### Architecture Approach

The architecture introduces a pre-computed snapshot layer sitting between external data sources and the dashboard UI. Four separate Inngest cron functions handle data collection and aggregation: `zapier-scraper` (Browserless.io Playwright, every 6h), `orqai-collector` (Orq.ai MCP analytics APIs, every 4h), `dashboard-aggregator` (reads all source tables, writes pre-computed metrics, every 2h), and `status-monitor` (evaluates project transition signals, every 1h). The executive dashboard page is a server component that reads only from the pre-computed `dashboard_snapshots` table — never from external services directly. This gives sub-100ms page loads and means external service failures degrade data freshness, not page functionality.

**Major components:**
1. **Data collection layer** — `zapier-scraper.ts` (Browserless.io Playwright), `orqai-collector.ts` (Orq.ai MCP analytics API calls), four new Supabase tables: `zapier_snapshots`, `orqai_snapshots`, `dashboard_snapshots`, `project_status_history`
2. **Aggregation layer** — `dashboard-aggregator.ts` (Inngest cron reading all source tables, computing derived KPIs, upserting `dashboard_snapshots`), `lib/dashboard/aggregator.ts` (pure computation functions)
3. **Executive dashboard page** — `app/(dashboard)/executive/page.tsx` (server component, parallel Supabase queries, renders KPI cards, charts, project grid), `components/dashboard/` (KPI card, trend chart, status grid, source freshness indicator)
4. **Extended project model** — `projects` table migration adding `status`, `automation_type`, `roi_estimate_hours`, `time_saved_hours`; `status-monitor.ts` Inngest cron with suggest-not-apply status transition logic
5. **Azure AD SSO** — login page addition of `signInWithOAuth({ provider: 'azure' })` button; Supabase Azure provider configuration; zero middleware changes required

All existing components (pipeline runner, agent graph, HITL approval, credential vault, systems registry, chat panel) remain completely unchanged. V6.0 is purely additive.

### Critical Pitfalls

1. **SSO account duplication** — If Azure AD is configured as SAML (not OAuth), existing email/password users get new empty accounts on first SSO login. Use Supabase's Azure OAuth provider (`signInWithOAuth({ provider: 'azure' })`), not SAML. OAuth participates in automatic identity linking; SAML does not. Validate with a real test user who has existing project data before deploying any user-facing SSO button.

2. **Zapier scraper silent failures** — Zapier ships weekly UI updates; CSS class names in React SPAs are unstable. Scrapers run successfully but return zeros or stale data without throwing errors. Implement multiple selector strategies per data point (aria-label, data-testid, text-based, structural), a data-validation layer that flags suspicious drops (>90% change = scraper failure, not real drop), raw HTML storage for selector recovery, and "data last updated" timestamps on every tile. Design for failure from day one — this cannot be retrofitted.

3. **Misleading ROI numbers eroding executive trust** — Presenting estimated time savings as precise numbers ("42.3 hours saved") creates false precision. CFOs dismiss entire dashboards over this. Require user-entered manual baselines per project, label estimated metrics with distinct visual treatment, show ranges not point estimates, and separate measured from estimated at the data model level. Start Phase 1 with measurable metrics only; add ROI in Phase 2 after trust in measured data is established.

4. **UI redesign breaking live pages** — Changes to shared layout, globals.css, or CSS variables propagate to all pages instantly. The pipeline runner and agent graph are fragile to spacing/typography changes. Redesign bottom-up (individual components before shared layout), use parallel route groups or feature flags during development, screenshot all pages before visual work begins and diff after each change.

5. **Automated status monitor overriding manual choices** — Auto-transitioning a project from "testing" to "live" because it detected successful runs, when the project owner was awaiting business approval. Status monitor must suggest transitions via notification, never apply them. Add a `status_locked` flag; locked projects are skipped entirely. Never auto-transition backward — backward transitions are always manual with a reason required.

---

## Implications for Roadmap

Based on combined research, the suggested phase structure is:

### Phase 1: Foundation — Project Model + Data Collection Infrastructure

**Rationale:** Every downstream feature depends on the extended project model. The `status` and `automation_type` columns are the foundation for the executive dashboard, ROI calculations, status monitoring, and health indicators. Creating all new database tables and starting both scrapers in Phase 1 means data accumulates while the dashboard UI is being built in Phase 2, giving real data to display at launch rather than empty charts.

**Delivers:** Extended `projects` table with status lifecycle; `zapier_snapshots`, `orqai_snapshots`, `dashboard_snapshots`, `project_status_history` tables via Supabase MCP migrations; Inngest cron for Zapier browser scraping (data accumulates from day one); Inngest cron for Orq.ai analytics collection via MCP APIs; Recharts chart library installed; project status badges on existing project cards.

**Addresses (from FEATURES.md):** Project status lifecycle (P0), charts library install (P0), automation type classification, project card extensions.

**Avoids (from PITFALLS.md):** Schema debt — all new columns are additive-only with defaults, so zero existing queries break. Raw HTML storage for Zapier scraper starts here, making selector recovery possible from day one. Orq.ai data uses MCP analytics API calls, no browser scraping needed.

**Research flag:** LOW for migrations and Inngest cron (well-documented). MEDIUM for Orq.ai collector — verify exact MCP call signatures for `get_analytics_overview` and `query_analytics`, available grouping dimensions, pagination behavior, and rate limits at implementation start.

---

### Phase 2: Executive Dashboard + ROI

**Rationale:** With data accumulating from Phase 1, the dashboard page can display real numbers at launch. ROI calculation depends on the extended project model from Phase 1. Health indicators depend on run data that has been aggregating. This phase delivers the primary executive value proposition.

**Delivers:** `/executive` dashboard route with KPI summary cards (real data from `pipeline_runs` + snapshots), project status distribution chart (donut), run volume trend chart (area), success rate trend chart (line), ROI cards (estimated, user-input baselines labeled "est."), health traffic-light indicators per project, navigation restructure (add Analytics section to sidebar), dashboard aggregator Inngest cron.

**Uses (from STACK.md):** Recharts via shadcn chart components, date-fns for timestamp formatting, Intl.NumberFormat for EUR/compact numbers.

**Implements (from ARCHITECTURE.md):** Executive dashboard page (server component), dashboard-aggregator Inngest cron, `lib/dashboard/aggregator.ts`, full `components/dashboard/` component set.

**Avoids (from PITFALLS.md):** Misleading ROI — measured vs. estimated separation baked into the data model. KPI count discipline — maximum 5 top-level KPIs visible above the fold. Every data tile shows "last updated" timestamp. ROI cards show methodology tooltip on hover.

**Research flag:** LOW — dashboard patterns with shadcn + Recharts are thoroughly documented. ROI calculation methodology is verified against UiPath Insights and Automation Anywhere patterns.

---

### Phase 3: Automated Status Monitoring + 360-Degree Unified View

**Rationale:** Status monitoring builds on the project model from Phase 1 and the signal data flowing since then. The 360-degree unified view requires data from all three sources to be flowing and validated before combining them into a single display. Both features benefit from real scraper data having accumulated during Phases 1–2.

**Delivers:** `status-monitor.ts` Inngest cron with suggest-not-apply logic and `status_locked` flag; status suggestion notifications for project owners; `project_status_history` audit trail; unified 360-degree view combining Agent Workforce + Zapier + Orq.ai data; activity timeline (recent events feed); total automation count; cost tracking (Orq.ai API cost + known Zapier plan cost).

**Avoids (from PITFALLS.md):** Status monitor override — suggest-not-apply with `status_locked` flag enforced; no backward auto-transitions. Data source staleness — each tile shows source-specific freshness timestamp; aggregator marks stale sources visually.

**Research flag:** MEDIUM — status state machine edge cases need product decisions during phase planning: what observable signal marks "testing → live"? How to define a "total automation count" that meaningfully combines Zapier Zaps with internal projects? What counts as the same automation across both systems? These are business definition questions, not technical ones.

---

### Phase 4: O365 SSO + Visual Redesign + Polish

**Rationale:** SSO is independent of all other features but placed here because Azure AD tenant setup has organizational dependencies (IT admin access to Azure Entra ID portal) that may introduce delays independent of development capacity. Visual redesign is last because it should cover the full page surface area — including the new executive dashboard and status monitoring pages built in Phases 2–3.

**Delivers:** Azure OAuth login button alongside email/password; Supabase Azure provider configuration; single-tenant restriction to Moyne Roberts Azure AD tenant; user identity pre-migration script (link existing accounts before enabling SSO); refined typography scale and color palette via CSS variable overrides in globals.css; dark mode toggle via next-themes; spacing and card style consistency across all pages; empty states for all data sections.

**Uses (from STACK.md):** `next-themes@^0.4.6` for theme provider; Supabase built-in Azure OAuth (no new packages); CSS variable system already in globals.css.

**Avoids (from PITFALLS.md):** SSO duplication — use OAuth not SAML, validate identity linking with a real test user before deploying. Azure tenant misconfiguration — test that `@outlook.com` personal accounts are rejected. UI redesign regressions — screenshot all existing pages before any visual work begins; redesign bottom-up starting with individual components, then shared layout last.

**Research flag:** LOW for SSO (Supabase Azure OAuth is thoroughly documented; callback route already works). MEDIUM for visual redesign (CSS variable changes to globals.css have wide blast radius; requires a regression testing plan before starting).

---

### Phase Ordering Rationale

- Phase 1 must be first because every other feature depends on the extended project model, and both scrapers benefit from starting data collection as early as possible
- Phase 2 before Phase 3 because the 360-degree unified view and status monitoring both need the dashboard infrastructure (snapshot tables, aggregator pattern) established first
- Zapier scraper and Orq.ai collector are in Phase 1 (not Phase 3) because data accumulation takes time — starting collection early means real trend data exists by the time the dashboard UI launches
- O365 SSO in Phase 4 because it is independent but has organizational dependencies; placing it last prevents it from blocking other work if Azure portal access is delayed
- Visual redesign last because redesigning the full surface area requires all new pages to exist first; partial redesigns create inconsistent states

---

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 1 (Orq.ai collector):** Verify exact MCP analytics API call signatures for `get_analytics_overview` and `query_analytics`, available grouping dimensions, pagination behavior, and rate limits. The APIs exist but implementation-level details need confirmation before designing the collector's data model.
- **Phase 3 (360-degree data normalization):** Business definition needed — how to define a "total automation count" that meaningfully combines Zapier Zaps with Agent Workforce projects. What constitutes the same "automation" across both systems? Requires a product decision before encoding in any aggregation query.
- **Phase 3 (status transition signals):** What observable signal marks "building → testing" and "testing → live"? Requires agreement on business definitions before encoding in the state machine.

Phases with standard patterns (can skip research):
- **Phase 1 (Supabase migrations):** Additive `ALTER TABLE` with defaults — well-documented, zero risk
- **Phase 1 (Zapier scraper structure):** Browserless.io + Inngest cron pattern already used in codebase; `docs/browserless-patterns.md` covers session reuse, 2FA, error handling
- **Phase 2 (Recharts charts):** shadcn/ui chart documentation is comprehensive; all required chart types (area, line, donut, bar) are documented with examples
- **Phase 4 (Azure OAuth):** Supabase official docs cover the full setup flow; existing callback route already handles OAuth code exchange

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new packages verified via official docs and npm. React 19 override for Recharts is documented. Azure OAuth requires zero new packages — confirmed via Supabase docs. |
| Features | HIGH | Table stakes verified against UiPath Insights, Automation Anywhere, Zapier analytics patterns. ROI calculation formula verified against industry standards. Zapier analytics data points verified against Zapier help docs. |
| Architecture | HIGH | Pre-computed snapshot pattern is well-established for multi-source dashboards. Supabase Azure OAuth flow verified via official docs. Inngest cron patterns verified. Orq.ai MCP analytics API confirmed — corrected from research output. |
| Pitfalls | HIGH | All critical pitfalls verified against official documentation (Supabase identity linking docs confirm SAML exclusion from automatic linking). Zapier scraper fragility is documented industry knowledge. ROI trust issues verified against published executive AI ROI research. |

**Overall confidence:** HIGH

### Gaps to Address

- **Orq.ai MCP analytics API call signatures:** The APIs exist (`get_analytics_overview`, `query_analytics`) but exact parameter schemas, pagination limits, and rate limits need verification at implementation time. Do not assume unlimited data access — check for workspace-level query limits before finalizing the collector's data model.

- **Zapier DOM selector stability:** The Zapier scraper design assumes `data-testid` or `aria-label` attributes exist on key analytics elements. If Zapier's dashboard uses only hashed CSS classes, the multi-selector strategy requires more creative fallbacks (text-based extraction, positional selectors). Validate actual DOM structure during Phase 1 scraper development before finalizing the selector strategy.

- **Identity pre-migration script:** The recommendation is to pre-migrate existing email/password users to linked Azure identities before enabling SSO. This requires querying `auth.users` and calling the Supabase Admin API. The script needs careful foreign key handling across `pipeline_runs`, `pipeline_steps`, `approval_requests`, and `project_members`. Treat as a standalone task requiring its own test plan during Phase 4 planning.

- **Zapier 2FA handling during scraper authentication:** If the Zapier admin account has 2FA enabled (likely), the two-call Browserless.io pattern from `docs/browserless-patterns.md` is required. This needs a human-in-the-loop notification step during initial credential setup. Confirm the auth flow with the user before the Phase 1 scraper is considered complete.

---

## Sources

### Primary (HIGH confidence)

- [Supabase Azure OAuth Login](https://supabase.com/docs/guides/auth/social-login/auth-azure) — OAuth vs SAML configuration, tenant URL setup, identity linking behavior
- [Supabase Auth Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) — SAML exclusion from automatic linking, OAuth auto-linking behavior
- [Inngest Cron/Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions) — cron syntax and multi-step function patterns
- [shadcn/ui Charts Documentation](https://ui.shadcn.com/docs/components/radix/chart) — Recharts v3 integration, chart component library
- [shadcn/ui Dark Mode with Next.js](https://ui.shadcn.com/docs/dark-mode/next) — next-themes integration pattern
- [UiPath Insights ROI calculations](https://docs.uipath.com/insights/automation-cloud/latest/user-guide/roi-customizations-and-calculations) — ROI formula verification
- [Zapier Analytics Dashboard](https://help.zapier.com/hc/en-us/articles/25444544607373) — available analytics metrics; no programmatic API confirmed
- Existing codebase `docs/browserless-patterns.md` — session reuse, 2FA, error handling patterns
- Orq.ai MCP tools: `get_analytics_overview`, `query_analytics` — programmatic analytics access confirmed

### Secondary (MEDIUM confidence)

- [Orq.ai Analytics Docs](https://docs.orq.ai/docs/analytics) — dashboard analytics available; MCP API surfaces programmatic access
- [Automation Anywhere ROI tracking](https://docs.automationanywhere.com/bundle/enterprise-v2019/page/roi-tracking.html) — ROI methodology patterns
- [Capably.ai: The Real ROI of AI Automation](https://www.capably.ai/resources/roi-of-ai) — 39% of executives report difficulty measuring AI outcomes
- [Anatomy of High-Performance SaaS Dashboard Design 2026](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns) — F-shaped scanning, KPI card patterns
- [Recharts v3 shadcn compatibility](https://github.com/shadcn-ui/ui/issues/7669) — React 19 override requirement

### Tertiary (LOW confidence — validate at implementation)

- Orq.ai MCP `query_analytics` exact parameter schema and pagination limits — needs implementation-time verification
- Zapier analytics dashboard DOM structure and stable selectors — needs validation during Phase 1 scraper development

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
