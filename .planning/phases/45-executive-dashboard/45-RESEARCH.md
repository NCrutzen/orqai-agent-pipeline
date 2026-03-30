# Phase 45: Executive Dashboard - Research

**Researched:** 2026-03-30
**Domain:** Next.js server components + Recharts + Inngest cron + Supabase aggregation for executive KPI dashboard
**Confidence:** HIGH

## Summary

Phase 45 builds an executive dashboard at `/executive` that provides CEO/CTO/CFO users a 360-degree overview of all automation activity across three data sources (Agent Workforce pipeline runs, Zapier browser scraper snapshots, Orq.ai REST API snapshots). The dashboard reads exclusively from a pre-computed `dashboard_snapshots` table populated by an Inngest cron function every 2 hours, achieving sub-100ms page loads by never querying external services on render.

The core technical work divides into three areas: (1) a new Supabase migration creating the `dashboard_snapshots` table and adding ROI baseline columns to `projects`, (2) a new Inngest cron function (`dashboard-aggregator`) that reads from `projects`, `pipeline_runs`, `pipeline_steps`, `zapier_snapshots`, and `orqai_snapshots` to compute and store aggregate metrics, and (3) a new Next.js server component page with 6 KPI cards, 4 tabbed drill-down sections using Recharts via shadcn chart components, and data freshness/trust indicators throughout.

The project already has the two upstream data collectors operational (Phase 44): `scrapeZapierAnalytics` running twice daily and `collectOrqaiAnalytics` running hourly. The existing snapshot tables (`zapier_snapshots`, `orqai_snapshots`) and the `pipeline_runs`/`pipeline_steps` tables provide all raw data needed. No chart library is installed yet -- Recharts 3.8.1 via `npx shadcn add chart` is the required addition.

**Primary recommendation:** Build in 3 waves: (1) schema migration + aggregator cron, (2) chart library install + dashboard page with KPI cards and tab structure, (3) drill-down chart content + period selector. This ordering ensures data flows before UI, and the aggregator can accumulate snapshots while the dashboard UI is being built.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 6 KPI cards in a 3x2 grid: Active Automations, Execution Throughput, Health Score (top row); Estimated Hours Saved, Estimated Financial Impact, Orq.ai Usage & Cost (bottom row)
- ROI baselines via per-project fields (`manual_minutes_per_task`, `task_frequency_per_month`, `hourly_cost_eur`) with global config defaults in `settings` table
- Estimated values use `~` prefix + `ESTIMATED` pill badge + hover tooltip
- 4 tabbed drill-down sections: Activity & Performance, Projects & Lifecycle, ROI & Cost, Source Status
- Dashboard aggregator Inngest cron runs every 2 hours, append-only `dashboard_snapshots` table
- Health Score formula: success rate 40% + error rate inverse 30% + data freshness 20% + latency threshold 10%
- Snapshot columns: `id` (UUID), `computed_at` (TIMESTAMPTZ), `period_start`/`period_end`, `metrics` (JSONB), `source_freshness` (JSONB)
- Retention: 90 days full, then 1/day; after 365 days 1/week
- Per-source staleness thresholds: Agent Workforce >1h, Zapier >24h, Orq.ai >6h
- When Zapier scraper validation = 'suspicious' or 'failed': aggregator uses last 'valid' snapshot + shows warning
- Period selector: Last 7 days, Last 30 days, This month, This quarter (default: Last 30 days)

### Claude's Discretion
- Chart library choice (Recharts via shadcn charts -- recommended)
- Exact JSONB schema for `dashboard_snapshots.metrics` field
- Whether to use Recharts directly or shadcn chart wrappers
- Dashboard page layout CSS (grid gap, responsive breakpoints)
- Exact card component structure (reuse shadcn Card or custom)
- Color palette for chart series (source colors for Pipeline vs Zapier vs Orq.ai)
- How the period selector interacts with snapshot queries
- Sidebar navigation item placement for "Executive Dashboard"
- Whether retention cleanup is a separate cron or part of aggregator

### Deferred Ideas (OUT OF SCOPE)
- ROI baseline agent (AI auto-sets baselines)
- Role-based dashboard views (CEO vs CFO vs CTO)
- Business unit / department tagging on projects
- Digital labor share (agent vs human workload %)
- Time-to-value metrics (needs Phase 46 `project_status_history`)
- Automation incidents table
- HITL override / acceptance rates
- PDF export
- Zapier Partner API replacement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EDASH-01 | KPI summary cards (total runs, success rate, active automations, time saved) | Aggregator computes from `pipeline_runs` + `zapier_snapshots` + `orqai_snapshots` + `projects`. KPI card component with shadcn Card + Badge. |
| EDASH-02 | Activity trend charts (runs over time, by source) | Stacked area chart via Recharts `AreaChart` with shadcn `ChartContainer`. Historical `dashboard_snapshots` rows power the time series. |
| EDASH-03 | Project status breakdown by lifecycle stage | Donut chart of project counts by status. Direct query from `projects` table grouped by `status` column. |
| EDASH-04 | ROI metrics clearly badged as estimates | Per-project baseline fields + global defaults. `~` prefix + `ESTIMATED` Badge. Tooltip explains formula. |
| EDASH-05 | Health indicators with traffic-light status | Health Score 0-100 computed in aggregator. Per-project health in table with green/yellow/red dot + text. |
| EDASH-06 | Sub-100ms load from pre-computed snapshots | `dashboard_snapshots` table with index on `computed_at DESC`. Server component reads via `LIMIT 1`. No external API calls on render. |
| DINT-06 | Dashboard aggregator combining all data sources | Inngest cron function reading from 5 tables, computing unified metrics JSONB, inserting into `dashboard_snapshots`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.1 | Charting engine (area, bar, line, pie) | shadcn chart components are built on Recharts. Already in the shadcn ecosystem. |
| shadcn chart | (generated) | ChartContainer, ChartTooltip, ChartLegend wrappers | Provides theming via CSS variables, consistent with existing shadcn components |
| date-fns | 4.1.0 | Date formatting, relative time, period calculations | Tree-shakeable, TypeScript-first, shadcn ecosystem standard |
| inngest | ^3.52.6 (existing) | Dashboard aggregator cron function | Already in stack, handles retries and multi-step functions |
| @supabase/supabase-js | ^2.99.1 (existing) | Database queries for aggregator and dashboard page | Already in stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intl.NumberFormat | (built-in) | Currency (EUR), percentages, compact numbers | KPI card values, chart tooltips, table cells |
| zod | ^4.3.6 (existing) | Validate JSONB metrics schema from snapshots | Parsing dashboard_snapshots.metrics field |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts via shadcn | Tremor | Competing component system alongside shadcn; wraps Recharts anyway |
| Recharts via shadcn | Nivo | Heavier, no shadcn integration, overkill for these chart types |
| date-fns | dayjs | date-fns is more tree-shakeable and TypeScript-first |
| Intl.NumberFormat | numeral.js | Native API, zero dependencies -- no package needed |

**Installation:**
```bash
cd web
npm install recharts@^3.8 date-fns@^4.1
npx shadcn add chart
```

**React 19 compatibility:** Recharts 3.x may need `react-is` override. Add to `web/package.json` if build errors occur:
```json
{
  "overrides": {
    "react-is": "^19.0.0"
  }
}
```

**Version verification:**
- recharts: 3.8.1 (verified via npm registry 2026-03-30)
- date-fns: 4.1.0 (verified via npm registry 2026-03-30)
- shadcn chart: generated component, no version -- part of shadcn CLI ^4.0.8

## Architecture Patterns

### Recommended Project Structure
```
web/
  app/(dashboard)/
    executive/
      page.tsx                    # Server component: fetches snapshots, renders dashboard
      loading.tsx                 # Skeleton loading state
  components/dashboard/
    kpi-card.tsx                  # Reusable KPI card (value, trend, label, estimated badge)
    kpi-grid.tsx                  # 3x2 grid of 6 KPI cards
    period-selector.tsx           # Client component: time range dropdown
    health-dot.tsx                # Green/yellow/red traffic light indicator
    estimated-badge.tsx           # ESTIMATED pill badge with tooltip
    activity-chart.tsx            # Stacked area chart (runs by source over time)
    success-rate-chart.tsx        # Line chart (success rate trend)
    project-health-table.tsx      # Sortable table with per-project health
    agent-metrics-table.tsx       # Per-agent Orq.ai table
    status-distribution-chart.tsx # Donut chart (projects by status)
    type-breakdown-chart.tsx      # Bar chart (projects by automation_type)
    roi-table.tsx                 # ROI by project table with ESTIMATED badges
    cost-trend-chart.tsx          # Line chart (cost per run over time)
    source-status-card.tsx        # Source health card (Agent Workforce / Zapier / Orq.ai)
  lib/dashboard/
    aggregator.ts                 # Core metric computation logic
    metrics-schema.ts             # Zod schema for dashboard_snapshots.metrics JSONB
    format.ts                     # Number/currency/percentage formatting helpers
    health-score.ts               # Health score computation (weighted formula)
    types.ts                      # TypeScript types for dashboard data
  lib/inngest/functions/
    dashboard-aggregator.ts       # Inngest cron: compute + store snapshots
  components/ui/
    chart.tsx                     # Generated by `npx shadcn add chart`
```

### Pattern 1: Append-Only Snapshot with JSONB Metrics
**What:** The `dashboard_snapshots` table uses append-only inserts with a single JSONB `metrics` column containing all KPI values, rather than individual columns per metric.
**When to use:** When the metric set is evolving and you want schema flexibility without migrations for every new metric.
**Why:** The CONTEXT.md specifies `metrics (JSONB)` and `source_freshness (JSONB)` columns. This allows the aggregator to add new metrics without schema changes. The tradeoff is that individual metric columns cannot be indexed -- but since the dashboard always reads the latest snapshot (single row), this is acceptable.

```typescript
// lib/dashboard/metrics-schema.ts
import { z } from "zod";

export const DashboardMetricsSchema = z.object({
  // Operational KPIs
  activeAutomations: z.number(),          // live projects + active zaps + orqai deployments
  executionThroughput: z.number(),        // total runs this period
  healthScore: z.number().min(0).max(100), // synthetic 0-100

  // Value KPIs
  estimatedHoursSaved: z.number(),
  estimatedFinancialImpact: z.number(),   // EUR
  orqaiTotalRequests: z.number(),
  orqaiTotalCost: z.number(),             // USD
  orqaiTotalTokens: z.number(),

  // Trend data (for comparing current vs previous period)
  previousPeriod: z.object({
    executionThroughput: z.number(),
    healthScore: z.number(),
    estimatedHoursSaved: z.number(),
    orqaiTotalCost: z.number(),
  }).optional(),

  // Breakdown data
  projectsByStatus: z.record(z.string(), z.number()),   // {"idea":2,"building":3,...}
  projectsByType: z.record(z.string(), z.number()),      // {"zapier-only":4,...}
  runsBySource: z.object({
    pipeline: z.number(),
    zapier: z.number(),
    orqai: z.number(),
  }),

  // Per-project health
  projectHealth: z.array(z.object({
    projectId: z.string(),
    name: z.string(),
    status: z.string(),
    lastRun: z.string().nullable(),
    successRate: z.number().nullable(),
    health: z.enum(["green", "yellow", "red"]),
  })),

  // Per-agent Orq.ai metrics
  agentMetrics: z.array(z.object({
    name: z.string(),
    requests: z.number(),
    latencyMs: z.number(),
    cost: z.number(),
    errorRate: z.number(),
  })).optional(),

  // ROI data
  roiByProject: z.array(z.object({
    projectId: z.string(),
    name: z.string(),
    estimatedHoursSaved: z.number(),
    estimatedEurImpact: z.number(),
    hasBaseline: z.boolean(),
  })),
  projectsWithBaselines: z.number(),
  totalProjects: z.number(),

  // Health score components (for tooltip)
  healthComponents: z.object({
    successRate: z.number(),
    errorRateInverse: z.number(),
    dataFreshness: z.number(),
    latencyScore: z.number(),
  }),
});

export const SourceFreshnessSchema = z.object({
  pipeline: z.object({
    lastRun: z.string().nullable(),
    stale: z.boolean(),
  }),
  zapier: z.object({
    lastScraped: z.string().nullable(),
    validationStatus: z.enum(["valid", "suspicious", "failed"]).nullable(),
    stale: z.boolean(),
    usingFallback: z.boolean(),    // true when using last valid instead of latest
    fallbackTimestamp: z.string().nullable(),
  }),
  orqai: z.object({
    lastCollected: z.string().nullable(),
    stale: z.boolean(),
  }),
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
export type SourceFreshness = z.infer<typeof SourceFreshnessSchema>;
```

### Pattern 2: Server Component with Parallel Snapshot Queries
**What:** The dashboard page is a Next.js server component that fetches the latest snapshot + historical rows + projects in parallel using `Promise.all`.
**When to use:** Any page that reads from pre-computed data in Supabase.
**Why:** Server components eliminate client-side loading states for initial render. Parallel queries minimize total fetch time.

```typescript
// app/(dashboard)/executive/page.tsx (simplified)
import { createClient } from "@/lib/supabase/server";

export default async function ExecutiveDashboard() {
  const supabase = await createClient();

  const [latestSnapshot, historicalSnapshots, projects] = await Promise.all([
    supabase
      .from("dashboard_snapshots")
      .select("metrics, source_freshness, computed_at")
      .order("computed_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("dashboard_snapshots")
      .select("metrics, computed_at")
      .order("computed_at", { ascending: false })
      .limit(90),  // ~90 days at 12 snapshots/day
    supabase
      .from("projects")
      .select("id, name, status, automation_type, executive_summary, manual_minutes_per_task, task_frequency_per_month, hourly_cost_eur")
  ]);

  // Render with data...
}
```

### Pattern 3: Client Component Period Selector with URL State
**What:** The period selector is a client component that writes the selected period to URL search params. The server component reads search params to filter snapshot queries.
**When to use:** When a filter needs to affect server-rendered data.
**Why:** URL state enables deep linking and shareable dashboard views. The period selector changes `?period=7d` which triggers a server re-render.

```typescript
// components/dashboard/period-selector.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
] as const;

export function PeriodSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") ?? "30d";

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams);
        params.set("period", value);
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODS.map((p) => (
          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Pattern 4: Inngest Cron Aggregator with Separate Compute + Write Steps
**What:** The aggregator function uses separate `step.run()` calls for computation vs storage.
**When to use:** Any Inngest function that does both reads and writes.
**Why:** If the write fails, Inngest retries only the write step (not the expensive computation). Inngest replays steps that already completed from cache.

```typescript
// lib/inngest/functions/dashboard-aggregator.ts
export const aggregateDashboard = inngest.createFunction(
  { id: "dashboard/aggregate", retries: 3 },
  { cron: "0 */2 * * *" },  // Every 2 hours
  async ({ step }) => {
    const metrics = await step.run("compute-metrics", async () => {
      // Read from all source tables, compute aggregated metrics
      // Returns DashboardMetrics object
    });

    const freshness = await step.run("check-freshness", async () => {
      // Check staleness of each source
      // Returns SourceFreshness object
    });

    await step.run("store-snapshot", async () => {
      // INSERT into dashboard_snapshots (append-only)
    });
  }
);
```

### Pattern 5: shadcn Chart with ChartContainer and CSS Variable Colors
**What:** All charts use the shadcn `ChartContainer` wrapper with `ChartConfig` mapping data keys to CSS variable colors.
**When to use:** Every chart in the dashboard.
**Why:** Automatic dark mode support, consistent theming, tooltip/legend integration.

```typescript
"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  pipeline: { label: "Pipeline", color: "var(--chart-1)" },
  zapier:   { label: "Zapier",   color: "var(--chart-2)" },
  orqai:    { label: "Orq.ai",   color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ActivityChart({ data }: { data: Array<{ date: string; pipeline: number; zapier: number; orqai: number }> }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area type="monotone" dataKey="pipeline" stackId="1" fill="var(--color-pipeline)" stroke="var(--color-pipeline)" fillOpacity={0.4} />
        <Area type="monotone" dataKey="zapier" stackId="1" fill="var(--color-zapier)" stroke="var(--color-zapier)" fillOpacity={0.4} />
        <Area type="monotone" dataKey="orqai" stackId="1" fill="var(--color-orqai)" stroke="var(--color-orqai)" fillOpacity={0.4} />
      </AreaChart>
    </ChartContainer>
  );
}
```

### Anti-Patterns to Avoid
- **Live-querying external APIs on page render:** Dashboard MUST read only from `dashboard_snapshots`. Never call Orq.ai or scrape Zapier on render.
- **Single monolithic aggregator step:** Split computation, freshness check, and storage into separate `step.run()` calls for retry isolation.
- **`id TEXT PRIMARY KEY` with `'latest'`:** The CONTEXT.md specifies UUID PK with `ORDER BY computed_at DESC LIMIT 1` -- do not use the 'latest' upsert pattern from ARCHITECTURE.md. Append-only is the locked decision.
- **Computing period filtering client-side:** Filter snapshots in the Supabase query (server-side), not by sending all snapshots to the client and filtering in JavaScript.
- **Using `networkidle`:** Already established in CLAUDE.md -- always use `domcontentloaded` for SPA navigation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG charts | Recharts via shadcn `ChartContainer` | Handles responsive sizing, accessibility, tooltips, dark mode |
| Number formatting | Custom formatters | `Intl.NumberFormat` + small `lib/dashboard/format.ts` helpers | Native API handles locale-aware EUR, percentages, compact notation |
| Date formatting | Manual date math | `date-fns` (`formatDistanceToNow`, `subDays`, `startOfMonth`, `startOfQuarter`) | Edge cases with timezones, DST, locale formatting |
| Loading skeletons | Custom shimmer CSS | Existing shadcn `Skeleton` component | Already in the project at `components/ui/skeleton.tsx` |
| Tooltip component | Custom hover tooltip | shadcn `Tooltip` or `ChartTooltipContent` for charts | Accessibility, positioning, keyboard support |
| Badge variants | Custom status pills | Existing `Badge` component with variant prop | Already established pattern in `ProjectStatusBadge` and `StepStatusBadge` |
| Period date ranges | Manual date range logic | `date-fns` (`subDays(now, 7)`, `startOfMonth(now)`, `startOfQuarter(now)`) | Quarter boundaries, month lengths, etc. |

**Key insight:** The dashboard UI is almost entirely composed from existing shadcn components (Card, Badge, Tabs, Skeleton, Select) plus the new chart component. The new code is in data aggregation and page composition, not in UI primitives.

## Common Pitfalls

### Pitfall 1: Stale Snapshot Data Shown Without Indication
**What goes wrong:** The aggregator cron fails silently (e.g., Supabase connection timeout) and the dashboard keeps showing the last successful snapshot. Executives make decisions based on data that is 12+ hours old without knowing.
**Why it happens:** Append-only pattern means old data is always available. Without explicit freshness checks, stale data looks identical to fresh data.
**How to avoid:** Every KPI card shows "Updated X ago" from `computed_at`. If `computed_at` is older than 4 hours (2x the cron interval), show a yellow "Data may be stale" warning. Per-source staleness uses the thresholds from CONTEXT.md (Pipeline >1h, Zapier >24h, Orq.ai >6h).
**Warning signs:** `computed_at` timestamps that do not advance; Inngest dashboard showing aggregator failures.

### Pitfall 2: Zapier Scraper Returns 'suspicious'/'failed' and Aggregator Uses Bad Data
**What goes wrong:** The Zapier scraper's validation layer flags data as suspicious (e.g., task count dropped 90%), but the aggregator naively reads the latest `zapier_snapshots` row including the bad data.
**Why it happens:** The aggregator queries `ORDER BY scraped_at DESC LIMIT 1` without checking `validation_status`.
**How to avoid:** The aggregator MUST filter for `validation_status = 'valid'` when reading Zapier snapshots. If the latest row is not valid, use the most recent valid row and set `source_freshness.zapier.usingFallback = true` with the fallback timestamp. The dashboard then shows "Using data from [timestamp] -- latest scrape had issues."
**Warning signs:** Zapier metrics suddenly showing zero or impossible values.

### Pitfall 3: JSONB Metrics Schema Drift Between Aggregator and Dashboard
**What goes wrong:** A developer adds a new metric to the aggregator but forgets to update the Zod schema or the dashboard component that reads it. The dashboard silently ignores the new metric, or a parse error causes a blank page.
**Why it happens:** JSONB is schema-less in Postgres. TypeScript types and Zod schemas are the only contracts.
**How to avoid:** Define a single Zod schema (`DashboardMetricsSchema`) in `lib/dashboard/metrics-schema.ts`. Both the aggregator (for validation before write) and the dashboard page (for parsing after read) import and use this schema. Use `.passthrough()` during development to avoid breaking on unknown fields.
**Warning signs:** `null` values in KPI cards when data should exist; Zod parse errors in server component logs.

### Pitfall 4: Period Selector Causes Full Snapshot Table Scans
**What goes wrong:** Filtering historical snapshots by period using `computed_at BETWEEN start AND end` without an index causes slow queries as the table grows.
**Why it happens:** The migration creates the table but omits the index on `computed_at`.
**How to avoid:** Always create `CREATE INDEX idx_dashboard_snapshots_computed_at ON dashboard_snapshots(computed_at DESC)`. The query for historical data uses this index.
**Warning signs:** Dashboard load time increasing over weeks as snapshots accumulate.

### Pitfall 5: ROI Numbers Without Sufficient Context Erode Executive Trust
**What goes wrong:** The dashboard shows "~EUR 8,520 saved" but the CFO asks where this number comes from and nobody can explain it quickly.
**Why it happens:** ROI is computed from estimated baselines, but the presentation does not surface the methodology.
**How to avoid:** (1) `~` prefix on all estimated values. (2) `ESTIMATED` pill badge in muted color. (3) Hover tooltip showing "Based on N of M projects with baselines. Formula: manual_minutes x task_frequency x hourly_cost." (4) Measured metrics (run count, success rate) have NO prefix or badge -- clean appearance creates visual distinction.
**Warning signs:** Executives questioning every number on the dashboard.

### Pitfall 6: Chart Components Are Client Components But Receive Large Data Arrays
**What goes wrong:** The entire historical snapshot dataset (90+ rows with full JSONB metrics) is serialized from server to client for chart rendering, inflating the page payload.
**Why it happens:** Recharts requires client-side rendering ("use client"). If the server component passes raw snapshot data to chart components, the full data crosses the server/client boundary.
**How to avoid:** Transform data server-side into minimal chart-ready arrays before passing to client chart components. E.g., instead of passing 90 full snapshot objects, pass `Array<{ date: string; pipeline: number; zapier: number; orqai: number }>` -- just the fields needed for that specific chart.
**Warning signs:** Large Next.js page payload visible in network tab; slow Time to Interactive.

## Code Examples

### Dashboard Aggregator Core Logic
```typescript
// lib/dashboard/aggregator.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { subDays, subHours } from "date-fns";
import type { DashboardMetrics, SourceFreshness } from "./metrics-schema";

export async function computeDashboardMetrics(
  periodStart: Date,
  periodEnd: Date
): Promise<{ metrics: DashboardMetrics; freshness: SourceFreshness }> {
  const admin = createAdminClient();

  const [
    { data: projects },
    { data: pipelineRuns },
    { data: latestZapier },
    { data: latestOrqai },
  ] = await Promise.all([
    admin.from("projects").select("id, name, status, automation_type, manual_minutes_per_task, task_frequency_per_month, hourly_cost_eur"),
    admin.from("pipeline_runs").select("id, project_id, status, started_at, completed_at").gte("created_at", periodStart.toISOString()).lte("created_at", periodEnd.toISOString()),
    admin.from("zapier_snapshots").select("*").eq("validation_status", "valid").order("scraped_at", { ascending: false }).limit(1).single(),
    admin.from("orqai_snapshots").select("*").order("collected_at", { ascending: false }).limit(1).single(),
  ]);

  // ... compute metrics from raw data
  // Return typed DashboardMetrics + SourceFreshness
}
```

### KPI Card Component
```typescript
// components/dashboard/kpi-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KpiCardProps {
  title: string;
  value: string;
  trend?: { value: number; label: string };
  estimated?: boolean;
  tooltipText?: string;
  icon: React.ReactNode;
  updatedAt: string;    // "Updated X ago"
  stale?: boolean;
}

export function KpiCard({ title, value, trend, estimated, tooltipText, icon, updatedAt, stale }: KpiCardProps) {
  const TrendIcon = trend
    ? trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
    : null;

  return (
    <Card className={stale ? "border-amber-300 dark:border-amber-700" : undefined}>
      <CardHeader className="flex-row items-center gap-2">
        {icon}
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <p className="text-2xl font-bold font-mono">
                {estimated ? "~" : ""}{value}
              </p>
              {estimated && (
                <Badge variant="secondary" className="mt-1 text-[10px] font-normal text-muted-foreground">
                  ESTIMATED
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          {tooltipText && <TooltipContent className="max-w-xs">{tooltipText}</TooltipContent>}
        </Tooltip>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {TrendIcon && trend && (
            <span className={`inline-flex items-center gap-0.5 ${trend.value > 0 ? "text-green-600" : trend.value < 0 ? "text-red-600" : ""}`}>
              <TrendIcon className="size-3" />
              {Math.abs(trend.value)}%
            </span>
          )}
          <span>{updatedAt}</span>
        </div>
        {stale && (
          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Data may be stale</p>
        )}
      </CardContent>
    </Card>
  );
}
```

### Health Score Computation
```typescript
// lib/dashboard/health-score.ts

interface HealthInputs {
  successRate: number;     // 0-100, from pipeline_runs
  errorRate: number;       // 0-100, across all sources
  dataFreshnessScore: number; // 0-100, based on source staleness
  latencyScore: number;    // 0-100, based on avg response times
}

export function computeHealthScore(inputs: HealthInputs): number {
  // Weights from CONTEXT.md decision
  const score =
    inputs.successRate * 0.4 +
    (100 - inputs.errorRate) * 0.3 +
    inputs.dataFreshnessScore * 0.2 +
    inputs.latencyScore * 0.1;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function healthToTrafficLight(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}
```

### Database Migration
```sql
-- Migration: dashboard_snapshots table + project ROI baseline columns (Phase 45)

-- Section 1: Dashboard snapshots table (append-only)
CREATE TABLE dashboard_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  metrics       JSONB NOT NULL,
  source_freshness JSONB NOT NULL,
  CONSTRAINT metrics_not_empty CHECK (metrics != '{}'::jsonb)
);

CREATE INDEX idx_dashboard_snapshots_computed_at ON dashboard_snapshots(computed_at DESC);

-- RLS: any authenticated user can read dashboard snapshots
ALTER TABLE dashboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read dashboard snapshots" ON dashboard_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Section 2: Add ROI baseline columns to projects
ALTER TABLE projects
  ADD COLUMN manual_minutes_per_task DECIMAL(10,2),
  ADD COLUMN task_frequency_per_month INTEGER,
  ADD COLUMN hourly_cost_eur DECIMAL(10,2);

-- Section 3: Global ROI defaults in settings table (key-value)
-- The settings table already exists (used by zapier_session_state).
-- Insert default ROI configuration:
INSERT INTO settings (key, value) VALUES
  ('roi_defaults', '{"manual_minutes_per_task": 15, "task_frequency_per_month": 20, "hourly_cost_eur": 45}'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ARCHITECTURE.md: `id TEXT PRIMARY KEY 'latest'` + upsert | CONTEXT.md: UUID PK + append-only + `ORDER BY computed_at DESC LIMIT 1` | Phase 45 context discussion | Better for trend charts, audit trail, no lost data on write failure |
| ARCHITECTURE.md: Orq.ai browser scraper fallback | Phase 44 implementation: Orq.ai REST API works | Phase 44 | `collectOrqaiAnalytics` already calls `api.orq.ai/v2/analytics/overview` and `/query`. No scraper needed. |
| ARCHITECTURE.md: separate columns per metric | CONTEXT.md: JSONB `metrics` column | Phase 45 context discussion | Flexible schema, fewer migrations, trade-off is no column-level indexing |
| STACK.md: `@orq-ai/node` SDK for analytics | Phase 44 implementation: direct `fetch()` to REST API | Phase 44 | SDK not needed for analytics; direct fetch with Zod validation is simpler |

**Deprecated/outdated from earlier research:**
- `@orq-ai/node` SDK: NOT needed for this phase. Phase 44 already uses direct REST API calls.
- `next-themes`: NOT needed for this phase. Dark mode toggle is Phase 47 (UI Redesign).
- `dashboard_snapshots.id = 'latest'` pattern: Superseded by append-only UUID pattern per CONTEXT.md.

## Open Questions

1. **Settings table DDL**
   - What we know: `settings` table is used by zapier-scraper (key-value store). It works with `.upsert()` on `key` column.
   - What's unclear: No CREATE TABLE migration found in `supabase/` directory. The table may have been created via SQL editor directly.
   - Recommendation: The migration should use `INSERT ... ON CONFLICT (key) DO NOTHING` for the ROI defaults row. If the settings table does not exist yet in the migration chain, add a `CREATE TABLE IF NOT EXISTS` guard.

2. **Historical Snapshot Volume and Cleanup**
   - What we know: CONTEXT.md specifies 90 days full, then 1/day, then 1/week after 365 days.
   - What's unclear: Whether cleanup should run as part of the aggregator or as a separate Inngest cron.
   - Recommendation: Separate cron function (`dashboard/cleanup`) running weekly. Keeps the aggregator fast and focused. This is in Claude's Discretion per CONTEXT.md.

3. **Period Selector vs Snapshot Query Strategy**
   - What we know: The period selector affects ALL cards and charts. Snapshots are stored with `period_start`/`period_end`.
   - What's unclear: Should the aggregator pre-compute for multiple periods, or should the dashboard filter historical snapshots by date range?
   - Recommendation: The aggregator computes metrics for a rolling "last 30 days" period each run. The dashboard page filters historical snapshot rows by `computed_at` to build trend charts for the selected period. The KPI cards always use the latest snapshot row (which contains the current 30-day metrics). For different periods (7d, quarter), the dashboard performs date-filtered queries on historical rows and re-aggregates client-side for just the summary numbers, or -- simpler -- the aggregator stores snapshot values that are inherently period-agnostic (totals, rates) and the dashboard filters the trend data by date range.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDASH-01 | KPI cards render with real data from snapshots | unit | `cd web && npx vitest run lib/dashboard/__tests__/aggregator.test.ts -t "computes KPI metrics"` | No -- Wave 0 |
| EDASH-02 | Activity chart data transformation from snapshots | unit | `cd web && npx vitest run lib/dashboard/__tests__/aggregator.test.ts -t "builds time series"` | No -- Wave 0 |
| EDASH-03 | Project status breakdown counts | unit | `cd web && npx vitest run lib/dashboard/__tests__/aggregator.test.ts -t "counts by status"` | No -- Wave 0 |
| EDASH-04 | ROI computation with baselines and fallbacks | unit | `cd web && npx vitest run lib/dashboard/__tests__/aggregator.test.ts -t "computes ROI"` | No -- Wave 0 |
| EDASH-05 | Health score formula (weighted components) | unit | `cd web && npx vitest run lib/dashboard/__tests__/health-score.test.ts` | No -- Wave 0 |
| EDASH-06 | Sub-100ms from pre-computed data (no external calls) | manual-only | Verify page load via browser DevTools Network tab | N/A |
| DINT-06 | Aggregator reads all 5 source tables and writes snapshot | unit | `cd web && npx vitest run lib/dashboard/__tests__/aggregator.test.ts -t "reads all sources"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/lib/dashboard/__tests__/aggregator.test.ts` -- covers EDASH-01, EDASH-02, EDASH-03, DINT-06
- [ ] `web/lib/dashboard/__tests__/health-score.test.ts` -- covers EDASH-05
- [ ] `web/lib/dashboard/__tests__/format.test.ts` -- covers number/currency formatting
- [ ] `web/lib/dashboard/__tests__/metrics-schema.test.ts` -- covers EDASH-04 Zod schema validation

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Charts Documentation](https://ui.shadcn.com/docs/components/radix/chart) -- ChartContainer API, ChartConfig type, tooltip/legend patterns
- [shadcn/ui Area Charts Gallery](https://ui.shadcn.com/charts/area) -- Stacked area chart examples
- [Recharts v3.8.1 on npm](https://www.npmjs.com/package/recharts) -- Current version verified 2026-03-30
- [date-fns v4.1.0 on npm](https://www.npmjs.com/package/date-fns) -- Current version verified 2026-03-30
- [next-themes v0.4.6 on npm](https://www.npmjs.com/package/next-themes) -- Version verified (not needed this phase)
- [Inngest Cron/Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions) -- Cron syntax and multi-step patterns
- Existing codebase: `web/lib/inngest/functions/zapier-scraper.ts` -- Established Inngest cron + Browserless.io pattern
- Existing codebase: `web/lib/inngest/functions/orqai-collector.ts` -- Established Inngest cron + REST API pattern
- Existing codebase: `supabase/migrations/20260327_project_model_data_collection.sql` -- Existing schema for Phase 44 tables
- Existing codebase: `web/components/project-status-badge.tsx` -- Config-driven badge pattern to reuse
- Existing codebase: `web/app/(dashboard)/page.tsx` -- Current dashboard with hardcoded values (integration point)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- V6.0 architecture (superseded by CONTEXT.md for snapshot pattern)
- `.planning/research/STACK.md` -- Stack additions analysis (verified package versions)
- `.planning/research/PITFALLS.md` -- Common pitfalls for dashboard and scraper phases
- `.planning/research/FEATURES.md` -- Feature landscape and ROI calculation patterns
- [React 19 + Recharts compatibility](https://github.com/shadcn-ui/ui/issues/9892) -- react-is override may be needed

### Tertiary (LOW confidence)
- None -- all critical claims verified against official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Recharts via shadcn is the documented and only sensible path. Versions verified.
- Architecture: HIGH -- CONTEXT.md decisions are specific and detailed. Snapshot pattern is well-established. All upstream data sources operational.
- Pitfalls: HIGH -- Verified against existing codebase patterns and PITFALLS.md research. Zapier validation fallback logic is clearly specified in CONTEXT.md.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable stack, no fast-moving dependencies)
