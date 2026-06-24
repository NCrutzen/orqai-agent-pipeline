/**
 * Phase 131 Plan 05 (ROUTE-08) — the SHADOW precision harness for the
 * info-routing Stage-3 router.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT it measures: for each HIGH-CONFIDENCE router verdict, does the predicted
 * destination bucket (coordinator_runs.decision_details->routing->>'bucket')
 * match the HUMAN-ACTUAL destination? The human-actual is read from the
 * delta-synced Outlook category on the email record, mapped BACK to a bucket
 * through routing_destinations.outlook_category. The harness reports per-bucket
 * + overall match-rate. Gate: overall ≥ 0.85 (MATCH_RATE_GATE).
 *
 * SHADOW only: this script READS and prints JSON. It performs NO writes, NO
 * forward, NO .update/.insert — it never mutates the pipeline (T-131E-02).
 *
 * ⚠️ THE FALSE-SUCCESS GUARD (RESEARCH Pitfall 6 / T-131E-01). The
 * delta-sync-on-info@ + category-capture PREREQUISITE is ABSENT today: 0 of
 * ~8000 info@ emails carry an Outlook category, so EVERY row would be `ungraded`
 * and a naive harness would report 100% precision over a 0-sized graded sample —
 * a false green-light for an unproven router. To prevent this, `gradeVerdict`
 * REFUSES to emit a pass/fail when `graded_n` (the count of emails WITH a
 * captured human category) is below MIN_GRADED_N; it returns an explicit
 * `insufficient_sample` status with `pass: null` and always reports the
 * denominator (graded_n / ungraded_n).
 *
 * ⚠️ LIVE RUN IS PREREQUISITE-GATED (OUTSIDE Phase 131). Phase 131 ships the
 * BUILD + the pure-fn unit test ONLY. The live measurement run requires the
 * delta-sync-on-info@ category-capture prerequisite to land first (it is NOT in
 * this phase — see VALIDATION.md Manual-Only). Until then a live run will (by
 * design) report `insufficient_sample` rather than a misleading 100%.
 *
 * The pure functions `computeMatchRate` + `gradeVerdict` are IO-free so the unit
 * test drives them without Supabase; main() (report mode only) lazily wires the
 * service-role client.
 *
 * Usage:
 *   npx tsx web/scripts/eval/info-routing-precision-shadow.ts report
 *     join high-confidence verdicts to the human-actual bucket and print the
 *     per-bucket + overall match-rate + the graded verdict as JSON. No DB writes.
 */

const SWARM = "info-routing";

/**
 * Minimum number of GRADED emails (with a captured human Outlook category)
 * required before the harness will emit a pass/fail. Below this, `gradeVerdict`
 * returns `insufficient_sample` — the guard against the false-100% trap while
 * the delta-sync prerequisite is absent (0/8000 today). RESEARCH Pitfall 6.
 */
export const MIN_GRADED_N = 50;

/** ROUTE-08 success gate: overall match-rate among high-confidence verdicts. */
export const MATCH_RATE_GATE = 0.85;

// ─── PURE: per-bucket + overall match-rate (IO-free) ────────────────────────

/**
 * One verdict row to grade. `verdict_bucket` is the router prediction
 * (decision_details->routing->>'bucket'); `human_category` is the human-actual
 * bucket already mapped from the delta-synced Outlook category through
 * routing_destinations.outlook_category by main() (null = no captured category =
 * ungraded). `confidence` filters to high-confidence verdicts only.
 */
export interface ShadowRow {
  verdict_bucket: string;
  human_category: string | null;
  confidence: "low" | "medium" | "high";
  /** The mailbox the verdict was produced for — the per-mailbox grouping axis
   * (precision is measured PER MAILBOX, not swarm-wide). */
  source_mailbox: string;
}

export interface PerBucketMatch {
  bucket: string;
  /** graded count for this bucket (rows with a human category). */
  n: number;
  /** fraction of this bucket's graded rows where verdict === human. */
  match_pct: number;
}

export interface MatchRateStats {
  /** overall fraction of graded high-confidence verdicts that matched. */
  overall_match_pct: number;
  per_bucket: PerBucketMatch[];
  /** count of high-confidence rows WITH a captured human category. */
  graded_n: number;
  /** count of high-confidence rows WITHOUT a human category (excluded). */
  ungraded_n: number;
}

/**
 * Compute the per-bucket + overall match-rate of the router verdict bucket vs
 * the human-actual bucket, over HIGH-CONFIDENCE verdicts only. A row with a null
 * `human_category` is counted in `ungraded_n` and is NEITHER a match nor a miss
 * (it never touches the graded numerator/denominator). Pure — no IO, no NaN on
 * empty input.
 */
export function computeMatchRate(rows: ShadowRow[]): MatchRateStats {
  // High-confidence filter (the ≥85% gate is worded for high-confidence verdicts).
  const highConf = rows.filter((r) => r.confidence === "high");

  const graded = highConf.filter((r) => r.human_category !== null);
  const ungraded_n = highConf.length - graded.length;
  const graded_n = graded.length;

  const overall_matches = graded.reduce(
    (s, r) => s + (r.verdict_bucket === r.human_category ? 1 : 0),
    0,
  );
  const overall_match_pct = graded_n === 0 ? 0 : overall_matches / graded_n;

  // Per-bucket breakdown keyed off the verdict bucket — graded rows only.
  const byBucket = new Map<string, { n: number; matches: number }>();
  for (const r of graded) {
    const entry = byBucket.get(r.verdict_bucket) ?? { n: 0, matches: 0 };
    entry.n += 1;
    if (r.verdict_bucket === r.human_category) entry.matches += 1;
    byBucket.set(r.verdict_bucket, entry);
  }

  const per_bucket: PerBucketMatch[] = [...byBucket.entries()]
    .map(([bucket, { n, matches }]) => ({
      bucket,
      n,
      match_pct: n === 0 ? 0 : matches / n,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  return { overall_match_pct, per_bucket, graded_n, ungraded_n };
}

// ─── PURE: the false-success guard + ≥0.85 gate (IO-free) ───────────────────

export interface GradedVerdict {
  /** `graded` once graded_n ≥ MIN; `insufficient_sample` otherwise. */
  status: "graded" | "insufficient_sample";
  /** true/false against MATCH_RATE_GATE — or NULL when refusing (guard). */
  pass: boolean | null;
  graded_n: number;
  min_graded_n: number;
  overall_match_pct: number;
  gate: number;
  /** human-readable rationale (esp. the refusal reason). */
  reason: string;
}

/**
 * Grade the match-rate against the ≥0.85 gate — but REFUSE a pass/fail when the
 * graded sample is too small (RESEARCH Pitfall 6 / T-131E-01). With the
 * delta-sync-on-info@ prerequisite absent (0/8000 categories), graded_n is 0 and
 * a naive overall of 100% would be a false green-light; this guard returns
 * `insufficient_sample` with `pass: null` instead. The denominator is always
 * reported so the caller sees WHY the verdict was withheld. Pure.
 */
export function gradeVerdict(stats: MatchRateStats): GradedVerdict {
  if (stats.graded_n < MIN_GRADED_N) {
    return {
      status: "insufficient_sample",
      pass: null,
      graded_n: stats.graded_n,
      min_graded_n: MIN_GRADED_N,
      overall_match_pct: stats.overall_match_pct,
      gate: MATCH_RATE_GATE,
      reason:
        `Refusing a pass/fail: only ${stats.graded_n} graded email(s) ` +
        `(< ${MIN_GRADED_N} required). The delta-sync-on-info@ category-capture ` +
        `prerequisite is likely absent — a verdict here would be a false-success ` +
        `(Pitfall 6). Land the prerequisite (outside Phase 131) before grading.`,
    };
  }

  const pass = stats.overall_match_pct >= MATCH_RATE_GATE;
  return {
    status: "graded",
    pass,
    graded_n: stats.graded_n,
    min_graded_n: MIN_GRADED_N,
    overall_match_pct: stats.overall_match_pct,
    gate: MATCH_RATE_GATE,
    reason: pass
      ? `PASS: overall ${(stats.overall_match_pct * 100).toFixed(1)}% ≥ ` +
        `${(MATCH_RATE_GATE * 100).toFixed(0)}% over ${stats.graded_n} graded verdicts.`
      : `FAIL: overall ${(stats.overall_match_pct * 100).toFixed(1)}% < ` +
        `${(MATCH_RATE_GATE * 100).toFixed(0)}% over ${stats.graded_n} graded verdicts.`,
  };
}

// ─── PURE: outlook-category → bucket reverse map (IO-free) ──────────────────

/**
 * The shape of a `routing_destinations` row this harness needs to build the
 * reverse map. A structural subset of `RoutingDestinationRow` (registry) so the
 * pure builder is testable without the registry import.
 */
export interface RoutingDestinationLike {
  destination_key: string;
  brand: string | null;
  outlook_category: string | null;
}

/**
 * The AI routing-label prefixes Plan 01 stamps on the held/forwarded source
 * message (`AI: held → <bucket>`, `AI: routed → <bucket>`). The operator may
 * correct routing EITHER by applying the master colour category (`outlook_
 * category`, e.g. "Verkoop") OR by editing the AI routing label itself. The
 * reverse map below recognises both forms so the captured human category maps to
 * a bucket regardless of which the operator used. These mirror buildRoutingCategory
 * (web/lib/outlook/routing-category.ts) — keep in sync if that vocabulary changes.
 */
const AI_ROUTING_LABEL_PREFIXES = ["AI: routed → ", "AI: held → "] as const;

/**
 * Build the (captured Outlook category → destination bucket) reverse map from the
 * routing_destinations registry. Each `outlook_category` (the human-applied master
 * colour category, e.g. "Verkoop") maps to its `destination_key` (the bucket).
 * Null `outlook_category` (the `unrouted` sentinel) is skipped. ALSO seeds the AI
 * routing-label vocabulary (`AI: routed → <bucket>` / `AI: held → <bucket>`) → the
 * bucket, so a corrected AI label resolves too. Pure — no IO.
 */
export function buildCategoryToBucket(
  destinations: RoutingDestinationLike[],
): Map<string, string> {
  const categoryToBucket = new Map<string, string>();
  for (const d of destinations) {
    // The `unrouted` sentinel has a null outlook_category and is NOT a real
    // forward destination → no master-category entry AND no AI-label entry.
    if (!d.outlook_category) continue;
    categoryToBucket.set(d.outlook_category, d.destination_key);
    // Seed the AI routing-label forms for this bucket so a corrected AI label
    // (the Plan-01 held stamp the operator edits) also resolves to the bucket.
    for (const prefix of AI_ROUTING_LABEL_PREFIXES) {
      categoryToBucket.set(`${prefix}${d.destination_key}`, d.destination_key);
    }
  }
  return categoryToBucket;
}

// ─── PURE: per-mailbox grading (IO-free) ────────────────────────────────────

/** A per-mailbox graded result: the stats + the gateVerdict for ONE mailbox. */
export interface PerMailboxGrade {
  stats: MatchRateStats;
  verdict: GradedVerdict;
}

/**
 * Group ShadowRows by `source_mailbox` and grade EACH mailbox independently
 * (precision is measured PER MAILBOX, not swarm-wide — must_have). Reuses the
 * unchanged pure `computeMatchRate` + `gradeVerdict`, so the false-success guard
 * (MIN_GRADED_N / insufficient_sample / pass:null) applies per mailbox: a mailbox
 * with too few graded rows grades to `insufficient_sample` and can never flip.
 * Pure — no IO.
 */
export function computePerMailboxStats(
  rows: ShadowRow[],
): Map<string, PerMailboxGrade> {
  const byMailbox = new Map<string, ShadowRow[]>();
  for (const r of rows) {
    const group = byMailbox.get(r.source_mailbox) ?? [];
    group.push(r);
    byMailbox.set(r.source_mailbox, group);
  }

  const out = new Map<string, PerMailboxGrade>();
  for (const [mailbox, mailboxRows] of byMailbox) {
    const stats = computeMatchRate(mailboxRows);
    const verdict = gradeVerdict(stats);
    out.set(mailbox, { stats, verdict });
  }
  return out;
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const USAGE = `info-routing-precision-shadow — ROUTE-08 shadow precision harness

SHADOW only: reads coordinator_runs.decision_details->routing (high-confidence)
+ the delta-synced Outlook category (mapped via routing_destinations.outlook_
category) and prints the per-bucket + overall match-rate. NO writes, NO forward.

⚠️ LIVE RUN PREREQUISITE-GATED (outside Phase 131): the delta-sync-on-info@
category-capture prerequisite must land first. Until then this reports
'insufficient_sample' by design (the false-100% guard), never a green verdict.

Usage:
  report    join verdicts to the human-actual bucket and print the match-rate.
`;

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

interface CoordinatorRoutingRow {
  email_id: string | null;
  source_mailbox: string | null;
  decision_details: { routing?: { bucket?: string; confidence?: string } } | null;
}

// Plan 04 (ROUTE-08 / D-01) — the columns the report-mode query selects from
// coordinator_runs. `email_id` is the JOIN key to the captured operator
// correction (the 112.5 reclassify signal, keyed by email_id); `source_mailbox`
// is the per-mailbox grouping axis (precision is measured PER MAILBOX). The
// human-actual category is NOT a coordinator_runs column — it is joined in main()
// from swarm_review_signals (the 112.5 delta-synced reclassify verdict). NEVER
// reintroduce the non-existent `human_outlook_category` column (BUG 3 / WR-05):
// it made Postgres throw "column does not exist" BEFORE the graded_n guard ran.
// Exported so a unit test can assert the bad column is gone without a live DB.
export const COORDINATOR_RUNS_SELECT = "email_id, source_mailbox, decision_details";

/**
 * Project raw coordinator_runs rows → the pure ShadowRow shape. Rows missing a
 * verdict bucket or confidence are dropped.
 *
 * `human_category` (D-01) is resolved from the 112.5 delta-synced operator
 * correction: `humanCategoryByEmailId` maps email_id → the captured Outlook
 * category (the master colour category the operator applied, or the AI routing
 * label they edited), which `categoryToBucket` maps BACK to a destination bucket.
 * A row with NO captured correction (or a captured category that maps to no
 * bucket) → human_category=null → ungraded (excluded from the match-rate), so
 * graded_n only counts emails the operator actually corrected.
 */
export function mapRowToShadow(
  rawRows: CoordinatorRoutingRow[],
  categoryToBucket: Map<string, string>,
  humanCategoryByEmailId: Map<string, string>,
): ShadowRow[] {
  return rawRows.flatMap((r) => {
    const routing = r.decision_details?.routing;
    const verdict_bucket = routing?.bucket;
    const confidence = routing?.confidence;
    if (!verdict_bucket || !confidence) return [];

    // Resolve the human-actual bucket from the captured operator correction.
    // No correction captured, or it maps to no routing bucket → null (ungraded).
    const capturedCategory = r.email_id
      ? humanCategoryByEmailId.get(r.email_id)
      : undefined;
    const human_category =
      (capturedCategory ? categoryToBucket.get(capturedCategory) : undefined) ??
      null;

    return [
      {
        verdict_bucket,
        human_category,
        confidence: confidence as "low" | "medium" | "high",
        source_mailbox: r.source_mailbox ?? "unknown",
      },
    ];
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[0] ?? "report";

  if (mode !== "report") {
    fail(`unknown mode "${mode}" — expected: report`);
  }

  // Lazy imports so arg-validation never needs env/secrets/network.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { loadRoutingDestinations } = await import("@/lib/swarms/registry");
  const admin = createAdminClient();

  // (1) Build the (captured Outlook category → bucket) reverse map from the
  // registry. The human-actual destination is an Outlook category string;
  // routing_destinations.outlook_category maps each (bucket×brand) to its master
  // colour category, and buildCategoryToBucket also seeds the AI routing-label
  // forms (the Plan-01 held stamp the operator corrects).
  const destinations = await loadRoutingDestinations(admin, SWARM);
  const categoryToBucket = buildCategoryToBucket(destinations);

  // (2) Read the 112.5 delta-synced operator corrections (D-01 ground-truth). A
  // `category_edited` transition → a `reclassify` swarm_review_signals row carries
  // the operator-corrected category in `category_key`, keyed by email_id. We map
  // email_id → that captured category so mapRowToShadow can resolve human_category.
  // Latest correction per email_id wins (a later edit supersedes an earlier one).
  const sigRes = await admin
    .from("swarm_review_signals")
    .select("email_id, category_key, observed_at")
    .eq("swarm_type", SWARM)
    .eq("transition_kind", "category_edited")
    .not("category_key", "is", null)
    .order("observed_at", { ascending: true });
  if (sigRes.error) {
    throw new Error(`swarm_review_signals read failed: ${sigRes.error.message}`);
  }
  const humanCategoryByEmailId = new Map<string, string>();
  for (const s of (sigRes.data ?? []) as {
    email_id: string | null;
    category_key: string | null;
  }[]) {
    if (s.email_id && s.category_key) {
      // ascending order → last write (most recent correction) wins.
      humanCategoryByEmailId.set(s.email_id, s.category_key);
    }
  }

  // (3) Read the persisted high-confidence verdicts. We select ONLY real
  // coordinator_runs columns (COORDINATOR_RUNS_SELECT) — email_id (the join key to
  // the correction) + source_mailbox (the per-mailbox grouping axis) + the routing
  // verdict. NEVER reintroduce the non-existent `human_outlook_category` column
  // (BUG 3 / WR-05).
  const res = await admin
    .from("coordinator_runs")
    .select(COORDINATOR_RUNS_SELECT)
    .eq("swarm_type", SWARM)
    .not("decision_details->routing", "is", null);
  if (res.error) {
    throw new Error(`coordinator_runs read failed: ${res.error.message}`);
  }

  const rawRows = (res.data ?? []) as unknown as CoordinatorRoutingRow[];

  // (4) Project DB rows → the pure ShadowRow shape, resolving human_category from
  // the captured corrections. A row with no correction (or one mapping to no
  // bucket) → human_category=null (ungraded). graded_n only counts corrected rows.
  const rows: ShadowRow[] = mapRowToShadow(
    rawRows,
    categoryToBucket,
    humanCategoryByEmailId,
  );

  // (5) Swarm-wide stats (legacy report shape) + the per-mailbox breakdown that
  // the auto-flip reads (precision is measured PER MAILBOX, not swarm-wide).
  const stats = computeMatchRate(rows);
  const verdict = gradeVerdict(stats);
  const perMailbox = computePerMailboxStats(rows);
  const per_mailbox = [...perMailbox.entries()]
    .map(([mailbox, g]) => ({ mailbox, verdict: g.verdict, stats: g.stats }))
    .sort((a, b) => a.mailbox.localeCompare(b.mailbox));

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mode: "report",
        swarm: SWARM,
        metric: "ROUTE-08 shadow precision (router verdict bucket vs human-actual destination)",
        gate: MATCH_RATE_GATE,
        min_graded_n: MIN_GRADED_N,
        verdict,
        stats,
        per_mailbox,
      },
      null,
      2,
    ),
  );
}

// Only run main() when invoked directly (tsx), never on import (the test imports
// the pure functions only).
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /info-routing-precision-shadow\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
