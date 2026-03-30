import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeHealthScore,
  computeDataFreshnessScore,
  computeLatencyScore,
} from "./health-score";
import { STALENESS_THRESHOLDS, ROI_DEFAULTS } from "./types";
import type { DashboardMetrics, SourceFreshness } from "./metrics-schema";
import type { HealthStatus } from "./types";

/**
 * Computes all dashboard metrics from source tables.
 *
 * Reads from 5 source tables:
 * - projects (status, automation_type, ROI baselines)
 * - pipeline_runs (execution throughput, success rates)
 * - pipeline_steps (step-level data, unused in v1 but available)
 * - zapier_snapshots (Zapier automation metrics -- uses last VALID snapshot)
 * - orqai_snapshots (Orq.ai agent metrics)
 *
 * Also reads ROI global defaults from the settings table.
 */
export async function computeDashboardMetrics(
  periodStart: Date,
  periodEnd: Date
): Promise<{ metrics: DashboardMetrics; freshness: SourceFreshness }> {
  const admin = createAdminClient();

  // ── Parallel source queries ──────────────────────────────────────
  const [
    projectsRes,
    pipelineRunsRes,
    _pipelineStepsRes,
    validZapierRes,
    orqaiRes,
    latestZapierOverallRes,
    roiDefaultsRes,
  ] = await Promise.all([
    admin
      .from("projects")
      .select(
        "id, name, status, automation_type, manual_minutes_per_task, task_frequency_per_month, hourly_cost_eur"
      ),
    admin
      .from("pipeline_runs")
      .select("id, project_id, status, started_at, completed_at, created_at")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString()),
    admin
      .from("pipeline_steps")
      .select("id, run_id, status, started_at, completed_at"),
    // Last VALID Zapier snapshot (for metrics)
    admin
      .from("zapier_snapshots")
      .select("*")
      .eq("validation_status", "valid")
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Latest Orq.ai snapshot
    admin
      .from("orqai_snapshots")
      .select("*")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Latest Zapier snapshot (any status) for fallback detection
    admin
      .from("zapier_snapshots")
      .select("id, validation_status, scraped_at")
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Global ROI defaults from settings
    admin
      .from("settings")
      .select("value")
      .eq("key", "dashboard_roi_defaults")
      .maybeSingle(),
  ]);

  const projects = projectsRes.data ?? [];
  const pipelineRuns = pipelineRunsRes.data ?? [];
  const latestValidZapier = validZapierRes.data;
  const latestOrqai = orqaiRes.data;
  const latestZapierOverall = latestZapierOverallRes.data;

  // Parse ROI defaults from settings or use constants
  const globalDefaults = roiDefaultsRes.data?.value
    ? parseRoiDefaults(roiDefaultsRes.data.value)
    : ROI_DEFAULTS;

  // ── KPI: Active automations ──────────────────────────────────────
  const liveProjects = projects.filter((p) => p.status === "live").length;
  const activeAutomations =
    liveProjects +
    (latestValidZapier?.active_zaps ?? 0) +
    (latestOrqai?.total_deployments ?? 0);

  // ── KPI: Execution throughput ────────────────────────────────────
  const executionThroughput =
    pipelineRuns.length +
    (latestValidZapier?.tasks_used ?? 0) +
    (latestOrqai?.total_requests ?? 0);

  // ── Projects by status ───────────────────────────────────────────
  const projectsByStatus: Record<string, number> = {};
  for (const p of projects) {
    projectsByStatus[p.status] = (projectsByStatus[p.status] ?? 0) + 1;
  }

  // ── Projects by type ─────────────────────────────────────────────
  const projectsByType: Record<string, number> = {};
  for (const p of projects) {
    const t = p.automation_type ?? "unknown";
    projectsByType[t] = (projectsByType[t] ?? 0) + 1;
  }

  // ── Runs by source ───────────────────────────────────────────────
  const runsBySource = {
    pipeline: pipelineRuns.length,
    zapier: latestValidZapier?.tasks_used ?? 0,
    orqai: latestOrqai?.total_requests ?? 0,
  };

  // ── Project health ───────────────────────────────────────────────
  const projectHealth = projects.map((project) => {
    const projectRuns = pipelineRuns.filter(
      (r) => r.project_id === project.id
    );
    const completedRuns = projectRuns.filter(
      (r) => r.status === "completed"
    ).length;
    const totalRuns = projectRuns.length;
    const successRate =
      totalRuns > 0
        ? Math.round((completedRuns / totalRuns) * 100)
        : null;

    let health: HealthStatus;
    if (successRate === null || successRate >= 90) {
      health = "green";
    } else if (successRate >= 70) {
      health = "yellow";
    } else {
      health = "red";
    }

    // Find the most recent run's completed_at
    const sortedRuns = [...projectRuns].sort(
      (a, b) =>
        new Date(b.completed_at ?? b.created_at).getTime() -
        new Date(a.completed_at ?? a.created_at).getTime()
    );
    const lastRun = sortedRuns[0]?.completed_at ?? null;

    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      lastRun,
      successRate,
      health,
    };
  });

  // ── ROI per project ──────────────────────────────────────────────
  let totalHoursSaved = 0;
  let totalFinancialImpact = 0;
  let projectsWithBaselines = 0;

  const roiByProject = projects.map((project) => {
    const minutesPerTask =
      project.manual_minutes_per_task !== null
        ? Number(project.manual_minutes_per_task)
        : globalDefaults.minutesPerTask;
    const tasksPerMonth =
      project.task_frequency_per_month !== null
        ? Number(project.task_frequency_per_month)
        : globalDefaults.tasksPerMonth;
    const hourlyCost =
      project.hourly_cost_eur !== null
        ? Number(project.hourly_cost_eur)
        : globalDefaults.hourlyCostEur;

    const hasBaseline = project.manual_minutes_per_task !== null;
    if (hasBaseline) projectsWithBaselines++;

    const estimatedHoursSaved = (minutesPerTask * tasksPerMonth) / 60;
    const estimatedEurImpact = estimatedHoursSaved * hourlyCost;

    totalHoursSaved += estimatedHoursSaved;
    totalFinancialImpact += estimatedEurImpact;

    return {
      projectId: project.id,
      name: project.name,
      estimatedHoursSaved: Math.round(estimatedHoursSaved * 10) / 10,
      estimatedEurImpact: Math.round(estimatedEurImpact),
      hasBaseline,
    };
  });

  // ── Agent metrics ────────────────────────────────────────────────
  const agentMetrics = (latestOrqai?.per_agent_metrics ?? []).map(
    (agent: {
      agent_name: string;
      requests: number;
      latency_ms: number;
      cost: number;
      errors: number;
    }) => ({
      name: agent.agent_name,
      requests: agent.requests,
      latencyMs: agent.latency_ms,
      cost: agent.cost,
      errorRate:
        agent.requests > 0
          ? Math.round((agent.errors / agent.requests) * 100 * 10) / 10
          : 0,
    })
  );

  // ── Source freshness ─────────────────────────────────────────────
  const now = Date.now();

  const lastPipelineRun = pipelineRuns.length
    ? [...pipelineRuns].sort(
        (a, b) =>
          new Date(b.completed_at ?? b.created_at).getTime() -
          new Date(a.completed_at ?? a.created_at).getTime()
      )[0]
    : null;
  const lastPipelineTimestamp =
    lastPipelineRun?.completed_at ?? lastPipelineRun?.created_at ?? null;

  const zapierUsingFallback =
    latestZapierOverall !== null &&
    latestZapierOverall.validation_status !== "valid" &&
    latestValidZapier !== null;

  const freshness: SourceFreshness = {
    pipeline: {
      lastRun: lastPipelineTimestamp,
      stale: lastPipelineTimestamp
        ? now - new Date(lastPipelineTimestamp).getTime() >
          STALENESS_THRESHOLDS.pipeline
        : true,
    },
    zapier: {
      lastScraped: latestValidZapier?.scraped_at ?? null,
      validationStatus:
        (latestZapierOverall?.validation_status as
          | "valid"
          | "suspicious"
          | "failed") ?? null,
      stale: latestValidZapier?.scraped_at
        ? now - new Date(latestValidZapier.scraped_at).getTime() >
          STALENESS_THRESHOLDS.zapier
        : true,
      usingFallback: zapierUsingFallback,
      fallbackTimestamp: zapierUsingFallback
        ? latestValidZapier!.scraped_at
        : null,
    },
    orqai: {
      lastCollected: latestOrqai?.collected_at ?? null,
      stale: latestOrqai?.collected_at
        ? now - new Date(latestOrqai.collected_at).getTime() >
          STALENESS_THRESHOLDS.orqai
        : true,
    },
  };

  // ── Health score ─────────────────────────────────────────────────
  const allRuns = pipelineRuns.length;
  const allCompleted = pipelineRuns.filter(
    (r) => r.status === "completed"
  ).length;
  const overallSuccessRate =
    allRuns > 0 ? (allCompleted / allRuns) * 100 : 100;
  const overallErrorRate =
    latestOrqai?.error_rate_pct != null
      ? Number(latestOrqai.error_rate_pct)
      : 0;

  const dataFreshnessScore = computeDataFreshnessScore(freshness);
  const latencyScore = computeLatencyScore(
    latestOrqai?.avg_latency_ms != null
      ? Number(latestOrqai.avg_latency_ms)
      : null
  );

  const healthResult = computeHealthScore({
    successRate: overallSuccessRate,
    errorRate: overallErrorRate,
    dataFreshnessScore,
    latencyScore,
  });

  // ── Build final metrics object ───────────────────────────────────
  const metrics: DashboardMetrics = {
    activeAutomations,
    executionThroughput,
    healthScore: healthResult.score,
    estimatedHoursSaved: Math.round(totalHoursSaved * 10) / 10,
    estimatedFinancialImpact: Math.round(totalFinancialImpact),
    orqaiTotalRequests: latestOrqai?.total_requests ?? 0,
    orqaiTotalCost: latestOrqai?.total_cost_usd
      ? Number(latestOrqai.total_cost_usd)
      : 0,
    orqaiTotalTokens: latestOrqai?.total_tokens ?? 0,
    projectsByStatus,
    projectsByType,
    runsBySource,
    projectHealth,
    agentMetrics,
    roiByProject,
    projectsWithBaselines,
    totalProjects: projects.length,
    healthComponents: healthResult.components,
  };

  return { metrics, freshness };
}

// ── Helpers ────────────────────────────────────────────────────────

function parseRoiDefaults(value: unknown): { minutesPerTask: number; tasksPerMonth: number; hourlyCostEur: number } {
  if (typeof value === "object" && value !== null) {
    let parsed = value as Record<string, unknown>;
    // Handle JSONB double-encoding
    while (typeof parsed === "string") {
      parsed = JSON.parse(parsed as string);
    }
    return {
      minutesPerTask:
        typeof parsed.minutesPerTask === "number"
          ? parsed.minutesPerTask
          : ROI_DEFAULTS.minutesPerTask,
      tasksPerMonth:
        typeof parsed.tasksPerMonth === "number"
          ? parsed.tasksPerMonth
          : ROI_DEFAULTS.tasksPerMonth,
      hourlyCostEur:
        typeof parsed.hourlyCostEur === "number"
          ? parsed.hourlyCostEur
          : ROI_DEFAULTS.hourlyCostEur,
    };
  }
  return { ...ROI_DEFAULTS };
}
