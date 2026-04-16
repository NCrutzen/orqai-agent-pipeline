/**
 * Zod output schema for the Orq.ai Briefing Agent. Mirrors the JSON Schema
 * attached to the agent's `response_format`. Zod is slightly more permissive
 * than the JSON Schema (e.g. headline maxLength 140 vs 90) so model drift
 * doesn't drop a valid-enough output on the floor.
 */

import { z } from "zod";

export const briefingAlertSchema = z.object({
  severity: z.enum(["info", "warn", "critical"]),
  message: z.string().min(1),
});

export const briefingActionSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
});

export const briefingOutputSchema = z.object({
  headline: z.string().min(1).max(140),
  summary: z.string().min(1),
  alerts: z.array(briefingAlertSchema).max(5),
  suggested_actions: z.array(briefingActionSchema).max(3),
});

export type BriefingOutput = z.infer<typeof briefingOutputSchema>;
export type BriefingAlert = z.infer<typeof briefingAlertSchema>;
export type BriefingAction = z.infer<typeof briefingActionSchema>;

/**
 * JSON Schema used in the Orq.ai agent's `response_format.json_schema`.
 * Stricter than Zod -- narrower maxLength + additionalProperties false.
 */
export const briefingJsonSchema = {
  name: "briefing",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string", maxLength: 90 },
      summary: { type: "string" },
      alerts: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            severity: { enum: ["info", "warn", "critical"] },
            message: { type: "string" },
          },
          required: ["severity", "message"],
        },
      },
      suggested_actions: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["action", "rationale"],
        },
      },
    },
    required: ["headline", "summary", "alerts", "suggested_actions"],
  },
} as const;
