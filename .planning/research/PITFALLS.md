# Pitfalls Research

**Domain:** V6.0 Executive Dashboard & UI Revamp -- Adding executive dashboard with 360-degree data integration, full UI redesign, automated status monitoring, ROI estimation, Zapier browser scraping, and O365 SSO to an existing Next.js + Supabase + Vercel app with shadcn/ui components
**Researched:** 2026-03-26
**Confidence:** HIGH (pitfalls verified against official Supabase docs, Browserless.io production patterns, existing codebase analysis, and multiple credible sources on dashboard design and data aggregation)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken auth, misleading executive decisions, or fundamental trust erosion.

---

### Pitfall 1: Supabase SAML SSO Creates Duplicate Accounts Instead of Linking to Existing Email/Password Users

**What goes wrong:**
A user who signed up with email/password (the current auth method) later clicks "Sign in with Microsoft" via Azure AD SSO. Supabase creates a COMPLETELY SEPARATE user account with a new UUID, even though the email address is identical. The user now has two accounts: one with all their projects, pipeline runs, and membership data, and one that is empty. The executive logs in via SSO, sees an empty dashboard, and reports the app is broken.

This is not a bug -- it is documented Supabase behavior. SAML SSO identities are explicitly excluded from automatic identity linking. OAuth providers (like Microsoft Social Login) DO automatically link by email, but SAML providers do NOT. The distinction matters because Azure AD can be configured as either OAuth or SAML, and the linking behavior is completely different.

**Why it happens:**
Supabase Auth has two identity linking modes: "automatic" (enabled by default for OAuth) where a new identity with a matching verified email links to the existing user, and "manual" where the user must explicitly call `linkIdentity()` while logged in. SAML SSO providers are excluded from automatic linking as a security measure -- the Supabase team considers SAML a higher-trust boundary where implicit merging could be dangerous. This is documented at supabase.com/docs/guides/auth/auth-identity-linking but easy to miss.

**How to avoid:**
1. Use Azure as an **OAuth provider** (not SAML) via Supabase's built-in Microsoft Social Login (`supabase.auth.signInWithOAuth({ provider: 'azure' })`). OAuth providers DO participate in automatic identity linking, so a user with a matching verified email gets linked to their existing account seamlessly.
2. If SAML is required (e.g., corporate IT mandates it), build a manual linking flow: after SAML login creates a new account, detect the duplicate email, prompt the user to "link your existing account," have them verify via email/password, then call `linkIdentity()`. This is complex and fragile.
3. Before enabling SSO, write a migration that ensures all existing users have verified email addresses. Supabase will NOT auto-link to unverified emails even for OAuth providers (this prevents pre-account takeover attacks).
4. Configure Azure AD as **single-tenant** (restrict to your Azure AD tenant ID: `https://login.microsoftonline.com/<tenant-id>`) to prevent personal Microsoft accounts from signing in.

**Warning signs:**
- Testing SSO with an email that already has an email/password account, and seeing an empty dashboard
- Two entries in `auth.users` with the same email but different `id` values
- User complaints about "lost data" after switching to Microsoft login
- `auth.identities` table showing `sso:<uuid>` provider entries alongside `email` provider entries for the same email

**Phase to address:**
O365 SSO phase -- this is the FIRST thing to validate during SSO implementation. Must be resolved before any user-facing SSO button is deployed.

**Confidence:** HIGH -- verified against Supabase official documentation on identity linking behavior

---

### Pitfall 2: Zapier Analytics Browser Scraping Breaks Silently When Zapier Updates Their Dashboard UI

**What goes wrong:**
The Browserless.io scraper that extracts analytics from Zapier's dashboard (task usage, Zap performance, error rates) suddenly starts returning empty or partial data. The Zapier dashboard was updated with a new layout, CSS class names changed, or a React component restructure moved data into a different DOM hierarchy. The scraper does not crash -- it runs successfully but extracts stale or empty values. The executive dashboard shows "0 tasks used" or last week's numbers, and nobody notices for days because there are no scraper errors in the logs.

**Why it happens:**
Zapier has no public analytics API for retrieving task counts, Zap performance, or usage metrics. Browser scraping is the only option. But Zapier ships UI updates frequently (weekly SPA deployments are common for modern web apps), and they have zero obligation to maintain DOM stability for scrapers. CSS class names in React apps are typically hashed (e.g., `.css-1a2b3c4`), making them unstable selectors. Even data-attribute selectors can change when Zapier refactors components.

**How to avoid:**
1. Use MULTIPLE selector strategies per data point (text-based, aria-label, data-attribute, structural) and fall through them. If all fail, flag as "data unavailable" rather than returning zero.
2. Implement a **data validation layer**: if scraped task count is zero but was 500 yesterday, flag as suspicious and keep yesterday's data with a "stale" indicator. Use percentage-change thresholds (>90% drop = likely scraper failure, not actual usage drop).
3. **Always store raw scraped HTML** alongside extracted values. When scraping fails, you can analyze the HTML to update selectors without re-running the scraper.
4. Run scraping health checks: a small Browserless.io session that just checks if key selectors resolve, scheduled every 4 hours. Alert on selector resolution failures BEFORE the main scraping job runs.
5. Design the dashboard to show "data last updated: [timestamp]" prominently and gray out tiles when data is older than the expected refresh interval.
6. Store session cookies in Supabase using the existing `context.storageState()` pattern from `docs/browserless-patterns.md`. Check expiry before each scrape run. If expired, trigger a re-authentication flow (the Zapier login may require 2FA -- use the existing two-call pattern).

**Warning signs:**
- Scraped values suddenly drop to zero or stop changing day-over-day
- Browserless.io sessions complete successfully (no errors) but data looks wrong
- Selectors that resolved last week now return `null` without throwing
- Zapier announces a "new dashboard experience" in their changelog

**Phase to address:**
Data Integration phase -- scraper architecture must include validation, staleness detection, and fallback from day one. Cannot be added as an afterthought.

**Confidence:** HIGH -- browser scraping fragility is well-documented; Zapier's lack of analytics API verified via their docs

---

### Pitfall 3: Executive Dashboard Shows "ROI" Numbers That Nobody Believes

**What goes wrong:**
The dashboard shows "Time Saved: 42 hours/month" and "ROI: 340%" for an automation project, but the CFO immediately asks "where do these numbers come from?" and the answer is "we estimated the manual process takes X minutes and multiply by frequency." The CFO disregards the entire dashboard because the ROI numbers feel fabricated. Worse, someone games the metrics by creating automations for trivially simple tasks to inflate their ROI numbers. Within a month, the dashboard becomes a vanity exercise that nobody trusts.

**Why it happens:**
ROI estimation for automation requires knowing: (1) how long the manual process took, (2) how often it ran, (3) how reliable the automation is, and (4) the cost of the automation itself (Zapier tasks, Orq.ai API calls, development time). Items 1 and 2 are nearly impossible to measure accurately -- they are always estimates. When estimates are presented as precise numbers ("42.3 hours saved"), they create false precision that erodes trust. 39% of executives report difficulties measuring AI outcomes (Capably.ai, 2025).

**How to avoid:**
1. **Show ranges, not point estimates.** "Time saved: 30-55 hours/month" is more honest than "42 hours." Use confidence intervals or simple low/mid/high bounds.
2. **Separate measured from estimated metrics.** Measured: API call count, Zapier task count, automation success rate, Orq.ai token cost. Estimated: time saved, manual FTE equivalent. Label estimated metrics clearly with a different visual treatment (e.g., dashed border, "est." badge).
3. **Let project owners set the manual baseline.** Instead of calculating ROI automatically, prompt the project owner to enter "how long did this take manually?" and "how often per week?" Store these as explicit user-provided estimates. When the CFO asks, the answer is "Nick estimated the manual process at 20 minutes, running 15 times per week."
4. **Start with activity metrics, not ROI.** Phase 1 dashboard should show: automation count, execution frequency, success rate, cost per month. These are all measurable. Add ROI as a Phase 2 feature once the team has established trust in the measured data.
5. **Never auto-calculate ROI** without user-provided baseline data. A project with no manual baseline should show "ROI: not yet estimated" rather than a computed guess.

**Warning signs:**
- Executives asking "how is this calculated?" for every number
- Team creating trivial automations to improve their dashboard numbers
- ROI percentages that seem implausibly high (>500% on simple Zapier zaps)
- Dashboard metrics that never change despite actual workflow changes

**Phase to address:**
Executive Dashboard phase -- metric design and data model must distinguish measured vs. estimated from the architecture level, not added as a label later

**Confidence:** HIGH -- ROI measurement challenges are extensively documented in automation and AI literature

---

### Pitfall 4: UI Redesign on a Live App Breaks Existing Pages During Migration

**What goes wrong:**
The team starts the visual redesign by updating the shared layout, typography, and color palette. This immediately affects ALL pages, including the pipeline runner, project detail, and run detail pages that are actively used. A CSS change to card padding breaks the agent graph layout. A color palette change makes status badges unreadable. Users report issues faster than the team can fix them because the redesign is only 30% complete but the blast radius is 100% of pages.

**Why it happens:**
The current app uses shadcn/ui with Tailwind CSS and has a shared `layout.tsx` that wraps all dashboard pages. Any change to the layout, sidebar, or global CSS variables propagates to every page instantly. The app is already in use (V3.0 is 91% complete), so there is no "maintenance window" for a redesign. Developers underestimate the coupling between visual changes and functional behavior -- a font size change can break a component that relies on text truncation, a spacing change can push buttons off-screen on mobile.

**How to avoid:**
1. **Never modify shared layout or global styles until ALL page-level redesigns are ready.** Work bottom-up: redesign individual components and pages first, then update the shared elements last in a single coordinated push.
2. **Use feature flags for the redesign.** shadcn/ui components are copy-pasted source code -- create parallel versions (e.g., `card-v2.tsx` alongside `card.tsx`) and switch between them with a feature flag. This lets you test the redesigned page in isolation before swapping it live.
3. **Redesign one page at a time with visual regression testing.** Before touching a page, screenshot every state of every existing page. After redesigning the target page, re-screenshot all pages and diff. Any unexpected changes on non-target pages are regressions.
4. **Isolate CSS variable changes.** Instead of updating `--primary` globally, create `--primary-v2` and apply it only to redesigned components. When migration is complete, rename in one commit.
5. **Keep the existing route group `(dashboard)` intact.** Add redesigned pages under a parallel route group (e.g., `(dashboard-v2)`) during development. Only swap the route group when the full redesign is validated.

**Warning signs:**
- Bug reports from users about pages that "weren't touched"
- Agent graph or pipeline runner breaking after a "visual only" change
- Typography or spacing changes causing text overflow or truncation issues
- The sidebar or navigation shifting layout on pages that were not being redesigned

**Phase to address:**
UI Redesign phase -- the migration strategy must be defined BEFORE any visual changes begin. Specifically: order of page migration, feature flag approach, and regression testing plan.

**Confidence:** HIGH -- verified against current codebase structure (shared `layout.tsx`, shadcn/ui component library, Tailwind CSS variable system)

---

### Pitfall 5: Automated Status Monitoring Overrides Manual Choices and Creates Confusion

**What goes wrong:**
The automated status agent scans Zapier execution data and Orq.ai experiment results, then "helpfully" changes a project from "testing" to "live" because it detected successful Zapier executions. But the project owner had intentionally kept it in "testing" because they are waiting for business stakeholder approval. Now the executive dashboard shows the project as "live" and the CTO asks about it in a meeting. The project owner is confused and angry -- they did not approve this status change. Worse, the automated agent reverts a project from "live" to "building" because it detected a failed Zapier execution, triggering alarm when the failure was a known one-off issue.

**Why it happens:**
Automated status monitoring makes assumptions about status transitions based on observed signals (execution success/failure, frequency, error rates). But project status is a HUMAN decision that incorporates context the automation cannot see: business approvals pending, seasonal testing, intentional pauses, known intermittent issues being tolerated. The automation conflates "technical readiness" with "organizational readiness."

**How to avoid:**
1. **Automated status monitoring should SUGGEST, never APPLY.** The agent detects that a project might be ready to move from "testing" to "live" and creates a notification: "Project X has had 50 successful runs in the last 7 days with 98% success rate. Consider moving to Live status." The project owner clicks to approve or dismiss.
2. **Add a `status_locked` flag to the project model.** When a project owner manually sets a status, set `status_locked = true`. Automated monitoring skips locked projects entirely. Only the project owner can unlock.
3. **Distinguish between "detected status" and "confirmed status."** Store both in the database. The dashboard shows confirmed status prominently, with detected status as a subtle indicator: "Status: Testing (automated check suggests: Ready for Live)."
4. **Never auto-transition backward.** A project going from "live" to "building" or "testing" based on automated detection would be catastrophic for trust. Backward transitions must ALWAYS be manual.
5. **Define explicit transition rules.** Idea -> Building (automatic when first pipeline run starts). Building -> Testing (manual only). Testing -> Live (manual only). Any backward transition: manual only with reason required.

**Warning signs:**
- Project owners saying "I didn't change this" about status updates
- Status flickering (changing back and forth between states due to transient failures)
- Executives making decisions based on automated statuses that don't reflect reality
- Team members ignoring status monitoring because it is unreliable

**Phase to address:**
Project Model & Status Monitoring phase -- the suggest-vs-apply distinction and `status_locked` flag must be in the data model from the start, not retrofitted

**Confidence:** HIGH -- based on documented issues with automated status transition tools (Jira, ServiceNow) and architectural reasoning about this specific use case

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding Zapier scraper selectors without fallback strategies | Faster initial implementation | Every Zapier UI update breaks the scraper silently | Never -- always implement 2+ selector strategies per data point |
| Storing scraped data directly in dashboard-ready format | Simpler data pipeline, no transformation layer | Cannot re-process historical data when scraper logic changes; schema changes break historical comparisons | Only during proof-of-concept; must add raw-data storage before production |
| Computing ROI on-the-fly from live data | No pre-computation needed, always fresh | Expensive queries on every dashboard load; ROI formula changes require recalculation of all history; inconsistent numbers if underlying data changes mid-session | Never -- pre-compute and cache with explicit refresh timestamps |
| Single Supabase table for all analytics data (Zapier + Orq.ai + pipeline) | Simple schema, one query for dashboard | Different data sources have different schemas, update frequencies, and reliability levels; impossible to diagnose which source is stale | Never -- use separate tables per source with a unified view layer |
| Using `any` types for scraped Zapier data | Fast iteration when scraper shapes are uncertain | Runtime errors when shape changes; no editor support; validation failures surface in production | Only during scraper prototyping; add Zod schemas before merging to main |
| Skipping visual regression tests during redesign | Faster redesign velocity | Regressions in existing pages discovered by users, not developers | Never once the redesign involves shared components or layout changes |

---

## Integration Gotchas

Common mistakes when connecting to external services in V6.0.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Supabase Auth + Azure AD** | Using SAML SSO and expecting automatic account linking with existing email/password users | Use Azure as OAuth provider (`auth-azure`), configure single-tenant with your Azure AD tenant ID, verify all existing users have confirmed emails before enabling |
| **Supabase Auth + Azure AD** | Leaving the Azure tenant URL as `common` (default multi-tenant), allowing any Microsoft account to log in | Set Azure Tenant URL to `https://login.microsoftonline.com/<your-tenant-id>` in Supabase Auth provider settings |
| **Supabase Auth + Azure AD** | Not handling the case where a user signs in with Azure but is not in the `project_members` table | Add a post-login check: if user exists in `auth.users` but has zero `project_members` rows, redirect to an "access pending" page instead of an empty dashboard |
| **Zapier Scraper + Browserless.io** | Creating a new browser session for every scrape, triggering repeated logins | Use session reuse pattern: `context.storageState()` saved to Supabase `settings` table, restored on next run. Check validity with `isSessionValid()` before scraping. |
| **Zapier Scraper + Browserless.io** | Using `networkidle` to wait for Zapier's SPA dashboard to load | Use `domcontentloaded` + explicit wait for key data selectors (e.g., `page.waitForSelector('[data-testid="task-count"]')` or equivalent text-based selector) |
| **Zapier Scraper + Browserless.io** | Not handling Zapier 2FA/re-authentication prompts | Implement the two-call pattern from `docs/browserless-patterns.md`: detect 2FA page, save challenge state, notify admin, resume after code entry |
| **Orq.ai Analytics** | Calling the Orq.ai analytics API on every dashboard page load | Cache analytics data in Supabase with a refresh interval (every 15 minutes). Use `stale-while-revalidate` pattern: serve cached data immediately, refresh in background |
| **Orq.ai Analytics** | Not including `user_id` in metadata, making per-project cost attribution impossible | Ensure all Orq.ai agent calls include `metadata: { user_id, project_id }` so analytics can be aggregated per project |
| **Orq.ai Analytics** | Assuming the Orq.ai API returns all historical data in a single call | Orq.ai analytics may have pagination limits. Implement cursor-based pagination and incremental sync (store last sync timestamp, fetch only new data) |

---

## Performance Traps

Patterns that work at small scale but fail as the dashboard grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all projects with all metrics on dashboard page load | Page load > 3s, blank screen while data fetches | Server-side render summary stats, lazy-load per-project details on scroll/click. Use React Suspense with streaming. | >20 projects with metrics from 3 data sources |
| Running Zapier scraper synchronously in an API route | Vercel function timeout (10s free, 60s pro); scraper needs 20-40s | Trigger scraper via Inngest function (durable, 5+ minute timeout). Store results in Supabase. Dashboard reads from cache. | Always -- scraping is inherently slow |
| Fetching fresh data from all 3 sources (pipeline DB, Zapier cache, Orq.ai cache) on every dashboard render | N+1 query pattern, each source adds 50-200ms latency | Pre-aggregate into a `dashboard_metrics` materialized view or summary table. Refresh on a schedule (Inngest cron) or on data change triggers. | >10 projects, 3 data sources |
| Storing granular time-series data (every Zapier execution, every Orq.ai call) without aggregation | Database grows unbounded, queries slow, dashboard charts lag | Store raw data for 30 days, aggregate into daily/weekly buckets for historical views. Supabase pg_cron for scheduled aggregation. | >1000 data points per project per month |

---

## Security Mistakes

Domain-specific security issues for V6.0.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Zapier login credentials in plaintext in Supabase `settings` table | Credential exposure if Supabase is compromised; violates security best practices | Use Supabase Vault for sensitive credentials, or encrypt at rest with a key stored in Vercel environment variables. Never store plaintext passwords. |
| Azure AD token stored client-side without proper expiry handling | Expired tokens cause silent auth failures; users see random logouts | Supabase handles token refresh automatically via `@supabase/ssr`. Do NOT manually store or manage Azure tokens -- let Supabase Auth handle the full lifecycle. |
| Dashboard API routes returning data without checking project membership | Any authenticated user can view any project's metrics | All dashboard data queries must filter through `project_members` RLS policies (client-side) or explicit membership checks (service-role queries). Use existing RLS pattern from `schema.sql`. |
| Scraper error screenshots containing Zapier dashboard data uploaded to a public storage bucket | Sensitive analytics data visible to anyone with the signed URL | Use short-lived signed URLs (1 hour, not 24 hours) for error screenshots. Consider a private bucket with RLS-restricted access. |
| Service role key used in client-side code for dashboard queries | Full database access exposed to the browser | Dashboard queries must use the anon key with RLS. Service role key is ONLY for server-side operations (Inngest functions, API routes with explicit auth checks). |

---

## UX Pitfalls

Common user experience mistakes for executive dashboards.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dashboard with 15+ KPIs visible simultaneously | Information overload; executives cannot identify what matters; decision paralysis | 3-5 top-level KPIs visible on load. Drill-down for details. A great executive dashboard answers ONE question at a glance: "Are our automations healthy and valuable?" |
| Showing data without timestamps | Executives make decisions based on stale data without knowing it; 67% of users lose confidence in dashboards with undated data | Every data tile shows "Last updated: 5 min ago" or "Data from: Mar 26, 08:00." If data is stale (>1 hour for scraped data), show a warning badge. |
| Pie charts for comparing automation types | Small categories invisible; percentages hard to compare visually | Horizontal bar charts for comparisons. Reserve pie charts only for 2-3 category splits. |
| ROI numbers without context | "340% ROI" means nothing without knowing the baseline, time period, and what is included | Show ROI with: time period, baseline comparison, measured vs estimated indicator, and a one-line explanation ("Based on 150 manual hours saved vs. EUR 200/month automation cost") |
| Status badges that use only color to indicate state | Color-blind users (8% of males) cannot distinguish red/green status | Use icon + color + text: a red circle with X icon and "Failed" text, not just a red dot |
| Navigation that does not highlight current page | Executives click the same nav item repeatedly, confused about where they are | Active sidebar item should be visually distinct. Already using shadcn sidebar -- ensure active state styling is prominent in the redesign. |
| Dense tables for project lists in executive view | Executives scan, they don't read tables; dense data is ignored | Card-based layout with visual status indicators, sparkline charts for trends, and one-click drill-down. Tables for detail views only. |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **SSO Login:** Login works, but existing email/password users get duplicate accounts -- verify identity linking with a real test user who has existing data
- [ ] **Zapier Scraper:** Data appears on dashboard, but check: does it handle Zapier login session expiry? What happens when selectors break? Is there a staleness indicator?
- [ ] **Dashboard Metrics:** Numbers render correctly, but are they refreshed? Check `updated_at` timestamps. Verify that the refresh mechanism (Inngest cron) is actually running.
- [ ] **ROI Calculations:** ROI shows a number, but verify: does it clearly separate measured from estimated? Does the calculation explanation survive CFO scrutiny?
- [ ] **Automated Status:** Status monitoring suggests transitions, but verify: can it NEVER auto-apply without user confirmation? Test edge case: what happens when scraper data suggests "live" but project is intentionally paused?
- [ ] **UI Redesign:** New design looks great on the dashboard page, but check: did the pipeline runner break? Is the agent graph still functional? Do all form inputs still work? Test on mobile viewport.
- [ ] **Azure AD Tenant Restriction:** SSO works, but verify: can a personal Microsoft account (`@outlook.com`) log in? If yes, tenant restriction is misconfigured.
- [ ] **Data Freshness Indicators:** Dashboard shows "Last updated" timestamps, but verify: do they update when data actually refreshes, or are they just showing `created_at` from the cache row?
- [ ] **Empty States:** Dashboard handles 50 projects well, but what does it show for a new company with zero automations? Verify empty states for every data section.
- [ ] **Error Recovery:** Zapier scraper fails -- does the dashboard show an error, or does it show stale data without indication? The difference matters for executive trust.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate SSO accounts created | MEDIUM | Query `auth.users` for duplicate emails. Merge accounts by updating `project_members` to point to the SSO account. Delete the orphaned account. Requires careful handling of foreign key references in `pipeline_runs`, `pipeline_steps`, `approval_requests`, etc. |
| Zapier scraper broken by UI change | LOW | Scraper stores raw HTML -- analyze stored HTML to identify new selectors. Update selector config (should be in a config file or DB, not hardcoded). Re-run scraper. Historical gap filled from stored raw data. |
| ROI numbers questioned by executives | MEDIUM | Add "methodology" link to each ROI card explaining the calculation. Retroactively separate measured vs. estimated metrics. May require data model migration to add `measurement_type` column. |
| Automated status override caused confusion | LOW | Add `status_history` table to track all changes with `changed_by` (user vs. system). Revert incorrect status. Announce that automated status is now suggestion-only. |
| UI redesign broke existing page | LOW-MEDIUM | If using feature flags: revert the flag. If not: `git revert` the redesign commit(s) for the affected shared component. This is why bottom-up migration is critical -- shared components should be changed last. |
| Stale dashboard data shown to executives | LOW | Add prominent "Data may be outdated" banner. Trigger manual refresh. Fix the underlying cron/scraper issue. Trust recovery takes longer than the technical fix. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicate SSO accounts | O365 SSO phase | Create test user with email/password, then sign in via Azure AD. Verify single account in `auth.users`. Check `auth.identities` shows both providers linked to one user ID. |
| Zapier scraper fragility | Data Integration phase (Zapier scraper) | Intentionally change one selector to invalid value. Verify: scraper detects failure, falls back to alternative selector, dashboard shows staleness warning. |
| Misleading ROI numbers | Executive Dashboard phase (metrics design) | Show dashboard to a finance-minded stakeholder. Ask "do you trust these numbers?" If they ask "how is this calculated?" and the answer is clear and accessible, it passes. |
| UI redesign regressions | UI Redesign phase (migration strategy) | Before any redesign work: screenshot every page at 3 viewports (mobile, tablet, desktop). After each page redesign: re-screenshot all pages, diff automatically, zero unexpected changes on non-target pages. |
| Automated status override | Project Model & Status Monitoring phase | Set a project to "testing" manually, then trigger the automated monitor with data that suggests "live." Verify: suggestion notification created, status NOT changed, `status_locked` flag respected. |
| Multi-source data staleness | Data Integration phase (aggregation layer) | Pause the Inngest refresh cron. Load dashboard after 2 hours. Verify: each data tile shows a stale warning with last-updated timestamp. No tile shows fresh-looking data when the data is hours old. |
| Azure tenant misconfiguration | O365 SSO phase | Attempt login with a personal `@outlook.com` account. Verify: login is rejected with clear error message, not allowed through. |
| Dashboard overload | Executive Dashboard phase (UI design) | Load dashboard and count visible KPIs above the fold. If more than 5, redesign. Ask a non-technical colleague "what is this dashboard telling you?" -- they should answer in one sentence. |
| Scraper session expiry | Data Integration phase (Zapier scraper) | Clear stored session state. Run scraper. Verify: detects expired session, triggers re-auth flow (or creates admin notification for 2FA), does not crash or return empty data silently. |

---

## Phase-Specific Warnings

Consolidated view of which phases carry the highest pitfall density.

| Phase Topic | Likely Pitfalls | Risk Level | Mitigation |
|-------------|----------------|------------|------------|
| O365 SSO | Duplicate accounts, tenant misconfiguration, unverified email linking failures | HIGH | Test with real users who have existing accounts. Use OAuth not SAML. Verify tenant restriction. |
| Zapier Browser Scraper | Session expiry, selector breakage, silent data failures, 2FA interrupts | HIGH | Multiple selector strategies, data validation layer, health checks, session reuse, raw HTML storage |
| Executive Dashboard Metrics | Misleading ROI, vanity metrics, information overload, missing timestamps | HIGH | Measured vs. estimated separation, user-provided baselines, 3-5 KPIs max, prominent timestamps |
| UI Redesign | Regression on existing pages, shared component coupling, inconsistent migration state | MEDIUM | Bottom-up migration, feature flags, visual regression testing, parallel route groups |
| Automated Status Monitoring | False transitions, manual override conflicts, notification fatigue | MEDIUM | Suggest-not-apply pattern, `status_locked` flag, no backward auto-transitions |
| Project Model Extension | Schema migration breaking existing queries, RLS policy gaps for new columns | LOW-MEDIUM | Additive-only migrations (new columns with defaults), test all existing RLS policies after schema changes |
| Data Aggregation Layer | Stale joins between sources, inconsistent timestamps, missing data gaps | MEDIUM | Per-source tables, unified view with staleness metadata, TTL-based cache invalidation |

---

## Sources

- [Supabase Identity Linking Documentation](https://supabase.com/docs/guides/auth/auth-identity-linking) -- SAML exclusion from automatic linking, OAuth auto-linking behavior
- [Supabase Azure (Microsoft) Social Login](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- OAuth vs SAML configuration, tenant URL setup
- [Supabase SAML SSO Documentation](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml) -- SAML 2.0 protocol support, attribute mapping
- [GitHub Discussion: Azure AD Single-Tenant Support](https://github.com/orgs/supabase/discussions/1071) -- tenant restriction configuration
- [GitHub Discussion: SSO Identity Linking Flag](https://github.com/orgs/supabase/discussions/42144) -- community discussion on SAML linking limitations
- [Sigma Computing: Metrics That Mislead](https://www.sigmacomputing.com/blog/metrics-that-mislead) -- vanity metrics, false precision in dashboards
- [Smashing Magazine: UX Strategies for Real-Time Dashboards](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/) -- data freshness indicators, timestamp importance
- [Capably.ai: The Real ROI of AI Automation](https://www.capably.ai/resources/roi-of-ai) -- 39% of executives report difficulty measuring AI outcomes
- [CX Today: Automation Metrics Your Dashboard Isn't Showing](https://www.cxtoday.com/ai-automation-in-cx/top-automation-metrics-for-cx-2025/) -- accuracy as key metric, hidden costs of poor automation
- [Browserless.io Session Management](https://www.browserless.io/blog/session-management) -- session reuse, TTL configuration
- [Existing codebase: `docs/browserless-patterns.md`](docs/browserless-patterns.md) -- session reuse, 2FA pattern, error handling patterns
- [Existing codebase: `docs/supabase-patterns.md`](docs/supabase-patterns.md) -- JSONB double-encoding, service role patterns
- [Existing codebase: `supabase/schema.sql`](supabase/schema.sql) -- current project model, RLS policy structure
- [shadcn/ui Migration Discussion](https://github.com/coder/coder/issues/18993) -- incremental component migration strategy
- [Next.js Pages to App Router Migration Checklist](https://eastondev.com/blog/en/posts/dev/20251218-nextjs-pages-to-app-router-migration/) -- pitfall checklist for live app migration

---
*Pitfalls research for: V6.0 Executive Dashboard & UI Revamp*
*Researched: 2026-03-26*
