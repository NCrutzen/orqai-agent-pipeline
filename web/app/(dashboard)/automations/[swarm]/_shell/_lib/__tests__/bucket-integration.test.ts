// Phase 06 Plan 04 (phase gate, operator UAT 2026-05-28) — end-to-end
// count-vs-list invariant integration test.
//
// This is the single sign-off assertion that ties the four locked Phase 6
// decisions together over a REALISTIC multi-page fixture, exercising the same
// loaders the chip + list both consume:
//
//   1. count === list OVER ALL PAGES: exhausting loadQueueBucket's pagination
//      (following nextBefore until null) yields exactly `total` DISTINCT label
//      ids — and that same `total` is what getModeBarCounts(...).queue.count
//      renders. So `Set(every paged id).size === total === chip count`.
//   2. Queue ∩ History = ∅ AND Queue ∪ History = every label, over a mixed
//      (awaiting + decided + done) fixture.
//
// Pure unit-level integration: no real DB. The mock admin honors
// `.lt("created_at", before)` (cursor slice) and `{ head: true }` (full-
// population count), matching the load-bucket-label-ids.test.ts harness so the
// pagination loop is driven to exhaustion exactly as production would.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadQueueBucket,
  loadHistoryBucket,
  type BucketPage,
} from "../load-bucket-label-ids";
import { getModeBarCounts } from "../mode-bar-counts";

// ---- Fixture types ---------------------------------------------------------

interface RunRow {
  email_id: string | null;
  status: string;
  human_verdict: string | null;
}
interface LabelRow {
  id: string;
  email_id: string;
  created_at: string; // ISO; lexicographically sortable so `.lt` works as a cursor
}

/**
 * Mock admin factory. Each call to `from`/`schema().from` returns a fresh
 * builder that applies the membership predicate + `.lt` cursor + `.limit`
 * client-side, and distinguishes the `{ head: true }` count query (returns the
 * FULL population size, no limit/cursor) from the paged query. The SAME factory
 * instance can be invoked repeatedly (one per page) so an exhaustion loop sees
 * the stable underlying fixture — exactly the production access pattern.
 */
function makeAdmin(opts: {
  runs: RunRow[];
  labels: LabelRow[];
}): SupabaseClient {
  // agent_runs builder. The Queue path (decidedOrDoneEmailIds) issues
  // `.select(...).eq(...)` then awaits the run rows. The mode-bar History +
  // Patterns branches issue richer chains (`.gte`, `.in`, count-head) on
  // agent_runs / promotion_candidates that this integration test does not care
  // about — they fail closed to null in getModeBarCounts. So make EVERY query
  // method chainable; resolve to the run rows for the simple Queue read and to
  // an error for the count-head branches (so history/patterns → null cleanly).
  const agentBuilder = () => {
    const b: Record<string, unknown> = {};
    let isCountHead = false;
    // WR-02: the Queue read range-pages decided-or-done agent_runs via
    // `.or(...).range(from,to)`. Honor both so the decided filter + range slice
    // match production.
    let rangeFrom = 0;
    let rangeTo = Infinity;
    const chain = vi.fn(() => b);
    b.select = vi.fn((_cols?: string, options?: { head?: boolean }) => {
      if (options?.head) isCountHead = true;
      return b;
    });
    b.eq = chain;
    b.gte = chain;
    b.in = chain;
    b.not = chain;
    b.or = chain;
    b.range = vi.fn((from: number, to: number) => {
      rangeFrom = from;
      rangeTo = to;
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => {
      if (isCountHead) {
        return resolve({
          count: 0,
          error: { message: "not-mocked-in-integration" },
        });
      }
      const decided = opts.runs.filter(
        (r) => r.human_verdict != null || r.status === "done",
      );
      return resolve({ data: decided.slice(rangeFrom, rangeTo + 1), error: null });
    };
    return b;
  };

  const labelBuilder = () => {
    let isHead = false;
    let notInVals: string[] | null = null;
    let inVals: string[] | null = null;
    // WR-01: composite (created_at, id) cursor.
    let cursor: { cAt: string; id: string } | null = null;
    let lim = Infinity;

    const parseListLiteral = (val: unknown): string[] => {
      const s = String(val).replace(/^\(/, "").replace(/\)$/, "");
      return s.length ? s.split(",") : [];
    };

    const cmpDesc = (a: LabelRow, b: LabelRow): number =>
      a.created_at !== b.created_at
        ? a.created_at < b.created_at
          ? 1
          : -1
        : a.id < b.id
          ? 1
          : a.id > b.id
            ? -1
            : 0;

    const membershipFiltered = (): LabelRow[] => {
      let rows = [...opts.labels];
      if (notInVals) rows = rows.filter((r) => !notInVals!.includes(r.email_id));
      if (inVals) rows = rows.filter((r) => inVals!.includes(r.email_id));
      return rows;
    };

    const resolveRows = (): LabelRow[] => {
      let rows = membershipFiltered();
      rows.sort(cmpDesc); // (created_at desc, id desc)
      if (cursor) {
        const { cAt, id } = cursor;
        rows = rows.filter(
          (r) => r.created_at < cAt || (r.created_at === cAt && r.id < id),
        );
      }
      if (lim !== Infinity) rows = rows.slice(0, lim);
      return rows;
    };

    const b: Record<string, unknown> = {};
    b.select = vi.fn((_cols: string, options?: { head?: boolean }) => {
      if (options?.head) isHead = true;
      return b;
    });
    b.order = vi.fn(() => b);
    b.limit = vi.fn((n: number) => {
      lim = n;
      return b;
    });
    b.or = vi.fn((expr: string) => {
      const m = expr.match(
        /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(.*)\)$/,
      );
      if (m) cursor = { cAt: m[1], id: m[3] };
      return b;
    });
    b.not = vi.fn((col: string, op: string, val: unknown) => {
      // WR-03: accumulate per-chunk `.not(email_id,in,chunk)` exclusions.
      if (col === "email_id" && op === "in") {
        notInVals = [...(notInVals ?? []), ...parseListLiteral(val)];
      }
      return b;
    });
    b.in = vi.fn((col: string, val: unknown) => {
      if (col === "email_id") inVals = (val as string[]) ?? [];
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => {
      if (isHead) {
        return resolve({ count: membershipFiltered().length, error: null });
      }
      return resolve({ data: resolveRows(), error: null });
    };
    return b;
  };

  return {
    // public-schema tables (agent_runs Queue read + the History/Patterns
    // count-head branches we let fail closed) use the chainable agent builder;
    // debtor.email_labels (via .schema("debtor")) uses the membership builder.
    from: (_table: string) => agentBuilder(),
    schema: () => ({ from: () => labelBuilder() }),
  } as unknown as SupabaseClient;
}

// Helper: ISO timestamp N minutes before a fixed base (older = lexicographically smaller).
const BASE = Date.parse("2026-05-28T12:00:00Z");
const ts = (minsAgo: number) => new Date(BASE - minsAgo * 60_000).toISOString();

/** Drive loadQueueBucket to pagination exhaustion; collect every paged id. */
async function exhaustQueue(
  admin: SupabaseClient,
  limit: number,
): Promise<{ ids: string[]; total: number; pages: number }> {
  const collected: string[] = [];
  let before: string | null = null;
  let total = -1;
  let pages = 0;
  let guard = 0;
  do {
    const page: BucketPage = await loadQueueBucket(admin, "debtor-email", {
      limit,
      before,
    });
    total = page.total;
    collected.push(...page.ids);
    before = page.nextBefore;
    pages += 1;
    guard += 1;
    if (guard > 1000) throw new Error("pagination did not terminate");
  } while (before !== null);
  return { ids: collected, total, pages };
}

describe("bucket integration — count === list over ALL pages + Queue/History partition", () => {
  it("exhausting Queue pagination yields exactly `total` distinct ids, and that total === getModeBarCounts(...).queue.count (chip === list over every page)", async () => {
    // N=5 un-decided labels, limit=2 → 3 pages (2,2,1). N > limit on purpose.
    const labels: LabelRow[] = [
      { id: "L1", email_id: "e1", created_at: ts(1) },
      { id: "L2", email_id: "e2", created_at: ts(2) },
      { id: "L3", email_id: "e3", created_at: ts(3) },
      { id: "L4", email_id: "e4", created_at: ts(4) },
      { id: "L5", email_id: "e5", created_at: ts(5) },
    ];
    const runs: RunRow[] = labels.map((l) => ({
      email_id: l.email_id,
      status: "predicted", // un-decided, not done → all in Queue
      human_verdict: null,
    }));
    const admin = makeAdmin({ runs, labels });

    // 1. List side: walk every page following nextBefore to exhaustion.
    const { ids, total, pages } = await exhaustQueue(admin, 2);
    expect(pages).toBe(3); // 2 + 2 + 1 — multi-page fixture really paged
    const pagedSet = new Set(ids);

    // 2. Chip side: the count the mode bar renders.
    const counts = await getModeBarCounts(makeAdmin({ runs, labels }), "debtor-email");
    expect(counts.queue).not.toBeNull();
    const chip = counts.queue!.count;

    // THE invariant: Set(all paged ids).size === total === chip count.
    expect(pagedSet.size).toBe(total);
    expect(total).toBe(chip);
    expect(pagedSet.size).toBe(chip);
    // No duplicates leaked across pages, and we reached the whole population.
    expect(ids.length).toBe(5);
    expect(pagedSet).toEqual(new Set(["L1", "L2", "L3", "L4", "L5"]));
  });

  it("count === list holds when one email carries MULTIPLE label rows (unit = label row, not DISTINCT email_id)", async () => {
    // 4 label rows across 2 un-decided emails; limit=3 → 2 pages (3,1).
    const labels: LabelRow[] = [
      { id: "L1", email_id: "e1", created_at: ts(1) },
      { id: "L2", email_id: "e1", created_at: ts(2) }, // same email as L1
      { id: "L3", email_id: "e2", created_at: ts(3) },
      { id: "L4", email_id: "e2", created_at: ts(4) }, // same email as L3
    ];
    const runs: RunRow[] = [
      { email_id: "e1", status: "predicted", human_verdict: null },
      { email_id: "e2", status: "classifying", human_verdict: null },
    ];
    const admin = makeAdmin({ runs, labels });

    const { ids, total } = await exhaustQueue(admin, 3);
    const counts = await getModeBarCounts(makeAdmin({ runs, labels }), "debtor-email");

    // 4 label rows, NOT 2 distinct emails.
    expect(total).toBe(4);
    expect(new Set(ids).size).toBe(4);
    expect(counts.queue!.count).toBe(4);
    expect(new Set(ids)).toEqual(new Set(["L1", "L2", "L3", "L4"]));
  });

  it("Queue ∩ History = ∅ AND Queue ∪ History = every label, over a mixed awaiting+decided+done fixture", async () => {
    const labels: LabelRow[] = [
      { id: "Lpred", email_id: "ep", created_at: ts(1) }, // predicted+null → Queue
      { id: "Lclas", email_id: "ec", created_at: ts(2) }, // classifying → Queue
      { id: "Ldone", email_id: "ed", created_at: ts(3) }, // status=done → History
      { id: "Lverd", email_id: "ev", created_at: ts(4) }, // verdict-set → History
      { id: "Lblk", email_id: "eb", created_at: ts(5) }, // block-state, un-decided → Queue
    ];
    const runs: RunRow[] = [
      { email_id: "ep", status: "predicted", human_verdict: null },
      { email_id: "ec", status: "classifying", human_verdict: null },
      { email_id: "ed", status: "done", human_verdict: null },
      { email_id: "ev", status: "routed_human_queue", human_verdict: "approved" },
      { email_id: "eb", status: "login_failed_blocked", human_verdict: null },
    ];

    // Exhaust BOTH buckets (limit smaller than each population so paging matters).
    const queue = await exhaustQueue(makeAdmin({ runs, labels }), 2);

    const hCollected: string[] = [];
    let hBefore: string | null = null;
    let hGuard = 0;
    do {
      const page: BucketPage = await loadHistoryBucket(
        makeAdmin({ runs, labels }),
        "debtor-email",
        { limit: 1, before: hBefore },
      );
      hCollected.push(...page.ids);
      hBefore = page.nextBefore;
      if (++hGuard > 1000) throw new Error("history pagination did not terminate");
    } while (hBefore !== null);

    const qSet = new Set(queue.ids);
    const hSet = new Set(hCollected);

    // Disjoint: no id in both.
    expect([...qSet].filter((id) => hSet.has(id))).toEqual([]);
    // Complete: union covers every label row.
    expect(new Set([...qSet, ...hSet])).toEqual(
      new Set(["Lpred", "Lclas", "Ldone", "Lverd", "Lblk"]),
    );
    // The specific partition (predicted + classifying + block → Queue; done + verdict → History).
    expect(qSet).toEqual(new Set(["Lpred", "Lclas", "Lblk"]));
    expect(hSet).toEqual(new Set(["Ldone", "Lverd"]));

    // And the chip still equals the Queue list over all pages on this mixed fixture.
    const counts = await getModeBarCounts(makeAdmin({ runs, labels }), "debtor-email");
    expect(counts.queue!.count).toBe(queue.total);
    expect(qSet.size).toBe(queue.total);
  });
});
