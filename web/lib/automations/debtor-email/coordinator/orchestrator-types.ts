// Phase 65 D-03 — orchestrator-planner output (zod, mirrors Studio Tool B "debtor-orchestrator-output-v1").
import { z } from "zod";
import { INTENT } from "./types";

export const orchestratorHandlerSchema = z.object({
  handler_key: z.string().min(1),
  intent: z.enum(INTENT),
  context_payload: z.record(z.string(), z.unknown()),
});

export const orchestratorOutputSchema = z.object({
  handlers: z.array(orchestratorHandlerSchema).min(1).max(5),
  ordering: z.enum(["parallel", "sequential"]),
  notes: z.string().max(500).nullable().optional(),
});

export type OrchestratorHandler = z.infer<typeof orchestratorHandlerSchema>;
export type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>;
