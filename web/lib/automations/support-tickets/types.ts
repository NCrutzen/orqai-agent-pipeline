// Plan 01-02 — canonical types for the support-tickets swarm.
//
// USER_CHOSEN_TYPES is the literal-union source-of-truth that mirrors the SQL
// CHECK constraint on `public.support_tickets.user_chosen_type` defined in
// migration 20260526a_support_tickets_phase1.sql §C. Any addition requires:
//   (a) a new migration updating the CHECK constraint
//   (b) updating this array (per ROUTE-03)
//
// Alphabetical order is the documented invariant — keeps diffs stable and the
// codegen mental model identical to other registry-driven enums in this repo
// (e.g. `entity_brand`). The matching SQL CHECK is unordered, so alphabetizing
// here is a no-op for DB semantics and a win for human review.

import { z } from "zod";

export const USER_CHOSEN_TYPES = [
  "bug",
  "feature-request",
  "info-request",
  "other",
  "question",
] as const;

export type UserChosenType = (typeof USER_CHOSEN_TYPES)[number];

/**
 * Phase 1 ingest body schema. `.strict()` rejects unknown top-level fields
 * (T-01-10 mitigation — prevents privilege injection of e.g. `submission_id`,
 * `attempt`, `final_intent`).
 *
 * `submission_id` and `automation_run_id` are server-generated only; clients
 * MUST NOT supply them. `attempt` is server-managed across clarification
 * re-entries (Phase 4 concern).
 */
export const ingestBodySchema = z
  .object({
    submitter_id: z.string().min(1),
    user_chosen_type: z.enum(USER_CHOSEN_TYPES),
    video_storage_url: z.string().url().nullable().optional(),
    video_size_bytes: z.number().int().nonnegative().nullable().optional(),
    device_fingerprint: z.string().optional(),
    submitted_at: z.string().datetime().optional(),
  })
  .strict();

export type IngestBody = z.infer<typeof ingestBodySchema>;

export type IngestAction =
  | "stage_0_dispatched"
  | "rejected_safety"
  | "rejected_routing"
  | "failed";

export interface IngestResponse {
  action: IngestAction;
  submission_id?: string;
  automation_run_id?: string;
  reason?: string;
  error?: string;
}
