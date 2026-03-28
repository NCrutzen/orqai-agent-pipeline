import { z } from "zod";

/**
 * Zod schemas for validating Orq.ai REST API analytics responses.
 *
 * Uses .passthrough() because exact response shapes from the analytics
 * endpoints need verification from live API calls. The first run will
 * log the actual shape for future refinement.
 */

// Flexible schema for workspace-level analytics overview
export const OrqaiWorkspaceSchema = z
  .object({
    total_deployments: z.number().optional(),
    total_requests: z.number().optional(),
    total_cost: z.number().optional(),
    total_tokens: z.number().optional(),
    avg_latency_ms: z.number().optional(),
    error_count: z.number().optional(),
    error_rate: z.number().optional(),
  })
  .passthrough();

// Schema for per-agent metrics from analytics query with group_by: agent_name
export const OrqaiAgentMetricSchema = z
  .object({
    agent_name: z.string(),
    requests: z.number().optional().default(0),
    cost: z.number().optional().default(0),
    latency_ms: z.number().optional().default(0),
    errors: z.number().optional().default(0),
  })
  .passthrough();

export const OrqaiAgentMetricsArraySchema = z.array(OrqaiAgentMetricSchema);

export type OrqaiWorkspaceData = z.infer<typeof OrqaiWorkspaceSchema>;
export type OrqaiAgentMetric = z.infer<typeof OrqaiAgentMetricSchema>;
