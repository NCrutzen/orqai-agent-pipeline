// Phase 1 (milestone bulk-review-flow-ux) — P1-D-06.
// One-shot startup / migration-check guard. Asserts that the Phase 70
// partial index `pipeline_events_override_partial_idx` exists with the
// expected predicate `WHERE override IS NOT NULL`.
//
// CALLERS: app boot, a /healthz route, or a migration-test. NOT the hot
// path — `writeOverride` and `hydrateBulkReviewRow` (Plan 02) deliberately
// do NOT invoke this guard. The Phase 72 promotion recommender depends on
// this index for its partial-index-friendly read shape, so a silent drop
// must surface loudly.
//
// PostgREST caveat: `pg_indexes` lives in `pg_catalog`. Some Supabase
// projects do not expose pg_catalog views through the data API. If
// `.from("pg_indexes")` returns an error mentioning a missing relation /
// schema, the operator should:
//   1) call this guard from a server-side route (service-role admin), OR
//   2) add a thin SECURITY DEFINER function in a follow-up migration that
//      wraps the SELECT (out of scope for Phase 1 — this guard is
//      infrequent / one-shot).
// We do not add that migration here.

import type { SupabaseClient } from "@supabase/supabase-js";

const INDEX_NAME = "pipeline_events_override_partial_idx";
const EXPECTED_PREDICATE = "override IS NOT NULL";

export async function assertOverridePartialIndexExists(
  admin: SupabaseClient,
): Promise<void> {
  const { data, error } = await admin
    .from("pg_indexes")
    .select("indexname, indexdef")
    .eq("schemaname", "public")
    .eq("indexname", INDEX_NAME);

  if (error) {
    throw new Error(
      `[partial-index-guard] failed to query pg_indexes for ${INDEX_NAME} (Phase 70 contract): ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error(
      `[partial-index-guard] index ${INDEX_NAME} missing — Phase 70 migration (supabase/migrations/20260506a_pipeline_events.sql) did not run, or was dropped. The Phase 72 promotion recommender depends on this index.`,
    );
  }
  const def = (data[0] as { indexdef: string }).indexdef ?? "";
  if (!def.includes(EXPECTED_PREDICATE)) {
    throw new Error(
      `[partial-index-guard] index ${INDEX_NAME} exists but predicate is not "${EXPECTED_PREDICATE}". Found: ${def}`,
    );
  }
}
