// Phase 06 Plan 01 — getModeBarCounts queue-count is now sourced from
// loadQueueBucket(...).total (the SAME population that backs the Queue list),
// NOT from an agent_runs `.in("status", QUEUE_AWAITING_STATUSES)` row-count.
// This pins the count-vs-list fix: the chip can never disagree with the list,
// and the old agent_runs-row count (128) is gone in favour of the distinct
// reviewable-label total (e.g. 32). History + Patterns branches are unchanged.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the bucket loaders so we can assert BOTH chips are sourced from bucket
// `total` (queue, and IN-03: history) — proving chip === list for each, and that
// the queue path no longer issues an agent_runs status count.
const loadQueueBucketMock = vi.fn();
const loadHistoryBucketMock = vi.fn();
vi.mock("../load-bucket-label-ids", () => ({
  loadQueueBucket: (...args: unknown[]) => loadQueueBucketMock(...args),
  loadHistoryBucket: (...args: unknown[]) => loadHistoryBucketMock(...args),
}));

import { getModeBarCounts, QUEUE_AWAITING_STATUSES } from "../mode-bar-counts";

interface FixtureOpts {
  historyCount?: number;
  patternsCount?: number;
}

interface Harness {
  admin: SupabaseClient;
  // captures any .in("status", arr) call on an agent_runs builder — used to
  // PROVE the queue path no longer status-counts agent_runs.
  agentRunsStatusInCalls: () => unknown[];
}

function makeAdmin(opts: FixtureOpts): Harness {
  const statusInCalls: unknown[] = [];

  const makeBuilder = (
    resolution: { count: number; error: unknown },
    isAgentRuns = false,
  ) => {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.gte = vi.fn(() => b);
    b.not = vi.fn(() => b);
    b.in = vi.fn((col: string, arr: unknown) => {
      // Only count agent_runs status filters — the patterns query legitimately
      // does .in("status", ["open","in_review"]) on promotion_candidates.
      if (isAgentRuns && col === "status") statusInCalls.push(arr);
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({ count: resolution.count, error: resolution.error });
    return b;
  };

  const admin = {
    from: (table: string) => {
      if (table === "agent_runs") {
        // history (7d verdict count)
        return makeBuilder({ count: opts.historyCount ?? 0, error: null }, true);
      }
      // promotion_candidates = patterns
      return makeBuilder({ count: opts.patternsCount ?? 0, error: null });
    },
  } as unknown as SupabaseClient;

  return { admin, agentRunsStatusInCalls: () => statusInCalls };
}

beforeEach(() => {
  loadQueueBucketMock.mockReset();
  loadHistoryBucketMock.mockReset();
});

describe("getModeBarCounts queue count (Phase 06 Plan 01)", () => {
  it("queue count is sourced from loadQueueBucket(...).total, not an agent_runs status count", async () => {
    loadQueueBucketMock.mockResolvedValue({
      total: 32,
      ids: ["L1"],
      nextBefore: null,
    });
    const { admin, agentRunsStatusInCalls } = makeAdmin({});
    const counts = await getModeBarCounts(admin, "debtor-email");

    // count comes from the bucket total — proves chip === list population
    expect(counts.queue).toEqual({ count: 32, sub: "in queue" });
    expect(loadQueueBucketMock).toHaveBeenCalledWith(
      admin,
      "debtor-email",
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    // OLD behaviour gone: the queue path issues NO agent_runs .in("status") count.
    expect(agentRunsStatusInCalls()).toEqual([]);
  });

  it("queue falls closed to null when the bucket load throws", async () => {
    loadQueueBucketMock.mockRejectedValue(new Error("boom"));
    const { admin } = makeAdmin({});
    const counts = await getModeBarCounts(admin, "debtor-email");
    expect(counts.queue).toBeNull();
  });

  it("IN-03: history chip is sourced from loadHistoryBucket(...).total (chip === /history list), patterns unchanged", async () => {
    loadQueueBucketMock.mockResolvedValue({
      total: 1,
      ids: [],
      nextBefore: null,
    });
    // History now mirrors the Queue fix: chip = history bucket total (decided ∪
    // done, per-label), NOT the old verdict-only 7d agent_runs count.
    loadHistoryBucketMock.mockResolvedValue({
      total: 312,
      ids: [],
      nextBefore: null,
    });
    const { admin } = makeAdmin({ patternsCount: 18 });
    const counts = await getModeBarCounts(admin, "debtor-email");
    // sub-label no longer claims a 7d window the all-time bucket count doesn't apply.
    expect(counts.history).toEqual({ count: 312, sub: "handled" });
    expect(loadHistoryBucketMock).toHaveBeenCalledWith(
      admin,
      "debtor-email",
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    expect(counts.patterns).toEqual({ count: 18, sub: "candidates · 30d" });
  });

  it("IN-03: history falls closed to null when the history bucket load throws", async () => {
    loadQueueBucketMock.mockResolvedValue({ total: 1, ids: [], nextBefore: null });
    loadHistoryBucketMock.mockRejectedValue(new Error("boom"));
    const { admin } = makeAdmin({ patternsCount: 0 });
    const counts = await getModeBarCounts(admin, "debtor-email");
    expect(counts.history).toBeNull();
  });

  it("getModeBarCounts required arity is unchanged: (admin, swarmType) — overrides is optional", () => {
    // arity check — the WR-05 overrides param has a default so it does not count.
    expect(getModeBarCounts.length).toBe(2);
  });

  it("WR-05: queueTotal override reuses the page's bucket total — no second loadQueueBucket scan", async () => {
    loadHistoryBucketMock.mockResolvedValue({ total: 5, ids: [], nextBefore: null });
    const { admin } = makeAdmin({ patternsCount: 0 });
    const counts = await getModeBarCounts(admin, "debtor-email", {
      queueTotal: 99,
    });
    expect(counts.queue).toEqual({ count: 99, sub: "in queue" });
    // The redundant Queue scan must NOT run when the page supplies the total.
    expect(loadQueueBucketMock).not.toHaveBeenCalled();
  });

  it("WR-05: historyTotal override reuses the page's bucket total — no second loadHistoryBucket scan", async () => {
    loadQueueBucketMock.mockResolvedValue({ total: 3, ids: [], nextBefore: null });
    const { admin } = makeAdmin({ patternsCount: 0 });
    const counts = await getModeBarCounts(admin, "debtor-email", {
      historyTotal: 42,
    });
    expect(counts.history).toEqual({ count: 42, sub: "handled" });
    expect(loadHistoryBucketMock).not.toHaveBeenCalled();
  });

  it("QUEUE_AWAITING_STATUSES is still exported (named const), even though it no longer computes the queue count", () => {
    expect([...QUEUE_AWAITING_STATUSES]).toContain("routed_human_queue");
  });
});
