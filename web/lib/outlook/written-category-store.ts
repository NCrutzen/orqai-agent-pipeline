// Phase 117 Plan 01 Task 3 (D-4 / D-5) — per-message written-category store helper.
//
// Records the LAST `AI:` category this worker wrote per source message (keyed by
// email_pipeline.emails.id = email_id) and reads it back. Two purposes:
//
//   1. Idempotency / anti-churn (D-4): Plan 02's worker calls Graph only when the
//      new top-1 intent differs from the last-written AI: category — replay/re-run
//      with the same verdict makes no Graph call. The upsert on conflict (email_id)
//      means a verdict change UPDATEs in place, never accumulates duplicate rows.
//
//   2. 112.5 baseline (D-5): swarm-behavior-sync.ts maps Graph source_id ->
//      email_pipeline.emails.id and currently has no persisted prevCategories, so its
//      `category_edited` transition is dormant. This store closes that gap from the
//      write side — keyed by email_id so 112.5 can join source_id → email_id →
//      baseline and diff the live category against what the worker wrote.
//
// Mirrors the admin-select shape of web/lib/email-behavior/folder-map.ts
// (service-role client passed in as a parameter; no swarm literal). The backing
// table public.swarm_written_categories ships in the sibling migration
// 20260615_phase117_intent_label_store_and_gate.sql (RLS-enabled, applied in Plan 02).

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "swarm_written_categories";

export interface WrittenCategoryInput {
  /** email_pipeline.emails.id — PRIMARY KEY / upsert conflict target + 112.5 join key. */
  email_id: string;
  swarm_type: string;
  source_mailbox: string;
  /** The full `AI:`-prefixed category written to the source message (D-1). */
  ai_category: string;
}

export interface WrittenCategoryRow {
  ai_category: string;
  written_at: string;
}

/**
 * Record (upsert) the AI category this worker just wrote for a message. Idempotent
 * on email_id: re-recording the same message updates ai_category + written_at and
 * never inserts a duplicate (D-4).
 */
export async function recordWrittenCategory(
  admin: SupabaseClient,
  input: WrittenCategoryInput,
): Promise<void> {
  await admin.from(TABLE).upsert(
    {
      email_id: input.email_id,
      swarm_type: input.swarm_type,
      source_mailbox: input.source_mailbox,
      ai_category: input.ai_category,
      written_at: new Date().toISOString(),
    },
    { onConflict: "email_id" },
  );
}

/**
 * Read the last AI category written for a message. Returns null (NOT a throw) when
 * no row exists — the worker treats null as "never written, safe to write" (D-4).
 */
export async function readWrittenCategory(
  admin: SupabaseClient,
  emailId: string,
): Promise<WrittenCategoryRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select("ai_category, written_at")
    .eq("email_id", emailId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WrittenCategoryRow;
}
