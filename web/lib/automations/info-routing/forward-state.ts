// Phase 132 Plan 02 Task 1 (D-02 / FWD-01) — per-message forward idempotency store.
//
// Records the LAST forward outcome the Stage-4 forward worker reached per source
// message (keyed by email_pipeline.emails.id = email_id) and reads it back. The
// single purpose is D-02 idempotency / no double-forward on replay or re-process:
// the worker reads this store BEFORE createForward and short-circuits when the
// status is already 'sent', so the irreversible outbound send fires at most once
// even across Inngest replays.
//
// Mirrors web/lib/outlook/written-category-store.ts (Phase 117): a service-role
// client passed in as a parameter, an upsert-on-conflict(email_id) write, and a
// read that returns null (never throws) when no row exists. The backing table
// public.info_routing_forwards ships in the sibling migration
// 20260617e_phase132_forward_buckets_and_state.sql (RLS-enabled; applied in Plan 04).
//
// NO swarm literal — `swarm_type` is carried as plain data so the store is
// swarm-agnostic (SWARM-02). A dedicated table (RESEARCH OQ-2) gives Phase 134 a
// clean correction-event join + UNIQUE(email_id) idempotency.

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "info_routing_forwards";

export type ForwardStateStatus = "sent" | "held" | "skipped";

export interface ForwardStateInput {
  /** email_pipeline.emails.id — PRIMARY KEY / upsert conflict target. */
  email_id: string;
  swarm_type: string;
  status: ForwardStateStatus;
  /** The Graph draft id of the forward (server-generated). Null for skip/held. */
  draft_id?: string | null;
  /** The resolved department mailbox the forward was sent to. Null for skip/held. */
  target_mailbox?: string | null;
}

export interface ForwardStateRow {
  email_id: string;
  swarm_type: string;
  status: ForwardStateStatus;
  draft_id: string | null;
  target_mailbox: string | null;
  updated_at: string;
}

/**
 * Record (upsert) the forward outcome for a message. Idempotent on email_id:
 * re-recording the same message UPDATEs status/draft_id/target_mailbox/updated_at
 * in place and never inserts a duplicate (D-02). The status mirror lets Bulk
 * Review surface forward status cheaply.
 */
export async function recordForwardState(
  admin: SupabaseClient,
  input: ForwardStateInput,
): Promise<void> {
  await admin.from(TABLE).upsert(
    {
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      status: input.status,
      draft_id: input.draft_id ?? null,
      target_mailbox: input.target_mailbox ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email_id" },
  );
}

/**
 * Read the last forward state for a message. Returns null (NOT a throw) when no
 * row exists — the worker treats null as "never forwarded, safe to send" (D-02).
 */
export async function readForwardState(
  admin: SupabaseClient,
  emailId: string,
): Promise<ForwardStateRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select("email_id, swarm_type, status, draft_id, target_mailbox, updated_at")
    .eq("email_id", emailId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ForwardStateRow;
}
