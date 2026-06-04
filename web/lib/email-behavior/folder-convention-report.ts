/**
 * Phase 112.5 Plan 01 Task 1 — swarm-agnostic folder-convention aggregator (SC-3).
 *
 * Answers the open CONTEXT question empirically: "how consistently does the
 * team use afgehandeld-{jaar} folders vs. Archive?" over the existing corpus,
 * so the signal weighting in later plans (Plan 03 DEFAULT_WEIGHTS + the sales
 * behavior_tracking_config weights override) is data-grounded rather than
 * guessed.
 *
 * This module is SWARM-AGNOSTIC — parameterized only by the rows handed in. It
 * imports NO swarm constants and knows nothing about any specific mailbox; a
 * later swarm reuses it with a different mailbox. The one-shot report worker
 * owns the mailbox pin + all Graph IO and passes already-bucketed rows in.
 *
 * Pure (no clock reads, no randomness) — safe under Inngest replay. The
 * folder-id → bucket mapping is NOT this aggregator's job; the worker maps
 * folder display-names to buckets via `bucketForFolderName` (also pure, here)
 * and feeds the aggregator rows whose `bucket` is already a semantic label.
 */

/** The closed set of semantic folder buckets. */
export type FolderBucket =
  | "inbox"
  | "archive"
  | "afgehandeld"
  | "sent"
  | "other";

/** One pre-bucketed corpus row: an email and the semantic folder it lives in. */
export type FolderConventionRow = {
  email_id: string;
  /** A semantic bucket label. Unknown values are coerced to 'other'. */
  bucket: string;
};

export type FolderConventionReport = {
  /** Count per semantic bucket. Buckets with zero rows are omitted. */
  per_bucket: Record<string, number>;
  /** Total rows whose bucket collapsed to 'afgehandeld' (any afgehandeld-{jaar}). */
  afgehandeld_total: number;
  /** Total rows in the archive bucket. */
  archive_total: number;
  /**
   * afgehandeld / (afgehandeld + archive). null (NOT NaN) when there is neither
   * afgehandeld nor archive volume — the consistency question is undefined
   * with no folded/archived mail.
   */
  afgehandeld_vs_archive_ratio: number | null;
  /** Total rows seen (every bucket, including 'other'). */
  total_classified: number;
  /** Rows that fell into 'other' (unknown/unmapped folders) — excluded from the ratio. */
  other_count: number;
};

const KNOWN_BUCKETS: ReadonlySet<string> = new Set<FolderBucket>([
  "inbox",
  "archive",
  "afgehandeld",
  "sent",
  "other",
]);

/**
 * Map a folder DISPLAY NAME to a semantic bucket. Pure. Every per-year
 * "afgehandeld {jaar}" folder collapses to the single 'afgehandeld' bucket
 * (the team uses a quick-step "Move to afgehandeld {jaar}" — we don't care
 * which year, only that it was filed as handled).
 *
 * Recognizes both English (Graph well-known) and Dutch display names, since
 * the live mailbox renders folders in Dutch.
 */
export function bucketForFolderName(displayName: string): FolderBucket {
  const name = (displayName ?? "").trim().toLowerCase();
  if (name === "") return "other";

  // afgehandeld (with or without a trailing year) — the handled/filed convention.
  if (/^afgehandeld\b/.test(name)) return "afgehandeld";

  // archive — English well-known + Dutch.
  if (name === "archive" || name === "archief") return "archive";

  // inbox — English well-known + Dutch.
  if (name === "inbox" || name === "postvak in") return "inbox";

  // sent — English well-known + Dutch.
  if (
    name === "sent items" ||
    name === "sent" ||
    name === "verzonden items" ||
    name === "verzonden"
  ) {
    return "sent";
  }

  return "other";
}

/**
 * Aggregate a pre-bucketed corpus into per-bucket counts + the
 * afgehandeld-vs-archive ratio. Pure: identical input yields identical output.
 *
 * Unknown bucket labels are coerced to 'other' and excluded from the ratio.
 */
export function aggregateFolderConvention(
  rows: FolderConventionRow[],
): FolderConventionReport {
  const per_bucket: Record<string, number> = {};
  for (const row of rows) {
    const bucket = KNOWN_BUCKETS.has(row.bucket) ? row.bucket : "other";
    per_bucket[bucket] = (per_bucket[bucket] ?? 0) + 1;
  }

  const afgehandeld_total = per_bucket.afgehandeld ?? 0;
  const archive_total = per_bucket.archive ?? 0;
  const other_count = per_bucket.other ?? 0;
  const total_classified = rows.length;

  const denom = afgehandeld_total + archive_total;
  const afgehandeld_vs_archive_ratio =
    denom === 0 ? null : Number((afgehandeld_total / denom).toFixed(4));

  return {
    per_bucket,
    afgehandeld_total,
    archive_total,
    afgehandeld_vs_archive_ratio,
    total_classified,
    other_count,
  };
}
