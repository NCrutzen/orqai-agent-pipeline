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

// IN-01: single source of truth for the photo count limit — imported by both
// the Zod schema (max validation) and the FotoUpload component (UI gate).
export const MAX_PHOTO_COUNT = 10;

export const USER_CHOSEN_TYPES = [
  "bug",
  "feature-request",
  "info-request",
  "other",
  "question",
] as const;

export type UserChosenType = (typeof USER_CHOSEN_TYPES)[number];

/**
 * Upstream task tracker identifier (e.g. ClickUp task id like "CU-...").
 * Stored on `support_tickets.external_task_id` (canonical join location)
 * and in `pipeline_events.decision_details.external_task_id` (per-event
 * audit trail). Polymorphic per tracker — current implementation uses
 * ClickUp task ids; future trackers (Linear, Jira, etc.) can swap in by
 * updating only the upstream system and the value passed here.
 *
 * NOTE: this is NOT what flows into `pipeline_events.email_id`. That
 * column is UUID-typed across all swarms; for support-tickets it carries
 * the server-generated `submission_id` UUID (the swarm's internal stable
 * cross-stage handle, mirroring how email swarms use the email UUID).
 */
export type ExternalTaskId = string;

/**
 * Phase 2 ingest body schema. `.strict()` rejects unknown top-level fields
 * (T-01-10 / T-02-01 mitigation — prevents privilege injection of e.g.
 * `submission_id`, `attempt`, `final_intent`).
 *
 * `submission_id` and `automation_run_id` are server-generated only; clients
 * MUST NOT supply them. `attempt` is server-managed across clarification
 * re-entries (Phase 4 concern).
 *
 * CONTRACT-02 (Phase 2 D-03): `external_task_id` is now OPTIONAL. App-origin
 * submissions (Phase 2 submit flow) do not have an upstream tracker task id
 * before ingest. Zapier-origin flows still supply it. When present, the
 * `.min(1)` floor is preserved — empty string is rejected. It is persisted on
 * `support_tickets.external_task_id` and recorded in
 * `pipeline_events.decision_details.external_task_id` for audit trail.
 *
 * CONTRACT-01 (Phase 2 D-04): `systeem` is a new OPTIONAL field — the
 * `system_key` slug from `support_software_systems` chosen by the user in the
 * submit form. Machine-readable routing/triage signal. NULL for text-only
 * submissions or when "mijn systeem staat er niet bij" is chosen.
 */
export const ingestBodySchema = z
  .object({
    submitter_id: z.string().min(1),
    user_chosen_type: z.enum(USER_CHOSEN_TYPES),
    external_task_id: z.string().min(1).optional(), // CONTRACT-02: was required
    systeem: z.string().min(1).optional(),           // CONTRACT-01: new optional field
    video_storage_url: z.string().url().nullable().optional(),
    video_size_bytes: z.number().int().nonnegative().nullable().optional(),
    device_fingerprint: z.string().optional(),
    submitted_at: z.string().datetime().optional(),
    // CONTRACT-03 (Phase 5 D-09/D-10): soort = routing signal for Zapier;
    // photo_storage_urls = public storage URLs from support-tickets-photos bucket.
    // Both optional — additive, backward-compatible with existing software submissions.
    soort: z.enum(["software", "hardware"]).optional(),
    photo_storage_urls: z.array(z.string().url()).max(MAX_PHOTO_COUNT).optional(),
  })
  .strict(); // .strict() preserved — T-01-10 / T-02-01 unknown-field-injection mitigation

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
