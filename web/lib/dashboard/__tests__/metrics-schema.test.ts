import { describe, it, expect } from "vitest";
import {
  DashboardMetricsSchema,
  SourceFreshnessSchema,
} from "../metrics-schema";

describe("DashboardMetricsSchema", () => {
  it("validates a complete metrics object", () => {
    const validMetrics = {
      activeAutomations: 24,
      executionThroughput: 1247,
      healthScore: 87,
      estimatedHoursSaved: 142,
      estimatedFinancialImpact: 8520,
      orqaiTotalRequests: 3241,
      orqaiTotalCost: 12.4,
      orqaiTotalTokens: 500000,
      projectsByStatus: { idea: 2, building: 3, testing: 1, live: 4 },
      projectsByType: { "zapier-only": 3, hybrid: 2 },
      runsBySource: { pipeline: 45, zapier: 800, orqai: 402 },
      projectHealth: [
        {
          projectId: "p1",
          name: "Test",
          status: "live",
          lastRun: "2026-03-30",
          successRate: 95,
          health: "green" as const,
        },
      ],
      roiByProject: [
        {
          projectId: "p1",
          name: "Test",
          estimatedHoursSaved: 40,
          estimatedEurImpact: 1800,
          hasBaseline: true,
        },
      ],
      projectsWithBaselines: 4,
      totalProjects: 10,
      healthComponents: {
        successRate: 95,
        errorRateInverse: 90,
        dataFreshness: 100,
        latencyScore: 85,
      },
    };
    expect(DashboardMetricsSchema.safeParse(validMetrics).success).toBe(true);
  });

  it("rejects metrics with missing required fields", () => {
    const invalid = { activeAutomations: 24 };
    expect(DashboardMetricsSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts extra fields via passthrough", () => {
    const withExtra = {
      activeAutomations: 24,
      executionThroughput: 0,
      healthScore: 50,
      estimatedHoursSaved: 0,
      estimatedFinancialImpact: 0,
      orqaiTotalRequests: 0,
      orqaiTotalCost: 0,
      orqaiTotalTokens: 0,
      projectsByStatus: {},
      projectsByType: {},
      runsBySource: { pipeline: 0, zapier: 0, orqai: 0 },
      projectHealth: [],
      roiByProject: [],
      projectsWithBaselines: 0,
      totalProjects: 0,
      healthComponents: {
        successRate: 0,
        errorRateInverse: 0,
        dataFreshness: 0,
        latencyScore: 0,
      },
      futureField: "should pass through",
    };
    const result = DashboardMetricsSchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success)
      expect((result.data as unknown as { futureField: string }).futureField).toBe("should pass through");
  });
});

describe("SourceFreshnessSchema", () => {
  it("validates complete freshness object", () => {
    const valid = {
      pipeline: { lastRun: "2026-03-30T10:00:00Z", stale: false },
      zapier: {
        lastScraped: "2026-03-30T08:00:00Z",
        validationStatus: "valid" as const,
        stale: false,
        usingFallback: false,
        fallbackTimestamp: null,
      },
      orqai: { lastCollected: "2026-03-30T09:00:00Z", stale: false },
    };
    expect(SourceFreshnessSchema.safeParse(valid).success).toBe(true);
  });
});
