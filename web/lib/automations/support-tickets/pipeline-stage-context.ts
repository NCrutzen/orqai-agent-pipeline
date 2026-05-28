// Plan 02-02 Task 1 — PipelineStageContext v1 schema + types.
//
// This file is the locked TS+Zod mirror of `public.swarms.canonical_context_shape`
// for `swarm_type='support-tickets'`, seeded by migration
// 20260526a_support_tickets_phase1.sql §J. Shape:
//
//   {
//     "version": "2026-05-26.v1",
//     "fields": {
//       "prior_tickets_same_user":   { "type": "array", ... },
//       "prior_tickets_same_system": { "type": "array", ... },
//       "similar_tickets":           { "type": "array", ... },
//       "prior_clarifications":      { "type": "array", ... }
//     }
//   }
//
// If that DB row's `version` field changes (e.g. v2 with a new field or a
// retired field), BUMP `CONTEXT_VERSION` here in the same commit. The Plan
// 02-05 acceptance check cross-references the live DB row against this
// constant. Subsequent enrichment plans (02-03 transcript/PII, 02-04
// system-detect + prior-tickets, 02-05 embeddings + similar-tickets) only
// MUTATE individual array fields — they MUST NOT alter the shape.
//
// Item-level shapes are intentionally loose in v1 (`z.object({}).passthrough()`):
// Plans 02-04 (PriorTicketSummary) and 02-05 (SimilarTicket) will tighten with
// concrete shapes when they ship. Stricting the items now would force a
// premature schema commitment.

import { z } from "zod";

import { USER_CHOSEN_TYPES } from "./types";

export const CONTEXT_VERSION = "2026-05-26.v1" as const;

/**
 * Plan 02-04 Task 2 tightening (replaces the Plan 02-02 passthrough stub).
 * Mirrors the column shape of `public.support_tickets` rows surfaced through
 * `loadUserContext`. `transcript_excerpt` is the first 300 chars of the
 * source transcript (or null when transcript itself is null).
 */
export const priorTicketSummarySchema = z.object({
  id: z.string().uuid(),
  submission_id: z.string().uuid(),
  user_chosen_type: z.enum(USER_CHOSEN_TYPES),
  proposed_system: z.string().nullable(),
  final_intent: z.string().nullable(),
  clickup_status: z.string().nullable(),
  submitted_at: z.string().datetime(),
  transcript_excerpt: z.string().nullable(),
});
export type PriorTicketSummary = z.infer<typeof priorTicketSummarySchema>;

/** Phase 2 Plan 02-05 fills with concrete fields (ticket_id, similarity score, snippet, etc.). */
export const similarTicketSchema = z.object({}).passthrough();
export type SimilarTicket = z.infer<typeof similarTicketSchema>;

/** Phase 4 re-entry fills with concrete clarification-round shape. Empty in v1. */
export const clarificationRoundSchema = z.object({}).passthrough();
export type ClarificationRound = z.infer<typeof clarificationRoundSchema>;

/**
 * Canonical Stage-2-output / Stage-3-input contract for the support-tickets
 * swarm. `.strict()` keeps decision_details.context_version clean — any new
 * field added in v2 requires a CONTEXT_VERSION bump (and a Phase 1 migration
 * update on `swarms.canonical_context_shape`).
 */
export const pipelineStageContextSchema = z
  .object({
    context_version: z.literal(CONTEXT_VERSION),
    prior_tickets_same_user: z.array(priorTicketSummarySchema),
    prior_tickets_same_system: z.array(priorTicketSummarySchema),
    similar_tickets: z.array(similarTicketSchema),
    prior_clarifications: z.array(clarificationRoundSchema),
  })
  .strict();

export type PipelineStageContext = z.infer<typeof pipelineStageContextSchema>;

/**
 * Plan 02-02 baseline factory. Stage-2 worker emits this on every accepted
 * submission as the v1 empty-context row; downstream Plans 02-03..02-05
 * populate individual arrays.
 */
export function emptyPipelineStageContext(): PipelineStageContext {
  return {
    context_version: CONTEXT_VERSION,
    prior_tickets_same_user: [],
    prior_tickets_same_system: [],
    similar_tickets: [],
    prior_clarifications: [],
  };
}
