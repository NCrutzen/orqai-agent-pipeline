// Phase 4 follow-up (2026-05-27) — per-tab counts for the mode-bar
// (sketch 001 lock: "47 blocked", "312 handled · 7d", "18 candidates · 30d").
//
// Server-side. Best-effort: each count fails closed (null) on query error so
// the chrome stays clean instead of throwing the whole page.

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadQueueBucket, loadHistoryBucket } from "./load-bucket-label-ids";

export interface ModeBarCounts {
  queue: { count: number; sub: string } | null;
  history: { count: number; sub: string } | null;
  patterns: { count: number; sub: string } | null;
}

// Plan 03-18 (UAT r2/r3): the QUEUE count is rows AWAITING OPERATOR ACTION,
// not all processed rows. These are the block-states from the agent_runs
// STATUS enum (coordinator/types.ts). Mid-pipeline states (classifying,
// predicted, fetching_document, generating_body, creating_draft,
// copy_document_drafted) and the terminal `done` are deliberately EXCLUDED —
// counting `predicted` (a mid-pipeline state between Stage 3 and 3.5) inflated
// the live queue to ~966 (operator-language.md: "predicted = internal").
// Named + exported so the predicate has one source of truth and is testable.
export const QUEUE_AWAITING_STATUSES = [
  "routed_human_queue",
  "copy_document_needs_review",
  "copy_document_failed_not_found",
  "copy_document_failed_transient",
  "login_failed_blocked",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

// WR-05: optional bucket-total overrides. A page that has ALREADY loaded its
// bucket (e.g. /review loads loadQueueBucket, /history loads loadHistoryBucket)
// passes that bucket.total here so the chip reuses the page's SAME read instead
// of re-running an independent (unbounded) scan. This removes the redundant
// second read AND guarantees the page list and the chip are sourced from one
// read — they cannot disagree even under concurrent writes within the render.
interface ModeBarOverrides {
  queueTotal?: number;
  historyTotal?: number;
}

export async function getModeBarCounts(
  admin: Admin,
  swarmType: string,
  overrides: ModeBarOverrides = {},
): Promise<ModeBarCounts> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Queue (Phase 06 Plan 01): the chip count is sourced from the SAME
  // population that backs the Queue list — loadQueueBucket's count-head total
  // (un-decided AND not done, per-label rows) — so chip and list can never
  // disagree. This replaces the old agent_runs `.in("status",
  // QUEUE_AWAITING_STATUSES)` row-count, which counted agent_runs rows (128)
  // instead of distinct reviewable labels (32). QUEUE_AWAITING_STATUSES stays
  // exported below but no longer computes the queue count. Best-effort: fail
  // closed to null on error so the chrome stays clean.
  let queue: ModeBarCounts["queue"] = null;
  if (overrides.queueTotal != null) {
    // Page already loaded the Queue bucket — reuse its total (one read).
    queue = { count: overrides.queueTotal, sub: "in queue" };
  } else {
    try {
      const bucket = await loadQueueBucket(admin, swarmType, { limit: 1 });
      queue = { count: bucket.total, sub: "in queue" };
    } catch {
      queue = null;
    }
  }

  // History (IN-03): source the chip from loadHistoryBucket(...).total — the
  // SAME population (decided ∪ AI-terminal, per-label rows) that backs the
  // /history list — so chip and list can never disagree, exactly as the Queue
  // chip was fixed. The old verdict-only `.not("human_verdict","is",null)` over
  // 7 days diverged from the list (it excluded status=done rows the list
  // includes). The bucket is all-time (no 7d window), so the sub-label drops the
  // "· 7d" claim to match the count's actual scope. Best-effort: fail closed to
  // null on error so the chrome stays clean.
  let history: ModeBarCounts["history"] = null;
  if (overrides.historyTotal != null) {
    // /history already loaded the History bucket — reuse its total (one read).
    history = { count: overrides.historyTotal, sub: "handled" };
  } else {
    try {
      const bucket = await loadHistoryBucket(admin, swarmType, { limit: 1 });
      history = { count: bucket.total, sub: "handled" };
    } catch {
      history = null;
    }
  }

  // Patterns = open + in_review candidates seen in the last 30 days.
  const patternsRes = await admin
    .from("promotion_candidates")
    .select("*", { count: "exact", head: true })
    .eq("swarm_type", swarmType)
    .in("status", ["open", "in_review"])
    .gte("created_at", thirtyDaysAgo);
  const patterns = patternsRes.error
    ? null
    : { count: patternsRes.count ?? 0, sub: "candidates · 30d" };

  return { queue, history, patterns };
}
