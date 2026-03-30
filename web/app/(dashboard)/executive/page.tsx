import { createAdminClient } from "@/lib/supabase/admin";
import {
  DashboardMetricsSchema,
  SourceFreshnessSchema,
} from "@/lib/dashboard/metrics-schema";

// Force dynamic rendering — dashboard data changes frequently
export const dynamic = "force-dynamic";
import type { Period } from "@/lib/dashboard/types";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { SourceStatusCard } from "@/components/dashboard/source-status-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { SuccessRateChart } from "@/components/dashboard/success-rate-chart";
import { ProjectHealthTable } from "@/components/dashboard/project-health-table";
import { AgentMetricsTable } from "@/components/dashboard/agent-metrics-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution-chart";
import { TypeBreakdownChart } from "@/components/dashboard/type-breakdown-chart";
import { RoiTable } from "@/components/dashboard/roi-table";
import { CostTrendChart } from "@/components/dashboard/cost-trend-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarChart3 } from "lucide-react";
import { formatCompactNumber, formatCurrency } from "@/lib/dashboard/format";

const VALID_PERIODS: Period[] = ["7d", "30d", "month", "quarter"];

export default async function ExecutiveDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period: Period = VALID_PERIODS.includes(params.period as Period)
    ? (params.period as Period)
    : "30d";

  // Suppress unused variable warning -- period will be used when aggregator supports period filtering
  void period;

  const supabase = createAdminClient();

  const { data: snapshot, error } = await supabase
    .from("dashboard_snapshots")
    .select("*")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <BarChart3 className="size-16 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          Unable to load dashboard data
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          There was a problem reading the latest snapshot. This is usually
          temporary -- try refreshing the page.
        </p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <BarChart3 className="size-16 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No dashboard data yet</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          The dashboard aggregator has not run yet. Data will appear
          automatically within 2 hours as collectors populate snapshots.
        </p>
      </div>
    );
  }

  // Parse and validate JSONB data with Zod
  const metricsResult = DashboardMetricsSchema.safeParse(snapshot.metrics);
  const freshnessResult = SourceFreshnessSchema.safeParse(
    snapshot.source_freshness
  );

  if (!metricsResult.success || !freshnessResult.success) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <BarChart3 className="size-16 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          Unable to load dashboard data
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          There was a problem reading the latest snapshot. This is usually
          temporary -- try refreshing the page.
        </p>
      </div>
    );
  }

  const metrics = metricsResult.data;
  const freshness = freshnessResult.data;

  // Fetch historical snapshots for time series charts
  const historicalResult = await supabase
    .from("dashboard_snapshots")
    .select("metrics, computed_at")
    .order("computed_at", { ascending: true })
    .limit(360);

  // Transform historical data server-side into chart-ready arrays
  const activityData = (historicalResult.data ?? []).map((s: { metrics: Record<string, unknown>; computed_at: string }) => {
    const m = s.metrics as Record<string, unknown>;
    const runsBySource = m?.runsBySource as Record<string, number> | undefined;
    return {
      date: s.computed_at.slice(0, 10),
      pipeline: runsBySource?.pipeline ?? 0,
      zapier: runsBySource?.zapier ?? 0,
      orqai: runsBySource?.orqai ?? 0,
    };
  });

  const successRateData = (historicalResult.data ?? []).map((s: { metrics: Record<string, unknown>; computed_at: string }) => {
    const m = s.metrics as Record<string, unknown>;
    const ts = (m?.timeSeries as Array<Record<string, unknown>> | undefined)?.[0];
    return {
      date: s.computed_at.slice(0, 10),
      rate: (ts?.successRate as number | null) ?? null,
    };
  });

  const costTrendData = (historicalResult.data ?? []).map((s: { metrics: Record<string, unknown>; computed_at: string }) => {
    const m = s.metrics as Record<string, unknown>;
    const ts = (m?.timeSeries as Array<Record<string, unknown>> | undefined)?.[0];
    return {
      date: s.computed_at.slice(0, 10),
      costPerRun: (ts?.costPerRun as number | null) ?? null,
    };
  });

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              360-degree overview of automation activity, health, and ROI
            </p>
          </div>
          <PeriodSelector />
        </div>

        {/* KPI Grid */}
        <KpiGrid
          metrics={metrics}
          freshness={freshness}
          computedAt={snapshot.computed_at}
        />

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList>
            <TabsTrigger value="activity">Activity & Performance</TabsTrigger>
            <TabsTrigger value="projects">Projects & Lifecycle</TabsTrigger>
            <TabsTrigger value="roi">ROI & Cost</TabsTrigger>
            <TabsTrigger value="sources">Source Status</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="py-6 space-y-8">
            <div>
              <h3 className="text-base font-normal mb-4">Runs Over Time</h3>
              <ActivityChart data={activityData} />
            </div>
            <div>
              <h3 className="text-base font-normal mb-4">
                Success Rate Trend
              </h3>
              <SuccessRateChart data={successRateData} />
            </div>
            <div>
              <h3 className="text-base font-normal mb-4">
                Per-Project Health
              </h3>
              <ProjectHealthTable projects={metrics.projectHealth} />
            </div>
            {metrics.agentMetrics && metrics.agentMetrics.length > 0 && (
              <div>
                <h3 className="text-base font-normal mb-4">
                  Per-Agent Orq.ai Metrics
                </h3>
                <AgentMetricsTable agents={metrics.agentMetrics} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="py-6 space-y-8">
            <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
              <div>
                <h3 className="text-base font-normal mb-4">
                  Status Distribution
                </h3>
                <StatusDistributionChart data={metrics.projectsByStatus} />
              </div>
              <div>
                <h3 className="text-base font-normal mb-4">
                  Automation Type Breakdown
                </h3>
                <TypeBreakdownChart data={metrics.projectsByType} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="roi" className="py-6 space-y-8">
            <div>
              <h3 className="text-base font-normal mb-4">ROI by Project</h3>
              <RoiTable
                projects={metrics.roiByProject}
                totalProjects={metrics.totalProjects}
                projectsWithBaselines={metrics.projectsWithBaselines}
              />
            </div>
            <div>
              <h3 className="text-base font-normal mb-4">
                Cost Per Run Trend
              </h3>
              <CostTrendChart data={costTrendData} />
            </div>
          </TabsContent>

          <TabsContent value="sources" className="py-6">
            {/* Source Status cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <SourceStatusCard
                source="Agent Workforce"
                metrics={{
                  "Pipeline Runs": metrics.runsBySource.pipeline,
                  "Success Rate":
                    metrics.projectHealth.length > 0
                      ? `${Math.round(
                          metrics.projectHealth.reduce(
                            (sum, p) => sum + (p.successRate ?? 0),
                            0
                          ) / metrics.projectHealth.length
                        )}%`
                      : "N/A",
                }}
                freshness={{
                  lastTimestamp: freshness.pipeline.lastRun,
                  stale: freshness.pipeline.stale,
                }}
                health={freshness.pipeline.stale ? "yellow" : "green"}
              />
              <SourceStatusCard
                source="Zapier"
                metrics={{
                  "Active Zaps":
                    metrics.runsBySource.zapier > 0
                      ? String(metrics.runsBySource.zapier)
                      : "N/A",
                  "Tasks Used": formatCompactNumber(
                    metrics.runsBySource.zapier
                  ),
                }}
                freshness={{
                  lastTimestamp: freshness.zapier.lastScraped,
                  stale: freshness.zapier.stale,
                  usingFallback: freshness.zapier.usingFallback,
                  fallbackTimestamp: freshness.zapier.fallbackTimestamp,
                  validationStatus: freshness.zapier.validationStatus,
                }}
                health={
                  freshness.zapier.stale
                    ? "yellow"
                    : freshness.zapier.usingFallback
                      ? "yellow"
                      : "green"
                }
              />
              <SourceStatusCard
                source="Orq.ai"
                metrics={{
                  "Total Requests": formatCompactNumber(
                    metrics.orqaiTotalRequests
                  ),
                  "Total Cost": formatCurrency(
                    metrics.orqaiTotalCost,
                    "USD"
                  ),
                  "Avg Latency":
                    metrics.healthComponents.latencyScore > 0
                      ? `${Math.round(100 - metrics.healthComponents.latencyScore)}ms`
                      : "N/A",
                }}
                freshness={{
                  lastTimestamp: freshness.orqai.lastCollected,
                  stale: freshness.orqai.stale,
                }}
                health={freshness.orqai.stale ? "yellow" : "green"}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
