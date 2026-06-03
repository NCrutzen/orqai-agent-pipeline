// Phase 06 Plan 01 (operator UAT 2026-05-28) — single email-level predicate.
//
// These tests pin the LOCKED bucket predicate and count-vs-list contract for
// the new paired loaders loadQueueBucket / loadHistoryBucket:
//   • Queue   = human_verdict IS NULL across ALL agent_runs AND no run is `done`
//               (INCLUDES `predicted` + the 5 block states + mid-pipeline).
//   • History = the EXACT complement: ANY run has human_verdict set OR ANY run
//               status === "done" (decided ∪ AI-terminal).
//   • Queue ∩ History = ∅ by construction; their union = all label rows.
//   • Count unit is the `email_labels` ROW (what the list + hydrator key off via
//     email_labels.id), NOT DISTINCT email_id. Two labels on one email → total 2.
//
// 06-VALIDATION.md signal-row mapping (test name → signal):
//   predicted-in-Queue          → "predicted (verdict null, not done) → Queue"
//   History=decided∪done        → "verdict-set OR status=done → History, not Queue"
//   overlap=0                    → "Queue ∩ History = ∅ over one mixed fixture"
//   count===list                → "two labels / one email → total 2, both in .ids"
//   pagination-exhaustion       → "iterating every page sums to exactly total"

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadQueueBucket,
  loadHistoryBucket,
  type BucketPage,
} from "../load-bucket-label-ids";

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

interface Captured {
  // membership predicate captured from the paged + count-head email_labels query
  labelNotIn?: { col: string; op: string; val: unknown };
  labelIn?: { col: string; val: unknown };
  headRequested: boolean; // was a { head: true } count query issued?
  pagedLt?: string | null; // the `.lt("created_at", before)` cursor on the paged query
}

/**
 * Build a mock admin that:
 *  - resolves `agent_runs` to the run fixture (captures nothing — pure data),
 *  - resolves `debtor.email_labels` for BOTH the count-head query (returns
 *    { count } when head:true) and the paged query (returns filtered + ordered
 *    + cursor-sliced + limited rows when head is absent). The mock APPLIES the
 *    membership predicate + `.lt` cursor + `.limit` client-side so pagination
 *    exhaustion is exercised realistically.
 */
function makeAdmin(opts: {
  runs: RunRow[];
  labels: LabelRow[];
}): { admin: SupabaseClient; captured: Captured } {
  const captured: Captured = { headRequested: false };

  const agentBuilder = () => {
    // WR-02: production pushes the decided-or-done predicate server-side via
    // `.or(...)` and range-pages via `.range(from,to)`. The mock honors BOTH so
    // it exercises the same access pattern: it filters to decided-or-done and
    // slices by the requested range so a >1000 fixture really pages.
    let rangeFrom = 0;
    let rangeTo = Infinity;
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.range = vi.fn((from: number, to: number) => {
      rangeFrom = from;
      rangeTo = to;
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => {
      const decided = opts.runs.filter(
        (r) => r.human_verdict != null || r.status === "done",
      );
      return resolve({
        data: decided.slice(rangeFrom, rangeTo + 1),
        error: null,
      });
    };
    return b;
  };

  const labelBuilder = () => {
    // Per-query local predicate state.
    let isHead = false;
    let notInVals: string[] | null = null; // membership: keep rows whose email_id NOT in this set
    let inVals: string[] | null = null; // membership: keep rows whose email_id IN this set
    // WR-01: composite (created_at, id) cursor — keep rows strictly "before"
    // (created_at < cAt) OR (created_at == cAt AND id < id).
    let cursor: { cAt: string; id: string } | null = null;
    let lim = Infinity;

    const parseListLiteral = (val: unknown): string[] => {
      // PostgREST NOT-IN literal "(a,b,c)" → ["a","b","c"]
      const s = String(val).replace(/^\(/, "").replace(/\)$/, "");
      return s.length ? s.split(",") : [];
    };

    // (created_at desc, id desc) — the composite order production applies.
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

    const resolveRows = (): LabelRow[] => {
      let rows = [...opts.labels];
      if (notInVals) rows = rows.filter((r) => !notInVals!.includes(r.email_id));
      if (inVals) rows = rows.filter((r) => inVals!.includes(r.email_id));
      rows.sort(cmpDesc);
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
      if (options?.head) {
        isHead = true;
        captured.headRequested = true;
      }
      return b;
    });
    b.order = vi.fn(() => b);
    b.limit = vi.fn((n: number) => {
      lim = n;
      return b;
    });
    // WR-01: the page cursor is now a composite `.or(created_at.lt.X,and(...))`.
    b.or = vi.fn((expr: string) => {
      // expr = "created_at.lt.<cAt>,and(created_at.eq.<cAt>,id.lt.<id>)"
      const m = expr.match(
        /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(.*)\)$/,
      );
      if (m) {
        cursor = { cAt: m[1], id: m[3] };
        captured.pagedLt = m[1];
      }
      return b;
    });
    b.not = vi.fn((col: string, op: string, val: unknown) => {
      captured.labelNotIn = { col, op, val };
      // WR-03: production AND-s one `.not(email_id,in,chunk)` per chunk, so the
      // mock ACCUMULATES exclusions (the complement is the union of all chunks).
      if (col === "email_id" && op === "in") {
        notInVals = [...(notInVals ?? []), ...parseListLiteral(val)];
      }
      return b;
    });
    b.in = vi.fn((col: string, val: unknown) => {
      captured.labelIn = { col, val };
      if (col === "email_id") inVals = (val as string[]) ?? [];
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => {
      if (isHead) {
        // count-head: total over the FULL membership population (no limit/cursor)
        const full = (() => {
          let rows = [...opts.labels];
          if (notInVals)
            rows = rows.filter((r) => !notInVals!.includes(r.email_id));
          if (inVals) rows = rows.filter((r) => inVals!.includes(r.email_id));
          return rows;
        })();
        return resolve({ count: full.length, error: null });
      }
      return resolve({ data: resolveRows(), error: null });
    };
    return b;
  };

  const admin = {
    from: (table: string) =>
      table === "agent_runs" ? agentBuilder() : labelBuilder(),
    schema: () => ({ from: () => labelBuilder() }),
  } as unknown as SupabaseClient;

  return { admin, captured };
}

// Helper: build an ISO timestamp N minutes before a fixed base (older = smaller).
const BASE = Date.parse("2026-05-28T12:00:00Z");
const ts = (minsAgo: number) => new Date(BASE - minsAgo * 60_000).toISOString();

describe("loadQueueBucket / loadHistoryBucket — single email-level predicate", () => {
  it("predicted-in-Queue: a `predicted` row (verdict null, not done) appears in the Queue bucket", async () => {
    const { admin } = makeAdmin({
      runs: [{ email_id: "e1", status: "predicted", human_verdict: null }],
      labels: [{ id: "L1", email_id: "e1", created_at: ts(1) }],
    });
    const page = await loadQueueBucket(admin, "debtor-email", { limit: 25 });
    expect(page.ids).toContain("L1");
    expect(page.total).toBe(1);
  });

  it("History=decided: a row whose ANY run has human_verdict set → History, NOT Queue", async () => {
    const labels = [{ id: "L1", email_id: "e1", created_at: ts(1) }];
    const runs: RunRow[] = [
      { email_id: "e1", status: "routed_human_queue", human_verdict: "approved" },
    ];
    const q = await loadQueueBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    const h = await loadHistoryBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    expect(q.ids).not.toContain("L1");
    expect(h.ids).toContain("L1");
    expect(h.total).toBe(1);
  });

  it("History=done: a status='done' row with no verdict → History, NOT Queue", async () => {
    const labels = [{ id: "L1", email_id: "e1", created_at: ts(1) }];
    const runs: RunRow[] = [
      { email_id: "e1", status: "done", human_verdict: null },
    ];
    const q = await loadQueueBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    const h = await loadHistoryBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    expect(q.ids).not.toContain("L1");
    expect(h.ids).toContain("L1");
  });

  it("mid-classification row (status='classifying', verdict null) → Queue, not History", async () => {
    const labels = [{ id: "L1", email_id: "e1", created_at: ts(1) }];
    const runs: RunRow[] = [
      { email_id: "e1", status: "classifying", human_verdict: null },
    ];
    const q = await loadQueueBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    const h = await loadHistoryBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    expect(q.ids).toContain("L1");
    expect(h.ids).not.toContain("L1");
  });

  it("overlap=0: over ONE mixed fixture Queue and History ids are disjoint AND their union = all labels", async () => {
    const labels: LabelRow[] = [
      { id: "Lpred", email_id: "ep", created_at: ts(1) }, // predicted+null → Queue
      { id: "Ldone", email_id: "ed", created_at: ts(2) }, // done → History
      { id: "Lverd", email_id: "ev", created_at: ts(3) }, // verdict-set → History
      { id: "Lclas", email_id: "ec", created_at: ts(4) }, // classifying → Queue
    ];
    const runs: RunRow[] = [
      { email_id: "ep", status: "predicted", human_verdict: null },
      { email_id: "ed", status: "done", human_verdict: null },
      { email_id: "ev", status: "routed_human_queue", human_verdict: "approved" },
      { email_id: "ec", status: "classifying", human_verdict: null },
    ];
    const q = await loadQueueBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 50 });
    const h = await loadHistoryBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 50 });

    const qSet = new Set(q.ids);
    const hSet = new Set(h.ids);
    // disjoint: no id appears in both buckets
    const intersection = [...qSet].filter((id) => hSet.has(id));
    expect(intersection).toEqual([]);
    // union equals all four label rows
    const union = new Set([...qSet, ...hSet]);
    expect(union).toEqual(new Set(["Lpred", "Ldone", "Lverd", "Lclas"]));
    // and the specific partition
    expect(qSet).toEqual(new Set(["Lpred", "Lclas"]));
    expect(hSet).toEqual(new Set(["Ldone", "Lverd"]));
  });

  it("History broadened: 1 verdict row + 2 done rows → History total = 3 (beyond the old 2-verdict-only set)", async () => {
    const labels: LabelRow[] = [
      { id: "Hv", email_id: "ev", created_at: ts(1) },
      { id: "Hd1", email_id: "ed1", created_at: ts(2) },
      { id: "Hd2", email_id: "ed2", created_at: ts(3) },
    ];
    const runs: RunRow[] = [
      { email_id: "ev", status: "routed_human_queue", human_verdict: "rejected" },
      { email_id: "ed1", status: "done", human_verdict: null },
      { email_id: "ed2", status: "done", human_verdict: null },
    ];
    const h = await loadHistoryBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    expect(h.total).toBe(3);
    expect(new Set(h.ids)).toEqual(new Set(["Hv", "Hd1", "Hd2"]));
  });

  it("count===list: TWO email_labels sharing ONE un-decided email_id → Queue total === 2 and BOTH ids present (unit = label row, not DISTINCT email_id)", async () => {
    // Single email_id 'e1', two reviewable label rows on it, both un-decided.
    const labels: LabelRow[] = [
      { id: "L1", email_id: "e1", created_at: ts(1) },
      { id: "L2", email_id: "e1", created_at: ts(2) },
    ];
    const runs: RunRow[] = [
      { email_id: "e1", status: "predicted", human_verdict: null },
    ];
    const page = await loadQueueBucket(makeAdmin({ runs, labels }).admin, "debtor-email", { limit: 25 });
    // The count unit is the email_labels ROW, NOT DISTINCT email_id.
    expect(page.total).toBe(2);
    expect(new Set(page.ids)).toEqual(new Set(["L1", "L2"]));
  });

  it("pagination-exhaustion: total>limit → nextBefore non-null; second {before} call returns the disjoint next slice; union size === total with no duplicates", async () => {
    // 5 un-decided labels, page size 2 → 3 pages (2,2,1).
    const labels: LabelRow[] = [
      { id: "L1", email_id: "e1", created_at: ts(1) },
      { id: "L2", email_id: "e2", created_at: ts(2) },
      { id: "L3", email_id: "e3", created_at: ts(3) },
      { id: "L4", email_id: "e4", created_at: ts(4) },
      { id: "L5", email_id: "e5", created_at: ts(5) },
    ];
    const runs: RunRow[] = labels.map((l) => ({
      email_id: l.email_id,
      status: "predicted",
      human_verdict: null,
    }));

    const collected: string[] = [];
    let before: string | null = null;
    let total = -1;
    let guard = 0;
    do {
      const page: BucketPage = await loadQueueBucket(
        makeAdmin({ runs, labels }).admin,
        "debtor-email",
        { limit: 2, before },
      );
      total = page.total;
      collected.push(...page.ids);
      before = page.nextBefore;
      guard += 1;
      if (guard > 10) throw new Error("pagination did not terminate");
    } while (before !== null);

    expect(total).toBe(5);
    // exhaustion: exactly `total` distinct ids, no duplicates
    expect(collected.length).toBe(5);
    expect(new Set(collected).size).toBe(5);
    expect(new Set(collected)).toEqual(
      new Set(["L1", "L2", "L3", "L4", "L5"]),
    );
  });

  it("count-head total uses a head:true query distinct from the paged query (capacity guard)", async () => {
    const labels: LabelRow[] = [
      { id: "L1", email_id: "e1", created_at: ts(1) },
      { id: "L2", email_id: "e2", created_at: ts(2) },
      { id: "L3", email_id: "e3", created_at: ts(3) },
    ];
    const runs: RunRow[] = labels.map((l) => ({
      email_id: l.email_id,
      status: "predicted",
      human_verdict: null,
    }));
    const { admin, captured } = makeAdmin({ runs, labels });
    const page = await loadQueueBucket(admin, "debtor-email", { limit: 1 });
    expect(captured.headRequested).toBe(true);
    // limit=1 → only one paged id but total reflects the full population
    expect(page.ids.length).toBe(1);
    expect(page.total).toBe(3);
    expect(page.nextBefore).not.toBeNull();
  });

  it("Queue applies NO membership exclusion filter when nothing is decided-or-done", async () => {
    const { admin, captured } = makeAdmin({
      runs: [{ email_id: "e1", status: "predicted", human_verdict: null }],
      labels: [{ id: "L1", email_id: "e1", created_at: ts(1) }],
    });
    const page = await loadQueueBucket(admin, "debtor-email", { limit: 25 });
    expect(page.ids).toEqual(["L1"]);
    expect(captured.labelNotIn).toBeUndefined();
  });

  it("WR-01: duplicate created_at spanning a page boundary still exhausts to exactly total (no skip/dup)", async () => {
    // 6 un-decided labels, ALL sharing the EXACT same created_at (worst case:
    // batch-insert collision). Page size 2 → a created_at-only `.lt` cursor would
    // either skip the whole timestamp after page 1 (returning 2 of 6) or loop
    // forever re-emitting it. The composite (created_at,id) cursor must walk all 6.
    const SAME = ts(1);
    const labels: LabelRow[] = [
      { id: "Lf", email_id: "ef", created_at: SAME },
      { id: "Le", email_id: "ee", created_at: SAME },
      { id: "Ld", email_id: "ed", created_at: SAME },
      { id: "Lc", email_id: "ec", created_at: SAME },
      { id: "Lb", email_id: "eb", created_at: SAME },
      { id: "La", email_id: "ea", created_at: SAME },
    ];
    const runs: RunRow[] = labels.map((l) => ({
      email_id: l.email_id,
      status: "predicted",
      human_verdict: null,
    }));

    const collected: string[] = [];
    let before: string | null = null;
    let total = -1;
    let guard = 0;
    do {
      const page: BucketPage = await loadQueueBucket(
        makeAdmin({ runs, labels }).admin,
        "debtor-email",
        { limit: 2, before },
      );
      total = page.total;
      collected.push(...page.ids);
      before = page.nextBefore;
      if (++guard > 50) throw new Error("pagination did not terminate (cursor stuck on duplicate created_at)");
    } while (before !== null);

    expect(total).toBe(6);
    expect(collected.length).toBe(6); // every row emitted exactly once
    expect(new Set(collected).size).toBe(6); // no duplicates
    expect(new Set(collected)).toEqual(
      new Set(["La", "Lb", "Lc", "Ld", "Le", "Lf"]),
    );
  });

  it("WR-02: a >1000 decided-or-done population is NOT silently truncated (range-paged to exhaustion)", async () => {
    // 2500 decided emails — well past PostgREST's 1000-row default cap. With the
    // old unbounded select these would silently truncate at 1000, leaking ~1500
    // decided rows back into the Queue complement. The range-paging loop must
    // drain all 2500 so EVERY decided label lands in History and NONE in Queue.
    const N = 2500;
    const labels: LabelRow[] = [];
    const runs: RunRow[] = [];
    for (let i = 0; i < N; i++) {
      labels.push({ id: `L${i}`, email_id: `e${i}`, created_at: ts(i + 1) });
      runs.push({ email_id: `e${i}`, status: "done", human_verdict: null });
    }
    // History must count ALL 2500 (no cap).
    const h = await loadHistoryBucket(
      makeAdmin({ runs, labels }).admin,
      "debtor-email",
      { limit: 25 },
    );
    expect(h.total).toBe(N);
    // Queue is the exact complement → empty (every email is decided-or-done). If
    // the agent_runs fetch had capped at 1000, ~1500 decided emails would leak
    // here.
    const q = await loadQueueBucket(
      makeAdmin({ runs, labels }).admin,
      "debtor-email",
      { limit: 25 },
    );
    expect(q.total).toBe(0);
  });

  it("WR-03: a decided set larger than one chunk (>50) is counted+paged across chunks without dup/loss", async () => {
    // 120 decided emails → 3 chunks of 50/50/20 for the History `.in`, and 3
    // AND-ed `.not(...)` exclusions for the Queue complement. count===list must
    // still hold exactly across the chunk boundary.
    const N = 120;
    const labels: LabelRow[] = [];
    const runs: RunRow[] = [];
    for (let i = 0; i < N; i++) {
      labels.push({ id: `H${i}`, email_id: `e${i}`, created_at: ts(i + 1) });
      runs.push({
        email_id: `e${i}`,
        status: "routed_human_queue",
        human_verdict: "approved",
      });
    }
    // Plus 3 un-decided emails that must land in the Queue (NOT excluded twice).
    for (let i = 0; i < 3; i++) {
      labels.push({ id: `Q${i}`, email_id: `q${i}`, created_at: ts(N + i + 1) });
      runs.push({ email_id: `q${i}`, status: "predicted", human_verdict: null });
    }

    const h = await loadHistoryBucket(
      makeAdmin({ runs, labels }).admin,
      "debtor-email",
      { limit: 500 },
    );
    expect(h.total).toBe(N);
    expect(new Set(h.ids).size).toBe(N); // no dup across chunks
    expect(h.ids.every((id) => id.startsWith("H"))).toBe(true);

    const q = await loadQueueBucket(
      makeAdmin({ runs, labels }).admin,
      "debtor-email",
      { limit: 500 },
    );
    expect(q.total).toBe(3);
    expect(new Set(q.ids)).toEqual(new Set(["Q0", "Q1", "Q2"]));
  });

  it("WR-03: History pagination across chunks exhausts to exactly total with no dup/skip", async () => {
    // 60 decided labels (2 chunks: 50 + 10), page size 7 → multi-page exhaustion.
    const N = 60;
    const labels: LabelRow[] = [];
    const runs: RunRow[] = [];
    for (let i = 0; i < N; i++) {
      labels.push({ id: `H${i}`, email_id: `e${i}`, created_at: ts(i + 1) });
      runs.push({ email_id: `e${i}`, status: "done", human_verdict: null });
    }
    const collected: string[] = [];
    let before: string | null = null;
    let total = -1;
    let guard = 0;
    do {
      const page = await loadHistoryBucket(
        makeAdmin({ runs, labels }).admin,
        "debtor-email",
        { limit: 7, before },
      );
      total = page.total;
      collected.push(...page.ids);
      before = page.nextBefore;
      if (++guard > 100) throw new Error("history pagination did not terminate");
    } while (before !== null);
    expect(total).toBe(N);
    expect(collected.length).toBe(N);
    expect(new Set(collected).size).toBe(N);
  });

  it("History is empty (no label query) when nothing is decided-or-done", async () => {
    const { admin } = makeAdmin({
      runs: [{ email_id: "e1", status: "predicted", human_verdict: null }],
      labels: [{ id: "L1", email_id: "e1", created_at: ts(1) }],
    });
    const page = await loadHistoryBucket(admin, "debtor-email", { limit: 25 });
    expect(page).toEqual({ ids: [], total: 0, nextBefore: null });
  });
});
