// Phase 06 Plan 01 (operator UAT 2026-05-28) — ONE email-level predicate is the
// single source of truth for BOTH the Queue and History buckets, and the chip
// count is sourced from that SAME population (see mode-bar-counts.ts) so chip
// and list AGREE WITHIN A SINGLE RENDER. (WR-04: this is not an absolute
// invariant — the bucket is assembled from sequential, non-transactional reads
// under a force-dynamic page while the pipeline writes continuously, so a row
// decided between the count-head and the paged read leaves a brief
// eventual-consistency window. WR-05 narrows this by sourcing the chip from the
// page's already-loaded bucket total, but the window is inherent to the
// read-then-read design, not eliminated.)
//
// LOCKED PREDICATE (operator decision 2026-05-28):
//   • History (decided ∪ AI-terminal) = an email is in History iff ANY of its
//     agent_runs has a human_verdict set OR ANY of its agent_runs status === "done".
//   • Queue (un-decided AND not done) = the EXACT complement: an email is in the
//     Queue iff human_verdict IS NULL across ALL its runs AND no run is `done`.
//     This naturally INCLUDES `predicted`, the 5 block states, and every
//     transient mid-pipeline status — the Queue is defined by NEGATION, NOT by a
//     status whitelist (the old QUEUE_AWAITING_STATUSES is no longer the queue
//     membership predicate; it lives on in mode-bar-counts.ts only as a named
//     const for any other reference).
//   • Queue ∩ History = ∅ by construction (membership is a single partition).
//
// COUNT UNIT (RESEARCH A4 / Q2): the population unit is the `email_labels` ROW —
// the reviewable entry the list renders and the hydrator keys off via
// email_labels.id — NOT DISTINCT email_id. When one email_id carries two label
// rows, `total === 2` and BOTH ids page in. This is exactly what makes
// `count === list` hold; do NOT silently reinterpret as `DISTINCT email_id`.
//
// PAGINATION: `{ ids, total, nextBefore }`. `total` is computed by a SEPARATE
// `{ count: "exact", head: true }` query with the SAME membership predicate but
// NO `.limit`/cursor, so it always reflects the full population (it cannot be
// silently truncated by the page limit). `ids` is the freshest page ordered by
// the COMPOSITE (created_at desc, id desc) cursor (WR-01: created_at alone is
// not unique — batch-inserted labels collide and a created_at-only cursor would
// skip/dup rows at a page boundary). `nextBefore` is the last row's
// "${created_at}|${id}" tuple when a full page came back, else null — opaque to
// LoadMoreLink, decoded only inside this module.
//
// Linkage: agent_runs.email_id → debtor.email_labels.email_id. We resolve the
// decided-or-done email_id set first (public-search-path agent_runs) then map to
// label ids (debtor schema). decidedOrDone is the SMALLER set in live data
// (Queue is the majority), so interpolating it as the NOT-IN list literal for
// the Queue (and the `.in` list for History) keeps the PostgREST list literal
// well under the ~8KB limit (RESEARCH Pitfall 1; load-page-data.ts chunk-at-50
// precedent would apply only if this set ever grew large — it does not today).

import type { SupabaseClient } from "@supabase/supabase-js";

// IN-02: the AI-terminal status is sourced from the coordinator STATUS enum's
// single source of truth, NOT inlined as a "done" literal — a rename of the
// terminal status becomes a single-site compile error rather than silent drift.
import { TERMINAL_STATUS } from "@/lib/automations/debtor-email/coordinator/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** A single page of a bucket. `total` is the full population size (count-head),
 *  independent of the page `limit`; `nextBefore` is the cursor for the next page
 *  (null when the last page came back short). */
export interface BucketPage {
  ids: string[];
  total: number;
  nextBefore: string | null;
}

interface BucketOpts {
  limit: number;
  before?: string | null;
}

// WR-02 / WR-03: page agent_runs in fixed-size batches so a >1000 population
// cannot be silently truncated by PostgREST's default max-rows cap (the live
// queue already hit ~966). PAGE matches that cap so each round-trip drains a
// full window; a short page signals exhaustion.
const AGENT_RUNS_PAGE = 1000;

/** Distinct email_ids that are DECIDED-OR-DONE for this swarm:
 *  ANY run human_verdict IS NOT NULL  OR  ANY run status === "done".
 *  This single set drives BOTH buckets (History = IN it, Queue = NOT IN it) so
 *  they are an exact partition and can never overlap.
 *
 *  WR-02: the membership predicate is pushed SERVER-SIDE
 *  (`human_verdict.not.is.null,status.eq.done`) so ONLY decided-or-done rows
 *  transit the wire, AND the result is range-paged in 1000-row batches until a
 *  short page returns — a >1000 decided population can never be silently capped
 *  (the old unbounded select returned a 200 with a silent 1000-row truncation,
 *  leaking decided rows back into the Queue complement). */
async function decidedOrDoneEmailIds(
  admin: Admin,
  swarmType: string,
): Promise<string[]> {
  const set = new Set<string>();
  for (let from = 0; ; from += AGENT_RUNS_PAGE) {
    const runs = await admin
      .from("agent_runs")
      .select("email_id, status, human_verdict")
      .eq("swarm_type", swarmType)
      // server-side filter: decided (verdict set) OR AI-terminal (status=done).
      .or(`human_verdict.not.is.null,status.eq.${TERMINAL_STATUS}`)
      .range(from, from + AGENT_RUNS_PAGE - 1);
    if (runs.error) {
      throw new Error(
        `load-bucket-label-ids: agent_runs (decided-or-done) query failed — ${runs.error.message}`,
      );
    }
    const rows =
      (runs.data as Array<{
        email_id: string | null;
        status: string | null;
        human_verdict: string | null;
      }> | null) ?? [];
    for (const r of rows) {
      if (!r.email_id) continue;
      // The server-side `.or` already guarantees decided-or-done; the in-memory
      // guard is a belt-and-suspenders re-assert of the same predicate.
      if (r.human_verdict != null || r.status === TERMINAL_STATUS) {
        set.add(r.email_id);
      }
    }
    if (rows.length < AGENT_RUNS_PAGE) break; // short page → drained.
  }
  return [...set];
}

/** Build one bucket page (Queue or History) from a resolved membership set.
 *  `mode` selects the membership operator on debtor.email_labels.email_id:
 *    - "queue":   NOT IN decidedOrDone (the complement); when the set is empty,
 *                 apply NO filter (everything is un-decided).
 *    - "history": IN decidedOrDone; when the set is empty, return an empty page
 *                 (no query — nothing is decided-or-done).
 *  Both share the count-head total (full population, per-label unit) and the
 *  cursor-paged ids (created_at desc + limit + optional .lt(before)). */
async function loadBucketPage(
  admin: Admin,
  decidedOrDone: string[],
  mode: "queue" | "history",
  opts: BucketOpts,
): Promise<BucketPage> {
  if (mode === "history" && decidedOrDone.length === 0) {
    return { ids: [], total: 0, nextBefore: null };
  }

  const labelsTable = () => admin.schema("debtor").from("email_labels");

  // WR-03: chunk the decided-or-done id set so the PostgREST list literal never
  // overflows the ~8KB URL limit (~216 UUIDs). Mirrors the load-page-data.ts
  // chunk-at-50 precedent. The set is partitioned into disjoint chunks, so for
  // History (`.in`) each label row matches AT MOST one chunk — chunk results are
  // a disjoint union (count = Σ chunk counts, ids concatenate with no dup). For
  // Queue (`NOT IN`) every chunk's `.not(...)` is AND-ed onto ONE query: the
  // complement is the intersection of per-chunk complements, so no union is
  // needed and paging stays a single query.
  const CHUNK = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < decidedOrDone.length; i += CHUNK) {
    chunks.push(decidedOrDone.slice(i, i + CHUNK));
  }
  const notInLiteral = (ids: string[]) => `(${ids.join(",")})`;

  type LabelRow = { id: string; created_at: string };

  // WR-01: a fully-ordered COMPOSITE cursor (created_at, id). `created_at` is a
  // timestamp, NOT unique — batch-inserted label rows routinely collide on it,
  // so a `created_at`-only `.lt` cursor SKIPS rows that share the boundary
  // timestamp but didn't fit the page (or re-emits them). Encoding `id` as the
  // tie-breaker makes the cursor total: order by (created_at desc, id desc) and
  // advance with the lexicographic tuple compare. The cursor is encoded
  // "${created_at}|${id}" — opaque to LoadMoreLink, internal to this module.
  const encodeCursor = (r: LabelRow) => `${r.created_at}|${r.id}`;
  const decodeCursor = (c: string): { cAt: string; id: string } => {
    const sep = c.indexOf("|");
    // Back-compat: a legacy created_at-only cursor (no "|") sorts before every
    // id, so treat its id half as the empty string (admits the whole timestamp).
    return sep === -1
      ? { cAt: c, id: "" }
      : { cAt: c.slice(0, sep), id: c.slice(sep + 1) };
  };
  // (created_at desc, id desc) comparator for merging per-chunk pages.
  const cmpDesc = (a: LabelRow, b: LabelRow): number => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  };
  const sortDesc = (rows: LabelRow[]): LabelRow[] => [...rows].sort(cmpDesc);
  // Apply the composite cursor to a query: created_at < cAt, OR (= cAt AND id < id).
  const applyCursor = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    q: any,
    before: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any => {
    const { cAt, id } = decodeCursor(before);
    return q.or(`created_at.lt.${cAt},and(created_at.eq.${cAt},id.lt.${id})`);
  };
  const orderComposite = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    q: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any =>
    q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

  if (mode === "queue") {
    // Queue = NOT IN decidedOrDone, AND-ing one `.not(email_id,in,chunk)` per
    // chunk onto a single query (intersection of complements). When nothing is
    // decided, omit the filter entirely (every label is un-decided).
    const applyQueueFilters = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any => {
      let out = q;
      for (const chunk of chunks) {
        out = out.not("email_id", "in", notInLiteral(chunk));
      }
      return out;
    };

    const countRes = await applyQueueFilters(
      labelsTable().select("id", { count: "exact", head: true }),
    );
    if (countRes.error) {
      throw new Error(
        `load-bucket-label-ids: email_labels (${mode}) count query failed — ${countRes.error.message}`,
      );
    }
    const total = countRes.count ?? 0;

    let pagedQ = orderComposite(
      applyQueueFilters(labelsTable().select("id, created_at")),
    ).limit(opts.limit);
    if (opts.before) pagedQ = applyCursor(pagedQ, opts.before);
    const pagedRes = await pagedQ;
    if (pagedRes.error) {
      throw new Error(
        `load-bucket-label-ids: email_labels (${mode}) page query failed — ${pagedRes.error.message}`,
      );
    }
    const rows = (pagedRes.data as LabelRow[] | null) ?? [];
    const ids = rows.map((r) => r.id);
    const nextBefore =
      rows.length === opts.limit && rows.length > 0
        ? encodeCursor(rows[rows.length - 1])
        : null;
    return { ids, total, nextBefore };
  }

  // History = IN decidedOrDone. Run the count-head + paged query PER CHUNK and
  // union the results (chunks are disjoint email_id partitions → disjoint label
  // rows). Count = Σ chunk counts. Paged = merge each chunk's freshest `limit`
  // rows, re-sort desc, then slice to `limit`; this keeps the global ordering
  // correct because each chunk returns its own freshest `limit` candidates.
  let total = 0;
  const merged: LabelRow[] = [];
  let anyChunkFull = false; // a chunk that returned a full `limit` page may hold more.
  for (const chunk of chunks) {
    const countRes = await labelsTable()
      .select("id", { count: "exact", head: true })
      .in("email_id", chunk);
    if (countRes.error) {
      throw new Error(
        `load-bucket-label-ids: email_labels (${mode}) count query failed — ${countRes.error.message}`,
      );
    }
    total += countRes.count ?? 0;

    let pagedQ = orderComposite(
      labelsTable().select("id, created_at").in("email_id", chunk),
    ).limit(opts.limit);
    if (opts.before) pagedQ = applyCursor(pagedQ, opts.before);
    const pagedRes = await pagedQ;
    if (pagedRes.error) {
      throw new Error(
        `load-bucket-label-ids: email_labels (${mode}) page query failed — ${pagedRes.error.message}`,
      );
    }
    const chunkRows = (pagedRes.data as LabelRow[] | null) ?? [];
    if (chunkRows.length === opts.limit) anyChunkFull = true;
    merged.push(...chunkRows);
  }
  // Merge-sort the per-chunk pages and take the globally-freshest `limit` rows.
  const pageRows = sortDesc(merged).slice(0, opts.limit);
  const ids = pageRows.map((r) => r.id);
  // nextBefore: emit a cursor when we filled the page AND more rows can remain —
  // either the merged candidate pool overflowed `limit`, or some chunk returned
  // a full `limit` page (its older tail was clipped server-side). Re-deriving the
  // cursor from the LAST emitted row keeps the next `.lt(before)` page disjoint.
  const moreRemain = merged.length > opts.limit || anyChunkFull;
  const nextBefore =
    pageRows.length === opts.limit && pageRows.length > 0 && moreRemain
      ? encodeCursor(pageRows[pageRows.length - 1])
      : null;
  return { ids, total, nextBefore };
}

/** Queue bucket: label rows whose email is NOT decided-or-done (un-decided AND
 *  not done) — everything still awaiting a human look, INCLUDING `predicted`. */
export async function loadQueueBucket(
  admin: Admin,
  swarmType: string,
  opts: BucketOpts,
): Promise<BucketPage> {
  const decidedOrDone = await decidedOrDoneEmailIds(admin, swarmType);
  return loadBucketPage(admin, decidedOrDone, "queue", opts);
}

/** History bucket: label rows whose email IS decided-or-done (ANY run carries a
 *  human_verdict OR ANY run status === "done"). Exact complement of the Queue. */
export async function loadHistoryBucket(
  admin: Admin,
  swarmType: string,
  opts: BucketOpts,
): Promise<BucketPage> {
  const decidedOrDone = await decidedOrDoneEmailIds(admin, swarmType);
  return loadBucketPage(admin, decidedOrDone, "history", opts);
}

// Plan 06-02: the @deprecated limit-only back-compat shims have been REMOVED —
// both page call sites now consume the `{ids,total,nextBefore}` bucket loaders
// directly. No limit-only label-id helper exists anywhere in the app.
