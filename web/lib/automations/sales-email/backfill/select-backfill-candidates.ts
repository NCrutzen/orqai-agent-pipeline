/**
 * Phase 112 Plan 01 Task 1 — backfill candidate selection + Graph-id resolution
 * seam (D-07 / Pitfall 4).
 *
 * Corpus selection reuses the Phase 111 retro selector verbatim
 * (`selectCandidates`) for its hardened invariants: per-corpus truncation
 * fail-loud, the SugarCRM single-tenant guard (WR-06), dedup-by-email_id, and
 * the SALES_OUTLOOK_MAILBOX pin. We re-export those constants so callers keep a
 * single source of truth.
 *
 * The ONE thing the retro selector does NOT carry is the identifier the Graph
 * archive call needs. `archiveEmail`/`categorizeEmail` take the Graph message id
 * (`email_pipeline.emails.source_id`), NOT the RFC 5322 `internet_message_id`
 * (Pitfall 4). So this module additionally reads `source_id, internet_message_id`
 * for the selected email_ids and attaches both to each candidate, and exposes a
 * pure `resolveGraphIdSource` that the worker uses to decide whether it already
 * has the Graph id (Outlook-ingest rows) or must look the message up live by
 * internetMessageId (historic rows — D-07 live-presence confirmation).
 *
 * Pure (no clock reads, no randomness) — safe under Inngest replay (T-111-09).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectCandidates,
  SALES_OUTLOOK_MAILBOX,
  STAGE_1_RETRO_HARD_CAP,
  type RetroCandidate,
  type SelectCandidatesArgs,
} from "../retro/select-candidates";

export { SALES_OUTLOOK_MAILBOX, STAGE_1_RETRO_HARD_CAP };
export type { SelectCandidatesArgs };

/**
 * A retro candidate enriched with the two identifiers needed to resolve the
 * Graph message id. `source_id` is the Graph id (present for Outlook-ingest
 * rows); `internet_message_id` is the RFC 5322 id used to look a historic row
 * up live by internetMessageId.
 */
export type BackfillCandidate = RetroCandidate & {
  source_id: string | null;
  internet_message_id: string | null;
};

/**
 * The minimal shape resolveGraphIdSource needs — kept structural so the worker
 * and the unit test can both drive it without importing the full row type.
 */
export type GraphIdResolvable = {
  source_id: string | null;
  internet_message_id: string | null;
};

export type GraphIdResolution = {
  /** The Graph message id to pass to archiveEmail/categorizeEmail, or null. */
  graphId: string | null;
  /**
   * True when source_id is absent and the worker must look the message up live
   * by internetMessageId via Graph (Pitfall 4 / D-07) — both to confirm live
   * presence AND to obtain the Graph id. A no-hit is a no-op.
   */
  needsLivePresenceLookup: boolean;
};

/**
 * Resolve the archive-target Graph id for a candidate (Pitfall 4). Pure.
 *
 *   source_id present → use it directly (Outlook-ingest path), no live lookup.
 *   source_id absent   → flag for the Graph internetMessageId lookup (D-07).
 *
 * NEVER returns internet_message_id as the archive target — Graph does not
 * accept the RFC id for /messages/{id}/move.
 */
export function resolveGraphIdSource(
  candidate: GraphIdResolvable,
): GraphIdResolution {
  if (candidate.source_id) {
    return { graphId: candidate.source_id, needsLivePresenceLookup: false };
  }
  return { graphId: null, needsLivePresenceLookup: true };
}

type IdRow = {
  id: string;
  source_id: string | null;
  internet_message_id: string | null;
};

/**
 * Select the backfill corpus and attach Graph-id resolution data per candidate.
 *
 * Step 1: `selectCandidates` (the hardened 111 selector — same invariants).
 * Step 2: read `source_id, internet_message_id` for those email_ids and join.
 *
 * The id read is chunked to stay under the PostgREST 1000-row IN cap (Pitfall 3).
 */
export async function selectBackfillCandidates(
  admin: Pick<SupabaseClient, "schema">,
  args: SelectCandidatesArgs,
): Promise<BackfillCandidate[]> {
  const base = await selectCandidates(admin, args);
  if (base.length === 0) return [];

  const idsById = new Map<string, IdRow>();
  const emailIds = base.map((c) => c.email_id);
  const CHUNK = 500;
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const slice = emailIds.slice(i, i + CHUNK);
    const { data, error } = (await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, source_id, internet_message_id")
      .in("id", slice)) as { data: IdRow[] | null; error: unknown };
    if (error) throw error as Error;
    for (const r of data ?? []) idsById.set(r.id, r);
  }

  return base.map((c) => {
    const ids = idsById.get(c.email_id);
    return {
      ...c,
      source_id: ids?.source_id ?? null,
      internet_message_id: ids?.internet_message_id ?? null,
    };
  });
}
