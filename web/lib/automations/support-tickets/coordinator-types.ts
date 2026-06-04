// Plan 03-03 Task 1 — Stage 3 coordinator output schema + intent registry mirror.
//
// This file is the **client-side** half of the two-layer hallucination guard
// for the Stage 3 coordinator agent.
//
// Layer A — server-side: Orq's `/v3/router/responses` enforces the JSON Schema
//   strict mode (see `.planning/phases/03-stage-3-coordinator/03-02-orq-agent-spec.md`).
//   The model CANNOT return a `chosen_intent` outside the listed enum.
//
// Layer B — client-side (this file + the runner): we Zod-parse the response
//   AND cross-check `chosen_intent` against `public.swarm_intents` rows
//   (registry membership). If a hallucinated key survives layer A by some
//   future Orq behavior change, layer B catches it.
//
// `SUPPORT_TICKETS_INTENTS` is the canonical literal-union mirror of the 5
// rows seeded by migration `20260526a_support_tickets_phase1.sql §J` for
// `swarm_type='support-tickets'`. If a 6th intent is added, BUMP this const
// in the SAME commit as the migration.
//
// `coordinatorOutputSchema` mirrors the JSON Schema strict response_format
// declared in the 03-02 spec (anyOf for nullable per CLAUDE.md "Orq.ai" rule).

import { z } from "zod";

export const SUPPORT_TICKETS_INTENTS = [
  "clarification-needed",
  "duplicate",
  "info-answer",
  "clickup-escalate",
  "vendor-draft",
] as const;

export type SupportTicketIntent = (typeof SUPPORT_TICKETS_INTENTS)[number];

export const coordinatorOutputSchema = z.object({
  chosen_intent: z.enum(SUPPORT_TICKETS_INTENTS),
  completeness_verdict: z.enum(["complete", "incomplete"]),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().min(1),
  missing_information: z.array(z.string()).nullable(),
});

export type CoordinatorOutput = z.infer<typeof coordinatorOutputSchema>;
