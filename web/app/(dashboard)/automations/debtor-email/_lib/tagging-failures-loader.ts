// Phase 67 (D-08, R-03) — Bulk Review enrichment for iController tagging failures.
//
// Mirrors coordinator-runs-loader.ts shape. Bulk-loads debtor.email_labels rows
// for the predicted-page automation_run row ids, keyed by automation_runs.result
// ->>email_id (which equals email_labels.email_id). Sparse Map: rows without a
// failed-tag email_label entry stay un-enriched.
//
// The helper accepts an injectable `admin` client so it is unit-testable in
// isolation (see _lib/__tests__/tagging-failures-loader.test.ts). page.tsx
// calls the zero-arg overload that constructs the default admin client.
//
// Phase 71 (LERN-*) will broaden the surface (retry-tagging button); Phase 67
// ships read-only badge + screenshot links.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TaggingFailureSummary {
  email_label_id: string;
  icontroller_tag_status: string;
  error: string | null;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
}

/**
 * Bulk-load tagging-failure summaries for a set of automation_run rows.
 *
 * Inputs: a list of `{ automation_run_id, email_id }` (the email_id comes
 * from automation_runs.result->>email_id; the caller extracts it).
 *
 * Returns: Map<automation_run_id, TaggingFailureSummary> — sparse. Only
 * rows where the corresponding email_labels row has
 * icontroller_tag_status='failed' are included. Successful tags ('tagged')
 * and non-dispatched states ('skipped_*', 'pending') are not enriched
 * because Bulk Review's purpose here is to surface deferred runs.
 *
 * The `admin` parameter is injectable to make this helper unit-testable
 * against a simple stub. Production callers use the zero-arg overload.
 */
export async function loadTaggingFailuresForReview(
  pairs: Array<{ automation_run_id: string; email_id: string }>,
  admin: SupabaseClient = createAdminClient(),
): Promise<Map<string, TaggingFailureSummary>> {
  const result = new Map<string, TaggingFailureSummary>();
  if (pairs.length === 0) return result;

  const emailIds = Array.from(new Set(pairs.map((p) => p.email_id)));

  const { data, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .select(
      "id, email_id, icontroller_tag_status, error, screenshot_before_url, screenshot_after_url",
    )
    .in("email_id", emailIds)
    .eq("icontroller_tag_status", "failed");
  if (error) {
    throw new Error(
      `loadTaggingFailuresForReview: ${
        (error as { message?: string }).message ?? "unknown supabase error"
      }`,
    );
  }

  type Row = {
    id: string;
    email_id: string;
    icontroller_tag_status: string;
    error: string | null;
    screenshot_before_url: string | null;
    screenshot_after_url: string | null;
  };
  const byEmailId = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    // Multi-row collision (race/retry): last-write-wins.
    byEmailId.set(r.email_id, r);
  }

  for (const pair of pairs) {
    const row = byEmailId.get(pair.email_id);
    if (!row) continue;
    result.set(pair.automation_run_id, {
      email_label_id: row.id,
      icontroller_tag_status: row.icontroller_tag_status,
      error: row.error,
      screenshot_before_url: row.screenshot_before_url,
      screenshot_after_url: row.screenshot_after_url,
    });
  }
  return result;
}
