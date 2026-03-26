# Technology Stack

**Project:** Agent Workforce V6.0 -- Executive Dashboard & UI Revamp
**Researched:** 2026-03-26
**Scope:** NEW stack additions for V6.0 only. Does not re-research existing validated stack (Next.js 16, Supabase, Inngest, React Flow, Playwright-core, Claude API, Orq.ai MCP, shadcn/ui, Tailwind CSS 4, Vitest, TypeScript, Zod). See V4.0 STACK.md for those.

## Existing Stack (DO NOT CHANGE)

These are locked and validated. Listed here for integration context only.

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js (App Router) | `^16.1` | Full-stack framework on Vercel |
| React | `19.2` | UI framework |
| @supabase/supabase-js | `^2.99` | Auth, DB, Realtime, Storage |
| @supabase/ssr | `^0.9` | Server-side auth with cookie handling |
| inngest | `^3.52` | Durable pipeline orchestration |
| @xyflow/react | `^12.10` | Node graph visualization |
| radix-ui | `^1.4` | Accessible UI primitives |
| shadcn (CLI) | `^4.0` | Component generation (radix-nova style) |
| Tailwind CSS | `^4` | Utility-first CSS |
| lucide-react | `^0.577` | Icon library |
| sonner | `^2.0` | Toast notifications |
| zod | `^4.3` | Schema validation |
| Vitest | `^4.1` | Testing |
| TypeScript | `^5` | Type safety |

## New Stack Additions for V6.0

### 1. Charts & Data Visualization -- Recharts via shadcn/ui Charts

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| recharts | `^3.8` | Charting engine (area, bar, line, pie, radar) | shadcn/ui charts are built on Recharts. V3.8 is the latest (March 2026). The project already uses shadcn/ui (radix-nova style), so using shadcn's chart components gives us consistent theming, dark mode support, and CSS variable integration for free. No new design system to learn. |

**Why Recharts via shadcn, not Tremor or standalone Recharts:**

- **Tremor** was considered (purpose-built for dashboards with KPI cards, charts, and tables). Rejected because: (1) Tremor is a wrapper around Recharts anyway -- adds an abstraction layer without adding value when we already have shadcn/ui components for cards, tables, and layout. (2) Tremor's high-level API limits customization for executive branding needs. (3) Adding Tremor alongside shadcn creates two competing component systems.
- **Standalone Recharts** was considered. Rejected because shadcn's `<ChartContainer>`, `<ChartTooltip>`, and `<ChartLegend>` wrappers already provide theming via CSS variables, automatic light/dark mode, and consistent styling with our existing components. No reason to build custom chart theming.
- **Nivo, Victory, Visx** -- overkill. Recharts handles all our chart types (area trends, bar comparisons, line timelines, pie distributions) with React 19 compatibility.

**React 19 compatibility note:** Recharts 3.x requires overriding the `react-is` dependency to match React 19. This is a known issue tracked in shadcn-ui/ui#7669 and shadcn-ui/ui#9892. The override is simple:

```json
// package.json
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```

**Chart types needed for the executive dashboard:**

| Chart Type | Use Case | shadcn Component |
|------------|----------|------------------|
| Area chart | ROI trends over time, cost trends | `npx shadcn add chart` (area variants) |
| Bar chart | Agent performance comparison, monthly usage | bar variants |
| Line chart | Latency trends, activity over time | line variants |
| Pie/Donut | Cost distribution by automation type | pie variants |
| Radial | Health scores, reliability percentages | radial variants |

**Installation:**

```bash
cd web
npm install recharts@^3.8
npx shadcn add chart
```

The `npx shadcn add chart` command scaffolds a `components/ui/chart.tsx` with `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, and `ChartLegendContent` -- all pre-themed with the project's CSS variables.

**Confidence:** HIGH -- shadcn/ui official docs confirm Recharts v3 support. React 19 override is documented.

---

### 2. Azure AD / Microsoft Entra ID SSO -- Supabase OAuth Provider

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| (no new package) | -- | Azure OAuth via Supabase Auth | Supabase has a built-in Azure (Microsoft) OAuth provider. No additional npm packages needed. Configuration is done in Supabase Dashboard + Azure Entra ID portal. The existing `@supabase/ssr` and `@supabase/supabase-js` packages already support `signInWithOAuth()`. |

**Why Supabase OAuth, not SAML SSO or NextAuth:**

- **SAML SSO** was considered (Supabase supports SAML 2.0 for Azure). Rejected because: SAML requires Team or Enterprise plan. OAuth social login works on all plans including Free/Pro. For 5-15 users with O365 accounts, OAuth is the right choice.
- **NextAuth/Auth.js** was considered. Rejected because: the app already uses Supabase Auth everywhere (middleware, server client, browser client, invite flow). Adding NextAuth would create two auth systems. Supabase's built-in Azure provider handles the same flow with zero additional dependencies.

**Integration approach:**

The existing auth infrastructure (middleware.ts, `/auth/callback/route.ts`, login page) already supports the OAuth code exchange pattern via `exchangeCodeForSession()`. Adding Azure SSO requires:

1. **Azure Entra ID portal:** Register app, configure redirect URI (`{SITE_URL}/auth/callback`), get client ID + secret
2. **Supabase Dashboard:** Enable Azure provider, paste client ID + secret, set tenant URL (`https://login.microsoftonline.com/{tenant-id}`)
3. **Login page:** Add "Sign in with Microsoft" button calling `supabase.auth.signInWithOAuth({ provider: 'azure', options: { redirectTo: '{SITE_URL}/auth/callback', scopes: 'email' } })`
4. **No middleware changes needed** -- the existing `getUser()` call already validates any Supabase session, regardless of provider

**Tenant restriction:** Configure the Azure tenant URL in Supabase to restrict login to the Moyne Roberts Microsoft 365 tenant only. Do NOT use the `common` tenant (allows any Microsoft account).

**Security: `xms_edov` claim:** Configure the optional `xms_edov` (email domain owner verified) claim in the Azure app registration. This lets Supabase Auth verify that the email address is actually verified by Microsoft, preventing spoofed emails.

**Plan requirement:** Social login (OAuth) is available on all Supabase plans. SAML SSO requires Team/Enterprise. Use OAuth.

**Confidence:** HIGH -- Supabase official docs confirm Azure OAuth provider support. The existing callback route already handles the code exchange.

---

### 3. Orq.ai Analytics Data -- @orq-ai/node SDK + Browser Scraper Fallback

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @orq-ai/node | `^4.4` (pin exact: `4.4.9`) | Orq.ai TypeScript SDK for deployment data, traces, agent listing | SDK is in beta with potential breaking changes. Pin to exact version. Provides typed access to deployments, contacts, and traces. |

**Critical finding: Orq.ai does NOT expose an analytics REST API.**

Research confirmed that Orq.ai's analytics (usage, cost, latency, agent performance) are available ONLY through the web dashboard UI. There is no documented REST API endpoint for pulling aggregated analytics data programmatically. The SDK supports:

- `client.deployments.invoke()` -- invoke deployments
- `client.deployments.list()` -- list deployments
- `client.deployments.getConfig()` -- get deployment config
- Trace logging via OpenTelemetry (`/v2/otel` endpoint)
- `add_metrics()` -- add custom metrics TO deployments

But there are NO endpoints to READ aggregated analytics (total cost, latency p50/p99, token usage over time, error rates).

**Solution: Dual data strategy:**

1. **Direct SDK data (what's available programmatically):**
   - Agent/deployment inventory via `deployments.list()`
   - Agent configuration and status
   - Custom metrics attached to deployments

2. **Browser scraper for analytics (Browserless.io):**
   - Schedule Inngest cron to run Playwright scripts on Browserless.io
   - Scrape the Orq.ai Studio dashboard pages for: total requests, total cost, total tokens, latency (p50/p99), error rate
   - Parse the scraped data and store snapshots in Supabase
   - This is the same pattern already used for Zapier analytics scraping -- reuse the infrastructure

**Why not OpenTelemetry export:** The OTEL endpoint (`/v2/otel`) is for SENDING traces TO Orq.ai, not for reading them back. It's an ingestion endpoint, not a query endpoint.

**Installation:**

```bash
cd web
npm install @orq-ai/node@4.4.9
```

**Confidence:** MEDIUM -- SDK capabilities confirmed via npm + GitHub. The absence of an analytics API is a "negative claim" -- verified against official docs, SDK source, and multiple search queries. Flag for re-verification when starting implementation; Orq.ai may add analytics endpoints.

---

### 4. Dark Mode & Theme Switching -- next-themes

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| next-themes | `^0.4.6` | Theme provider for light/dark mode switching | shadcn/ui's official recommendation for dark mode in Next.js. The project already has `.dark` CSS variables defined in globals.css (lines 85-117) but no theme provider or toggle. next-themes adds system preference detection, persistence, and zero-flash switching. |

**Why this is needed for V6.0:**

The executive dashboard needs a polished dark mode. The CSS variables are already defined (the `globals.css` has both `:root` and `.dark` themes), but there is no runtime theme switching. The `suppressHydrationWarning` prop is already on the `<html>` tag (layout.tsx line 28), which is required by next-themes.

**Integration:**

1. Create `components/theme-provider.tsx` -- wraps `NextThemesProvider` with `"use client"`
2. Add `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>` in root layout
3. Add theme toggle component (shadcn has one: `npx shadcn add mode-toggle` or build manually with `useTheme()` hook)

**Installation:**

```bash
cd web
npm install next-themes@^0.4.6
```

**Confidence:** HIGH -- shadcn/ui official docs prescribe next-themes for dark mode in Next.js.

---

### 5. Date Formatting -- date-fns

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| date-fns | `^4.1` | Date formatting, relative time, ranges for dashboard metrics | Tree-shakeable (only import what you use), functional API, works with native Date objects. The dashboard needs "3 days ago", "March 2026", "Last 30 days" type formatting. date-fns is 18KB gzipped but tree-shakes to 2-5KB for typical usage. |

**Why date-fns, not dayjs:**

- dayjs is 2KB smaller at baseline but requires plugins for timezone/locale support that close the gap
- date-fns is fully tree-shakeable (import only `format`, `formatDistanceToNow`, `subDays` etc.)
- TypeScript-first with excellent type safety
- No global state or mutation -- pure functions
- Already the shadcn/ui ecosystem recommendation (shadcn-ui/ui Discussion #4817)

**Installation:**

```bash
cd web
npm install date-fns@^4.1
```

**Confidence:** HIGH -- well-established library, actively maintained, standard choice.

---

### 6. Number & Currency Formatting -- Intl API (no package needed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Intl.NumberFormat | (built-in) | Currency, percentages, compact numbers for KPIs | Native browser/Node.js API. No package needed. Handles EUR formatting ("EUR 1.234,56"), compact notation ("1.2K requests"), percentages ("87.3%"). |

**Why no `numeral.js` or `accounting.js`:**

The built-in `Intl.NumberFormat` handles all executive dashboard formatting needs:

```typescript
// EUR currency
new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(12345.67)
// => "EUR 12.345,67"

// Compact numbers for KPIs
new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(15234)
// => "15.2K"

// Percentages
new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(0.873)
// => "87.3%"
```

No additional dependency needed. Build a small `lib/format.ts` utility with typed helper functions.

**Confidence:** HIGH -- native API, zero-dependency.

---

### 7. Automated Status Monitoring -- Inngest Cron (no new package)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| inngest (existing) | `^3.52` | Scheduled cron functions for status monitoring and data scraping | Inngest already supports cron schedules natively. No new packages needed. Define `createFunction({ id: "...", triggers: { cron: "TZ=Europe/Amsterdam 0 8,12,17 * * *" } })` for three scraping runs per day. |

**Functions to schedule:**

| Function | Schedule | Purpose |
|----------|----------|---------|
| `sync-orqai-analytics` | `0 8,12,17 * * *` (3x/day) | Scrape Orq.ai Studio dashboard via Browserless.io, store metrics snapshot |
| `sync-zapier-analytics` | `0 8,12,17 * * *` (3x/day) | Scrape Zapier dashboard via Browserless.io, store task usage + Zap run data |
| `update-project-statuses` | `0 */4 * * *` (every 4h) | Check latest activity per project, update status (idea -> building -> testing -> live -> stale) |
| `compute-roi-metrics` | `0 6 * * 1` (weekly Monday) | Aggregate time savings, cost savings, ROI calculations across all projects |

**Why Inngest cron, not Vercel cron:**

- Vercel cron is limited to the Vercel Pro timeout (60s). Browser scraping can take 30-45s, leaving no margin.
- Inngest cron supports multi-step functions with `step.run()` -- each step gets its own timeout. A scraper function can have: step 1 (navigate + scrape), step 2 (parse + validate), step 3 (store in Supabase).
- Inngest provides automatic retries, logging, and failure alerting out of the box.
- Already in the stack -- no new infrastructure.

**Confidence:** HIGH -- Inngest cron is documented and already used in the project.

---

## Typography & Font Strategy (No New Packages)

The project currently uses **Geist** and **Geist Mono** (loaded via `next/font/google` in layout.tsx). For the executive dashboard:

**Keep Geist.** Do not switch to Inter.

Rationale:
- Geist is Vercel's typeface, designed for the exact kind of professional UI this project builds
- Geist is influenced by Inter but with slightly rounder curves and better character spacing -- more modern feel
- Already loaded and configured via `--font-geist-sans` and `--font-geist-mono` CSS variables
- Switching to Inter would require touching every font reference and loses the Next.js-native integration
- For executive audiences, the difference between Geist and Inter is negligible; both are excellent screen-optimized sans-serifs

**What to change for executive polish:**
- Increase base font weight for headings (use `font-semibold` / `font-bold` more)
- Tighten letter spacing on large display text (`tracking-tight`)
- Establish a clear type scale in the design system: display (36px), heading (24px), subheading (18px), body (14px), caption (12px)
- Use Geist Mono exclusively for metrics/numbers on KPI cards -- gives them a data-driven feel

---

## Color Palette Strategy (No New Packages)

The current theme uses neutral/grayscale oklch colors. For V6.0's executive redesign:

**Extend the existing shadcn CSS variable system.** Do not add a color library.

The globals.css already defines `--chart-1` through `--chart-5` with a blue-to-indigo gradient. For the executive dashboard:

1. **Keep the blue-indigo chart palette** -- professional, data-focused, accessible
2. **Add semantic status colors** as CSS variables:
   - `--status-live`: green (projects in production)
   - `--status-building`: blue (projects in development)
   - `--status-testing`: amber (projects in test)
   - `--status-idea`: gray (project ideas)
   - `--status-stale`: red (inactive projects)
3. **Add ROI/metric colors:**
   - `--metric-positive`: green (savings, improvements)
   - `--metric-negative`: red (costs, regressions)
   - `--metric-neutral`: gray (unchanged)

All in oklch format for perceptual consistency, matching the existing theme.

---

## What NOT to Add

| Technology | Why NOT |
|------------|---------|
| **Tremor** | Adds competing component system alongside shadcn. Recharts via shadcn charts does everything Tremor does with better integration. |
| **D3.js directly** | Overkill. Recharts abstracts D3 with a React-native API. No custom SVG visualizations needed. |
| **NextAuth / Auth.js** | Supabase Auth already handles Azure OAuth. Adding NextAuth creates two auth systems. |
| **TanStack Query / SWR** | Dashboard data is server-rendered (RSC) or fetched via server actions. No client-side cache layer needed for 5-15 users. If polling is needed later, Supabase Realtime or simple `setInterval` + `fetch` suffices. |
| **Framer Motion** | The existing `tw-animate-css` handles transitions. Framer Motion adds 30KB+ for animation capabilities the executive dashboard doesn't need. |
| **numeral.js / accounting.js** | `Intl.NumberFormat` covers all formatting needs natively. Zero-dependency. |
| **dayjs / moment** | date-fns is tree-shakeable and TypeScript-first. dayjs adds minimal value over date-fns. moment is deprecated. |
| **Chart.js** | Canvas-based, not React-native. Recharts is the standard for React dashboards and already integrated into shadcn/ui. |
| **Prisma / Drizzle** | Supabase JS client handles all database access. Adding an ORM for 5-15 users is unnecessary complexity. |
| **Redis / Upstash** | No caching layer needed at this scale. Supabase queries are fast enough for dashboard data. |
| **Zapier SDK (@zapier/zapier-sdk)** | Not needed for V6.0. Zapier analytics come from browser scraping, not the SDK. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Charts | Recharts 3.x via shadcn | Tremor | Competing component system, wraps Recharts anyway |
| Charts | Recharts 3.x via shadcn | Nivo | Heavier, less React-native feel, no shadcn integration |
| SSO | Supabase Azure OAuth | SAML SSO | Requires Team/Enterprise plan, OAuth works on all plans |
| SSO | Supabase Azure OAuth | NextAuth | Creates second auth system alongside existing Supabase Auth |
| Theme | next-themes | Manual `data-theme` | next-themes handles system preference, persistence, flash prevention |
| Dates | date-fns | dayjs | Tree-shaking, TypeScript-first, shadcn ecosystem standard |
| Analytics data | Browser scraping | Orq.ai API | API does not exist for analytics read-back (verified) |
| Cron | Inngest cron | Vercel cron | Inngest supports multi-step, retries, longer timeouts |
| Numbers | Intl.NumberFormat | numeral.js | Native API, zero dependencies |

---

## Installation Summary

```bash
cd web

# New dependencies for V6.0
npm install recharts@^3.8 next-themes@^0.4.6 date-fns@^4.1 @orq-ai/node@4.4.9

# Add shadcn chart component
npx shadcn add chart

# React 19 compatibility override (add to package.json)
# "overrides": { "react-is": "^19.0.0" }
```

**Total new packages: 4** (recharts, next-themes, date-fns, @orq-ai/node)
**Total new shadcn components: 1** (chart)
**Bundle size impact:** ~45KB gzipped (recharts ~35KB, next-themes ~3KB, date-fns ~5KB tree-shaken, @orq-ai/node server-only)

---

## Integration Points

### Data Flow Architecture

```
Orq.ai Studio (dashboard) ──[Browserless.io scraper]──> Supabase (orqai_metrics)
Zapier (dashboard)         ──[Browserless.io scraper]──> Supabase (zapier_metrics)
Agent Workforce (DB)       ──[direct queries]──────────> Supabase (projects, pipeline_runs)
                                                              |
                                                              v
                                                    Next.js RSC (aggregation)
                                                              |
                                                              v
                                                    Recharts (visualization)
```

### Auth Flow (with Azure SSO addition)

```
Login Page
  ├── Email/Password ──> supabase.auth.signInWithPassword() ──> session
  └── Microsoft SSO  ──> supabase.auth.signInWithOAuth({ provider: 'azure' })
                           ──> Azure Entra ID login
                           ──> /auth/callback (existing route)
                           ──> exchangeCodeForSession() (existing code)
                           ──> session
```

### Scraper Scheduling

```
Inngest Cron ──> Browserless.io
  step.run("navigate")     → Open Orq.ai/Zapier dashboard
  step.run("authenticate") → Login with stored session (Supabase storage)
  step.run("scrape")       → Extract metrics from dashboard DOM
  step.run("store")        → Insert snapshot into Supabase metrics table
```

---

## Sources

- [shadcn/ui Charts Documentation](https://ui.shadcn.com/docs/components/radix/chart)
- [shadcn/ui Area Charts Gallery](https://ui.shadcn.com/charts/area)
- [Recharts v3.8 on npm](https://www.npmjs.com/package/recharts)
- [Recharts v3 shadcn compatibility issue](https://github.com/shadcn-ui/ui/issues/7669)
- [Supabase Azure (Microsoft) OAuth](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase SSO with Azure AD (SAML)](https://supabase.com/docs/guides/platform/sso/azure)
- [Supabase SAML 2.0 SSO docs](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [Orq.ai Dashboards and Analytics](https://docs.orq.ai/docs/dashboards-and-analytics)
- [Orq.ai Analytics docs](https://docs.orq.ai/docs/analytics)
- [Orq.ai Traces docs](https://docs.orq.ai/docs/traces)
- [@orq-ai/node SDK on npm](https://www.npmjs.com/package/@orq-ai/node)
- [@orq-ai/node GitHub](https://github.com/orq-ai/orq-node)
- [next-themes on npm](https://www.npmjs.com/package/next-themes)
- [shadcn/ui Dark Mode with Next.js](https://ui.shadcn.com/docs/dark-mode/next)
- [Inngest Cron/Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions)
- [date-fns vs dayjs discussion](https://github.com/shadcn-ui/ui/discussions/4817)
- [Supabase Social Login docs](https://supabase.com/docs/guides/auth/social-login)
- [Supabase Pricing](https://supabase.com/pricing)
