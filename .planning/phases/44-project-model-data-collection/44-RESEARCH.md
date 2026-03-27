# Phase 44: Project Model & Data Collection - Research

**Researched:** 2026-03-27
**Domain:** Supabase schema extension, Inngest cron data collectors, Browserless.io browser scraping, Orq.ai MCP analytics API
**Confidence:** HIGH

## Summary

Phase 44 extends the existing `projects` table with status lifecycle and automation type columns, then builds two independent data collectors: a Zapier analytics browser scraper (Browserless.io via Inngest cron) and an Orq.ai analytics API collector (via MCP tools on Inngest cron). Both collectors store snapshots in Supabase for downstream consumption by Phase 45's executive dashboard.

The project model extension is straightforward -- additive columns with defaults, no RLS changes needed, no breaking query impact. The Zapier scraper is the highest-risk component because it depends on Zapier's DOM structure which can change without notice. The CONTEXT.md decision to store raw HTML alongside extracted data and implement selector validation is critical for maintainability. The Orq.ai collector is lower-risk because it uses the MCP analytics API (`get_analytics_overview` and `query_analytics`) which provides typed programmatic access -- no browser scraping needed.

**Primary recommendation:** Build in this order: (1) database migration for project model extension + snapshot tables, (2) ProjectStatusBadge + AutomationType tag on cards, (3) Orq.ai collector (simpler, API-based), (4) Zapier scraper (complex, needs DOM investigation). The collectors should run independently and accumulate data whether or not Phase 45's dashboard UI exists yet.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Zapier Scraper:**
- Auth: email/password only (no 2FA) -- single Browserless session
- Data scope: full analytics dashboard -- task usage by Zap, task usage over time, error rates per Zap
- Frequency: twice daily (morning + evening)
- Credentials: stored in existing credential vault (encrypted, supports rotation alerts)
- Session reuse: `context.storageState()` saved in Supabase between runs
- Zapier DOM analysis: needs implementation-time research -- screenshot + map analytics pages before writing selectors
- Validation: must detect broken selectors or stale data and flag instead of silently storing bad data
- Store raw HTML alongside extracted data for debugging broken selectors

**Orq.ai Data Collection:**
- Data scope: ALL metric types -- usage, cost, latency, errors, agent performance, model performance
- Granularity: BOTH per-agent AND workspace-level totals
- Frequency: every hour (API calls are cheap, no browser automation)
- Method: Orq.ai MCP analytics API (`get_analytics_overview`, `query_analytics`)
- Group by: agent_name for per-agent breakdown

**Project Status on Cards:**
- Badge style: colored pills with icons (match existing StepStatusBadge pattern)
  - Green for live, blue for building, amber for testing, gray for idea
- Both status AND automation type visible on cards
  - Status badge (prominent) + smaller type tag (zapier-only, hybrid, standalone-app, orqai-agent)
- Migration default: existing projects default to 'idea' status
- AI-generated executive one-liner per project -- focused on outcome/result

**Snapshot Table Design:**
- Raw + processed: store raw data AND computed metrics -- can reprocess if dashboard needs change
- Table structure and retention policy: Claude's discretion
- Phase 45 aggregator will consume these tables to build the unified dashboard view

### Claude's Discretion
- Separate vs unified snapshot tables -- choose what works best for the Phase 45 aggregator
- Data retention period -- pick sensible default with optional cleanup cron
- Exact badge icon choices and spacing
- Inngest event naming conventions for new collectors
- Whether the AI executive one-liner belongs in Phase 44 (project model) or Phase 45 (dashboard presentation)

### Deferred Ideas (OUT OF SCOPE)
- AI-generated executive descriptions may belong in Phase 45 (dashboard presentation layer) rather than Phase 44 (data model) -- researcher should determine best placement
- Role-based dashboard views (management vs team) -- explicitly out of scope for V6.0
- Zapier Partner API as eventual replacement for browser scraper -- tracked in future requirements

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PEXT-01 | Projects have status lifecycle: idea -> building -> testing -> live | ALTER TABLE migration adds `status` column with CHECK constraint; existing `update_updated_at()` trigger auto-updates timestamps |
| PEXT-02 | Projects have automation type: zapier-only, hybrid, standalone-app, orqai-agent | ALTER TABLE migration adds `automation_type` column with CHECK constraint |
| PEXT-03 | Status and type badges visible on project cards and dashboard | ProjectStatusBadge component follows StepStatusBadge pattern; ProjectCard extended with badge rendering |
| DINT-01 | Zapier analytics browser automation scrapes run/task data and stores snapshots in Supabase | Inngest cron function uses Browserless.io connectOverCDP, session reuse from credential vault, stores in `zapier_snapshots` table |
| DINT-02 | Zapier scraper runs multiple times per day via Inngest cron | Inngest `{ cron: "0 8,18 * * *" }` trigger for twice-daily schedule |
| DINT-03 | Zapier scraper includes validation layer to detect broken selectors and stale data | Multi-selector fallback strategy, percentage-change threshold validation, raw HTML storage for debugging |
| DINT-04 | Orq.ai analytics (usage, cost, latency, errors, agent performance) collected via API and stored in Supabase | Inngest cron function calls Orq.ai MCP analytics tools (`get_analytics_overview`, `query_analytics`), stores in `orqai_snapshots` table |
| DINT-05 | Orq.ai collector runs on schedule via Inngest cron | Inngest `{ cron: "0 * * * *" }` trigger for hourly schedule |

</phase_requirements>

## Standard Stack

### Core (already in project, no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| inngest | 3.52.6 | Cron-scheduled durable functions for both collectors | Already used for pipeline execution and health checks; cron support built-in |
| playwright-core | existing | Browser automation for Zapier scraper | Already in stack; connects to Browserless.io via CDP |
| @supabase/supabase-js | ^2.99 | Database operations for snapshot tables | Admin client pattern already established |
| lucide-react | ^0.577 | Icons for status badges | Already used throughout the app |
| zod | ^4.3 | Validation schemas for scraped data | Already used for API validation |

### No new dependencies required

Phase 44 builds entirely on existing stack. The Orq.ai MCP analytics tools are available through the existing MCP server configuration -- no npm package needed. The Zapier scraper uses `playwright-core` and `Browserless.io` already in the stack. Badge components use existing `Badge` from shadcn/ui.

**Installation:** None -- all dependencies already installed.

## Architecture Patterns

### Recommended File Structure

```
supabase/migrations/
  20260327_project_model_extension.sql     # ALTER TABLE + new snapshot tables

web/
  components/
    project-status-badge.tsx               # StatusConfig pattern (matches StepStatusBadge)
    automation-type-tag.tsx                 # Smaller tag for automation type display
  lib/inngest/
    functions/
      zapier-scraper.ts                    # Cron: Browserless.io scraper for Zapier analytics
      orqai-collector.ts                   # Cron: Orq.ai MCP analytics collection
    events.ts                              # Extended with new event types
  lib/zapier/
    selectors.ts                           # Zapier DOM selector strategies (multi-fallback)
    validators.ts                          # Data validation (threshold checks, staleness detection)
    types.ts                               # TypeScript types for scraped Zapier data
  lib/orqai/
    types.ts                               # TypeScript types for Orq.ai analytics data
```

### Pattern 1: Inngest Cron Function for Data Collection

**What:** Scheduled functions that run on a cron trigger, collect data from external sources, and store snapshots in Supabase.
**When to use:** Any recurring data collection that must be durable (retries on failure) and independent of user interaction.

```typescript
// Source: existing health-check.ts pattern + Inngest cron docs
export const collectOrqaiAnalytics = inngest.createFunction(
  {
    id: "analytics/orqai-collect",
    retries: 3,
  },
  { cron: "0 * * * *" },  // Every hour
  async ({ step }) => {
    const workspaceData = await step.run("fetch-workspace-overview", async () => {
      // Call Orq.ai MCP get_analytics_overview
      // Return workspace-level metrics
    });

    const agentData = await step.run("fetch-per-agent-metrics", async () => {
      // Call Orq.ai MCP query_analytics with group_by: agent_name
      // Return per-agent breakdown
    });

    await step.run("store-snapshot", async () => {
      const admin = createAdminClient();
      await admin.from("orqai_snapshots").insert({
        workspace_metrics: workspaceData,
        per_agent_metrics: agentData,
        collected_at: new Date().toISOString(),
      });
    });
  }
);
```

**Key design:**
- Each step is independently retryable (Inngest memoization)
- Data collection and storage are separate steps (failure in storage does not re-trigger collection)
- The `step.run()` pattern ensures side effects only execute once per attempt

### Pattern 2: Browserless.io Scraper with Validation Layer

**What:** A browser automation function that scrapes data, validates the results, and stores both raw and processed data.
**When to use:** Extracting data from web UIs that have no API.

```typescript
// Source: docs/browserless-patterns.md + credential vault patterns
export const scrapeZapierAnalytics = inngest.createFunction(
  {
    id: "analytics/zapier-scrape",
    retries: 2,
  },
  { cron: "0 8,18 * * *" },  // Twice daily: 8 AM and 6 PM
  async ({ step }) => {
    const scraped = await step.run("scrape-zapier-dashboard", async () => {
      const admin = createAdminClient();
      const { chromium } = await import("playwright-core");

      // 1. Load credentials from vault
      const creds = await resolveCredentials("zapier-admin-credential-id");

      // 2. Load or create session
      const { data: sessionData } = await admin
        .from("settings")
        .select("value")
        .eq("key", "zapier_session_state")
        .single();

      let storageState = sessionData?.value;
      while (typeof storageState === "string") {
        storageState = JSON.parse(storageState);
      }

      // 3. Connect to Browserless.io
      const wsEndpoint = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;
      const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });

      try {
        const context = storageState
          ? await browser.newContext({ storageState })
          : await browser.newContext();
        const page = await context.newPage();

        // 4. Navigate, authenticate if needed, scrape
        // 5. Capture raw HTML for debugging
        // 6. Extract structured data
        // 7. Save updated session state
        const newState = await context.storageState();
        await admin.from("settings").upsert({
          key: "zapier_session_state",
          value: newState,
        });

        return { metrics: extractedData, rawHtml: pageHtml };
      } finally {
        await browser.close().catch(() => {});
      }
    });

    // Validation step (separate from scraping for retry isolation)
    const validated = await step.run("validate-scraped-data", async () => {
      return validateZapierData(scraped.metrics);
    });

    await step.run("store-snapshot", async () => {
      const admin = createAdminClient();
      await admin.from("zapier_snapshots").insert({
        ...validated.metrics,
        raw_html: scraped.rawHtml,
        validation_status: validated.status,
        validation_warnings: validated.warnings,
        scraped_at: new Date().toISOString(),
      });
    });
  }
);
```

### Pattern 3: Multi-Selector Fallback Strategy (Zapier DOM)

**What:** Multiple CSS/text selector strategies per data point, with graceful degradation.
**When to use:** Any browser scraper targeting a third-party SPA that may change DOM structure.

```typescript
// lib/zapier/selectors.ts
interface SelectorStrategy {
  name: string;
  selector: string;
  extract: (element: ElementHandle) => Promise<string | null>;
}

// Each data point has multiple extraction strategies
const TASK_COUNT_STRATEGIES: SelectorStrategy[] = [
  {
    name: "aria-label",
    selector: '[aria-label*="task"]',
    extract: async (el) => el.textContent(),
  },
  {
    name: "data-testid",
    selector: '[data-testid="task-count"]',
    extract: async (el) => el.textContent(),
  },
  {
    name: "text-content",
    selector: ':text("tasks used")',
    extract: async (el) => {
      const parent = await el.evaluateHandle(e => e.parentElement);
      return parent.textContent();
    },
  },
];

async function extractWithFallback(
  page: Page,
  strategies: SelectorStrategy[]
): Promise<{ value: string | null; strategy: string; allFailed: boolean }> {
  for (const strategy of strategies) {
    try {
      const el = page.locator(strategy.selector).first();
      if (await el.count() > 0) {
        const value = await strategy.extract(await el.elementHandle());
        if (value) return { value, strategy: strategy.name, allFailed: false };
      }
    } catch { /* try next strategy */ }
  }
  return { value: null, strategy: "none", allFailed: true };
}
```

### Pattern 4: ProjectStatusBadge (Config-Driven Badge)

**What:** StatusConfig map with icon, label, variant, className -- identical pattern to existing `StepStatusBadge`.
**When to use:** Displaying lifecycle status with consistent visual treatment.

```typescript
// Source: web/components/step-status-badge.tsx (established pattern)
import { Lightbulb, Hammer, FlaskConical, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ProjectStatus = "idea" | "building" | "testing" | "live";

const statusConfig: Record<ProjectStatus, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  idea: {
    label: "Idea",
    variant: "outline",
    icon: Lightbulb,
    className: "text-muted-foreground",
  },
  building: {
    label: "Building",
    variant: "default",
    icon: Hammer,
    className: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800 dark:text-blue-400",
  },
  testing: {
    label: "Testing",
    variant: "default",
    icon: FlaskConical,
    className: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400",
  },
  live: {
    label: "Live",
    variant: "default",
    icon: Rocket,
    className: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400",
  },
};
```

### Anti-Patterns to Avoid

- **Single selector per data point:** Zapier changes their DOM regularly. ALWAYS implement 2+ selector strategies per scraped value with fallback chain.
- **Silently storing zero/empty values:** If the scraper extracts "0 tasks" when yesterday was "500 tasks", this is a scraper failure, not real data. Validate against previous snapshots.
- **Running scraper logic outside `step.run()`:** All Browserless.io connections, page navigations, and Supabase writes MUST be inside `step.run()` to benefit from Inngest retry/memoization.
- **Storing credentials in Inngest event data:** NEVER pass credentials through events. Resolve them inside `step.run()` using `resolveCredentials()`.
- **Monolithic scraper function:** Separate scraping, validation, and storage into distinct `step.run()` calls. A validation failure should not re-trigger the browser session.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credential decryption | Custom decryption logic | `resolveCredentials()` from `lib/credentials/proxy.ts` | Already handles AES-256-GCM, admin client, error handling |
| Session state persistence | Custom cookie management | `context.storageState()` + Supabase `settings` table | Existing pattern in `docs/browserless-patterns.md`, handles double-encoding |
| Badge component | Custom status indicator | `Badge` from `@/components/ui/badge` + StatusConfig pattern | Existing `StepStatusBadge` proves the pattern works |
| Cron scheduling | Custom timer/interval | Inngest `{ cron: "..." }` trigger | Built-in retries, logging, failure handling, dashboard visibility |
| Data validation | Ad-hoc if/else checks | Zod schemas with `.safeParse()` | Type-safe, composable, already in stack |
| Admin DB client | Direct Supabase client construction | `createAdminClient()` from `lib/supabase/admin.ts` | Service-role key, consistent pattern |

## Common Pitfalls

### Pitfall 1: Zapier Scraper Returns Valid-Looking But Wrong Data

**What goes wrong:** The scraper extracts text from the page, parses "0" as a valid task count, and stores it. But the real count was 500 -- the scraper hit a loading spinner or the wrong element. The dashboard shows a sudden drop to zero that looks alarming but is just bad scraping.
**Why it happens:** SPAs render content asynchronously. The scraper may extract data before the analytics charts fully load, or Zapier may show a placeholder during data fetch.
**How to avoid:**
1. Wait for specific data-bearing selectors, not just `domcontentloaded`
2. Validate extracted numbers against previous snapshot (>90% drop = suspicious)
3. Store a `validation_status` field: "valid", "suspicious", "stale"
4. Dashboard (Phase 45) should show the most recent "valid" snapshot, not just the latest
**Warning signs:** Sudden drops to zero in otherwise stable metrics; the `validation_warnings` array in snapshots growing.

### Pitfall 2: Zapier Session Expires Mid-Scrape

**What goes wrong:** The stored session cookies expire between scraping runs. The scraper navigates to the analytics page but gets redirected to the login page. It scrapes the login page DOM instead of analytics data.
**Why it happens:** Session cookies have a finite TTL. If the scraper runs twice daily, sessions might expire between runs.
**How to avoid:**
1. After page navigation, check `page.url()` to verify we landed on the expected URL (not login)
2. If redirected to login, perform fresh authentication using credentials from the vault
3. After successful login, save the new session state to Supabase
4. Consider programmatic cookie expiry check before connecting (see `isSessionExpired()` in browserless-patterns.md)
**Warning signs:** Scraper "succeeds" but all values are null; `page.url()` in logs shows `/login` instead of `/analytics`.

### Pitfall 3: Orq.ai MCP API Changes Parameters

**What goes wrong:** The Orq.ai MCP tools (`get_analytics_overview`, `query_analytics`) change their parameter schema or return format. The collector stores data in a format the aggregator does not expect.
**Why it happens:** MCP tools are controlled by Orq.ai and may update without notice. The analytics API is relatively new.
**How to avoid:**
1. Store the raw MCP response in a JSONB column alongside extracted metrics
2. Use Zod schemas to validate the response before extracting
3. If validation fails, store the raw response anyway with a "validation_failed" flag
4. Log the full response schema on first run for comparison on subsequent runs
**Warning signs:** Zod parse failures in the collector; raw response shapes changing between snapshots.

### Pitfall 4: Inngest Cron Functions Not Registered

**What goes wrong:** The new cron functions are created in TypeScript files but never added to the `serve()` handler in `app/api/inngest/route.ts`. They never execute. No error is thrown -- they are simply invisible to Inngest.
**Why it happens:** The Inngest serve handler requires explicit function registration. Creating a function file is not enough.
**How to avoid:**
1. After creating each new Inngest function, immediately update `app/api/inngest/route.ts` to import and register it
2. After deploying, check the Inngest dashboard to verify the function appears and the cron schedule is active
3. Trigger a manual test run from the Inngest dashboard
**Warning signs:** Function files exist but no rows appear in snapshot tables; Inngest dashboard shows only `executePipeline` and `runHealthCheck`.

### Pitfall 5: ALTER TABLE Migration Breaks Existing Queries

**What goes wrong:** Adding `status` and `automation_type` columns to the `projects` table with incorrect defaults or missing CHECK constraints causes existing INSERT operations (e.g., `CreateProjectModal`) to fail because the new columns are NOT NULL but the existing code does not supply them.
**Why it happens:** The migration adds a NOT NULL column without a DEFAULT, or the DEFAULT does not match the CHECK constraint values.
**How to avoid:**
1. Always add NOT NULL columns WITH DEFAULT: `ADD COLUMN status TEXT NOT NULL DEFAULT 'idea'`
2. Verify the DEFAULT value is in the CHECK constraint list
3. Test existing project creation flow after applying migration
4. The existing `projects` query `select("*, project_members(user_id)")` will automatically include new columns -- no query change needed
**Warning signs:** Project creation fails with "violates check constraint"; existing pages crash because they receive unexpected column values.

## Code Examples

### Database Migration

```sql
-- Source: existing schema.sql patterns + ARCHITECTURE.md table designs
-- Migration: 20260327_project_model_data_collection.sql

-- =============================================
-- 1. Extend projects table
-- =============================================
ALTER TABLE projects
  ADD COLUMN status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'building', 'testing', 'live')),
  ADD COLUMN automation_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (automation_type IN ('zapier-only', 'hybrid', 'standalone-app', 'orqai-agent', 'unknown')),
  ADD COLUMN executive_summary TEXT;  -- AI-generated one-liner (populated by Phase 45 or manually)

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_automation_type ON projects(automation_type);

-- =============================================
-- 2. Zapier analytics snapshots
-- =============================================
CREATE TABLE zapier_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Extracted metrics
  active_zaps       INTEGER,
  tasks_used        INTEGER,
  tasks_limit       INTEGER,
  error_count       INTEGER,
  success_rate_pct  DECIMAL(5,2),
  top_zaps          JSONB,           -- Array of {name, task_count, error_count}
  -- Raw storage for debugging
  raw_html          TEXT,            -- Raw HTML for selector debugging
  raw_data          JSONB,           -- Full extracted data before processing
  -- Validation
  validation_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (validation_status IN ('valid', 'suspicious', 'failed')),
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  -- Meta
  scraped_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_zapier_snapshots_scraped_at ON zapier_snapshots(scraped_at DESC);

-- =============================================
-- 3. Orq.ai analytics snapshots
-- =============================================
CREATE TABLE orqai_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Workspace-level metrics
  total_deployments   INTEGER,
  total_requests      INTEGER,
  total_cost_usd      DECIMAL(10,4),
  total_tokens        BIGINT,
  avg_latency_ms      DECIMAL(10,2),
  error_count         INTEGER,
  error_rate_pct      DECIMAL(5,2),
  -- Per-agent breakdown
  per_agent_metrics   JSONB,          -- Array of {agent_name, requests, cost, latency, errors}
  -- Raw storage
  raw_workspace_data  JSONB,          -- Raw get_analytics_overview response
  raw_query_data      JSONB,          -- Raw query_analytics response
  -- Meta
  collected_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orqai_snapshots_collected_at ON orqai_snapshots(collected_at DESC);

-- =============================================
-- 4. RLS policies for new tables
-- =============================================
ALTER TABLE zapier_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqai_snapshots ENABLE ROW LEVEL SECURITY;

-- Analytics snapshots are read-only for authenticated users (written by Inngest via admin client)
CREATE POLICY "Authenticated users read zapier snapshots" ON zapier_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users read orqai snapshots" ON orqai_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

### Inngest Event Type Definitions

```typescript
// Source: web/lib/inngest/events.ts (extend existing Events type)
// Add to existing Events type:

"analytics/zapier-scrape.completed": {
  data: {
    snapshotId: string;
    validationStatus: "valid" | "suspicious" | "failed";
    scrapedAt: string;
  };
};
"analytics/orqai-collect.completed": {
  data: {
    snapshotId: string;
    collectedAt: string;
  };
};
```

### Zapier Data Validator

```typescript
// lib/zapier/validators.ts
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const ZapierMetricsSchema = z.object({
  activeZaps: z.number().int().nonnegative().nullable(),
  tasksUsed: z.number().int().nonnegative().nullable(),
  tasksLimit: z.number().int().nonnegative().nullable(),
  errorCount: z.number().int().nonnegative().nullable(),
  successRatePct: z.number().min(0).max(100).nullable(),
  topZaps: z.array(z.object({
    name: z.string(),
    taskCount: z.number(),
    errorCount: z.number().optional(),
  })).nullable(),
});

type ValidationResult = {
  status: "valid" | "suspicious" | "failed";
  warnings: string[];
  metrics: z.infer<typeof ZapierMetricsSchema>;
};

export async function validateZapierData(
  rawMetrics: Record<string, unknown>
): Promise<ValidationResult> {
  const warnings: string[] = [];

  // 1. Schema validation
  const parsed = ZapierMetricsSchema.safeParse(rawMetrics);
  if (!parsed.success) {
    return {
      status: "failed",
      warnings: [`Schema validation failed: ${parsed.error.message}`],
      metrics: rawMetrics as any,
    };
  }

  // 2. Staleness check: compare against previous snapshot
  const admin = createAdminClient();
  const { data: previous } = await admin
    .from("zapier_snapshots")
    .select("tasks_used, active_zaps, validation_status")
    .eq("validation_status", "valid")
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single();

  if (previous && parsed.data.tasksUsed !== null) {
    const prevTasks = previous.tasks_used ?? 0;
    if (prevTasks > 0 && parsed.data.tasksUsed === 0) {
      warnings.push(`Tasks dropped from ${prevTasks} to 0 -- likely scraper failure`);
    }
    const dropPct = prevTasks > 0
      ? ((prevTasks - parsed.data.tasksUsed) / prevTasks) * 100
      : 0;
    if (dropPct > 90) {
      warnings.push(`Tasks dropped ${dropPct.toFixed(0)}% (${prevTasks} -> ${parsed.data.tasksUsed})`);
    }
  }

  // 3. Null check: if all values are null, selectors are likely broken
  const allNull = Object.values(parsed.data).every(v => v === null);
  if (allNull) {
    return {
      status: "failed",
      warnings: ["All extracted values are null -- selectors likely broken"],
      metrics: parsed.data,
    };
  }

  return {
    status: warnings.length > 0 ? "suspicious" : "valid",
    warnings,
    metrics: parsed.data,
  };
}
```

### Inngest Function Registration

```typescript
// Source: web/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executePipeline } from "@/lib/inngest/functions/pipeline";
import { runHealthCheck } from "@/lib/inngest/functions/health-check";
import { scrapeZapierAnalytics } from "@/lib/inngest/functions/zapier-scraper";
import { collectOrqaiAnalytics } from "@/lib/inngest/functions/orqai-collector";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executePipeline, runHealthCheck, scrapeZapierAnalytics, collectOrqaiAnalytics],
});
```

## Discretion Recommendations

Based on research findings, these are my recommendations for the areas marked as "Claude's Discretion":

### Separate vs Unified Snapshot Tables

**Recommendation: Separate tables** (`zapier_snapshots` and `orqai_snapshots`).

Rationale:
- Different data shapes (Zapier has task counts, Orq.ai has token usage and latency)
- Different collection frequencies (Zapier 2x/day, Orq.ai hourly)
- Different validation concerns (Zapier scraper fragility vs. API reliability)
- Phase 45's aggregator can JOIN or UNION these as needed
- Separate tables allow independent schema evolution
- Debugging is simpler: "is the Zapier scraper broken?" -- check `zapier_snapshots` in isolation

### Data Retention Period

**Recommendation: 90 days default, with optional cleanup cron.**

- 90 days covers quarterly reporting needs
- Raw HTML (largest field) should have shorter retention: 14 days (only needed for debugging recent failures)
- Cleanup cron: weekly Inngest function that deletes snapshots older than 90 days and raw_html older than 14 days
- This keeps storage manageable while supporting trend charts in Phase 45

### Badge Icon Choices

**Recommendation:**
- `Lightbulb` for idea (gray)
- `Hammer` for building (blue)
- `FlaskConical` for testing (amber)
- `Rocket` for live (green)

These icons are already in `lucide-react` (in the stack) and are immediately recognizable even at small sizes. They follow the same icon + color + text pattern as the existing `StepStatusBadge`.

For automation type tags (smaller, less prominent):
- `Zap` for zapier-only
- `GitBranch` for hybrid
- `AppWindow` for standalone-app
- `Bot` for orqai-agent

### Inngest Event Naming Conventions

**Recommendation:** Follow the existing `{domain}/{entity}.{action}` pattern:
- `analytics/zapier-scrape.completed`
- `analytics/orqai-collect.completed`

Function IDs:
- `analytics/zapier-scrape` (cron-triggered, no event needed to start)
- `analytics/orqai-collect` (cron-triggered, no event needed to start)

These follow the established pattern of `infrastructure/health-check` already in the codebase.

### AI Executive One-Liner Placement

**Recommendation: Add the `executive_summary` column in Phase 44 (data model), but populate it in Phase 45 (dashboard presentation).**

Rationale:
- The column is a trivial addition to the migration -- costs nothing to include now
- The AI generation logic (calling an LLM to create the one-liner) is presentation-layer work that belongs with the dashboard
- Phase 44 focuses on data collection infrastructure, not content generation
- Users can manually set `executive_summary` via existing project edit flows in the meantime

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Orq.ai scraper (Browserless) | Orq.ai MCP analytics API | 2026 (MCP tools added) | No browser scraping needed for Orq.ai -- direct programmatic access |
| Single CSS selector per element | Multi-strategy fallback chains | Industry best practice | Critical for Zapier scraper resilience |
| Store only processed metrics | Store raw + processed + validation status | Learned from scraper fragility research | Enables reprocessing and debugging |

## Open Questions

1. **Zapier analytics page URL and DOM structure**
   - What we know: The analytics dashboard is at `zapier.com/app/settings/analytics` or similar. It shows KPI cards with active zaps, task usage, error rates.
   - What's unclear: The exact DOM selectors. Zapier uses a React SPA with potentially hashed class names.
   - Recommendation: The FIRST task of the Zapier scraper implementation must be a "DOM reconnaissance" step: take screenshots, capture DOM tree, map selectors. This is an implementation-time research task, NOT a planning-time task.

2. **Orq.ai MCP analytics tool parameter schemas**
   - What we know: `get_analytics_overview` and `query_analytics` MCP tools exist. `query_analytics` accepts metrics (usage, cost, latency, errors, agents, model_performance) and group_by parameters.
   - What's unclear: Exact response shapes, date range parameters, pagination behavior.
   - Recommendation: First collector run should log full response shapes. Build Zod schemas from actual responses, not assumed structures.

3. **Zapier credential ID in the vault**
   - What we know: Credentials are stored in the `credentials` table with AES-256-GCM encryption. The vault supports `username_password` auth type.
   - What's unclear: Whether a Zapier credential already exists or needs to be created.
   - Recommendation: The implementation should check for existing credential and create one via the web UI if missing. The credential ID should be stored as a constant or settings key, not hardcoded in the scraper.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supabase/schema.sql` -- current projects table schema
- Existing codebase: `web/components/step-status-badge.tsx` -- StatusConfig badge pattern
- Existing codebase: `web/lib/inngest/functions/health-check.ts` -- Inngest function pattern
- Existing codebase: `docs/browserless-patterns.md` -- all scraper patterns
- Existing codebase: `docs/inngest-patterns.md` -- step.run(), cron, retry patterns
- Existing codebase: `web/lib/credentials/proxy.ts` -- credential resolution pattern
- Existing codebase: `web/lib/credentials/crypto.ts` -- AES-256-GCM encryption
- [Inngest Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions) -- cron syntax, timezone support

### Secondary (MEDIUM confidence)
- [Zapier Analytics Dashboard](https://help.zapier.com/hc/en-us/articles/25444544607373-Review-your-account-usage-in-the-analytics-dashboard) -- available metrics, page structure
- [Enhanced Zap Analytics](https://help.zapier.com/hc/en-us/articles/31466726600461-Enhanced-Zap-analytics-and-reporting) -- KPI cards, CSV export
- [Zapier Admin Center](https://help.zapier.com/hc/en-us/articles/38925392216973-Review-your-account-in-the-admin-center) -- admin dashboard metrics
- [Orq.ai Analytics Docs](https://docs.orq.ai/docs/analytics) -- analytics features overview
- `.planning/research/ARCHITECTURE.md` -- V6.0 architecture, snapshot patterns, data flow
- `.planning/research/PITFALLS.md` -- scraper fragility, validation strategies
- `.planning/research/STACK.md` -- stack additions, version verification

### Tertiary (LOW confidence)
- Zapier DOM structure -- must be verified at implementation time via screenshots
- Orq.ai MCP analytics response shapes -- must be verified by calling the tools

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in the project, no new packages
- Architecture: HIGH -- follows established patterns (Inngest cron, Browserless.io, admin client)
- Database schema: HIGH -- additive migration, established patterns from schema.sql and schema-credentials.sql
- Zapier scraper: MEDIUM -- scraping strategy is sound but DOM selectors are unknown until implementation-time research
- Orq.ai collector: MEDIUM-HIGH -- MCP tools confirmed available, response shapes need verification
- Badge components: HIGH -- direct copy of established StepStatusBadge pattern
- Pitfalls: HIGH -- comprehensively documented from PITFALLS.md research and codebase analysis

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (30 days for stable patterns; Zapier DOM could invalidate scraper details sooner)
