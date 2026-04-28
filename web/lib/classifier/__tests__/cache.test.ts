// Phase 60-00 (D-08, D-28 step 3). readWhitelist TTL + fallback + isolation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readWhitelist, FALLBACK_WHITELIST, __resetCacheForTests } from "../cache";

type Result = { data: { rule_key: string }[] | null; error: { message: string } | null };

function makeAdmin(result: Result): { admin: SupabaseClient; selectSpy: ReturnType<typeof vi.fn> } {
  const selectSpy = vi.fn().mockResolvedValue(result);
  // Build a thenable chain: from().select().eq().eq() resolves to `result`.
  const builder: Record<string, unknown> = {};
  const eqChain = {
    eq: vi.fn().mockReturnThis(),
    then: (onFulfilled: (v: Result) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  builder.from = vi.fn().mockReturnValue({
    select: (...args: unknown[]) => {
      selectSpy(...args);
      return {
        eq: vi.fn().mockReturnValue(eqChain),
      };
    },
  });
  return { admin: builder as unknown as SupabaseClient, selectSpy };
}

describe("D-08: readWhitelist 60s TTL cache", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.useRealTimers();
  });

  it("returns the DB-backed Set on first call", async () => {
    const { admin } = makeAdmin({
      data: [{ rule_key: "rule_a" }, { rule_key: "rule_b" }],
      error: null,
    });
    const got = await readWhitelist(admin, "debtor-email");
    expect(got).toBeInstanceOf(Set);
    expect(got.has("rule_a")).toBe(true);
    expect(got.has("rule_b")).toBe(true);
  });

  it("hits the cache on a 2nd call within TTL (no DB roundtrip)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T10:00:00Z"));
    const { admin, selectSpy } = makeAdmin({
      data: [{ rule_key: "rule_a" }],
      error: null,
    });
    await readWhitelist(admin, "debtor-email");
    expect(selectSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    await readWhitelist(admin, "debtor-email");
    expect(selectSpy).toHaveBeenCalledTimes(1); // still cached
  });

  it("refetches after TTL elapses (60_001ms)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T10:00:00Z"));
    const { admin, selectSpy } = makeAdmin({
      data: [{ rule_key: "rule_a" }],
      error: null,
    });
    await readWhitelist(admin, "debtor-email");
    expect(selectSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await readWhitelist(admin, "debtor-email");
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });
});

describe("D-28 step 3: defensive fallback on Supabase error", () => {
  beforeEach(() => __resetCacheForTests());

  it("returns FALLBACK_WHITELIST when DB errors AND no prior cache (debtor-email)", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "boom" } });
    const got = await readWhitelist(admin, "debtor-email");
    expect(got).toBe(FALLBACK_WHITELIST);
    expect(got.has("subject_paid_marker")).toBe(true);
  });

  it("returns empty Set when DB errors for an unknown swarm with no prior cache", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "boom" } });
    const got = await readWhitelist(admin, "sales-email");
    expect(got).toBeInstanceOf(Set);
    expect(got.size).toBe(0);
  });

  it("returns last-known-good cached set on subsequent DB error", async () => {
    // First call succeeds with rule_a; second call (after TTL bust via reset)
    // would fail with error -- but we keep the in-memory cache so the same Set
    // returns. Use a single admin whose result we mutate between calls.
    const result: Result = { data: [{ rule_key: "rule_a" }], error: null };
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      then: (cb: (v: Result) => unknown) => Promise.resolve(result).then(cb),
    };
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqChain) }),
      }),
    } as unknown as SupabaseClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T10:00:00Z"));
    const first = await readWhitelist(admin, "debtor-email");
    expect(first.has("rule_a")).toBe(true);

    // Advance past TTL and flip result to error
    vi.advanceTimersByTime(60_001);
    result.data = null;
    result.error = { message: "boom" };
    const second = await readWhitelist(admin, "debtor-email");
    // Cache had been evicted-style (TTL expired) but the helper keeps returning
    // the prior entry on error per D-28 step 3.
    expect(second.has("rule_a")).toBe(true);
  });
});

describe("Cache key isolation per swarm_type", () => {
  beforeEach(() => __resetCacheForTests());

  it("debtor-email and sales-email caches do not collide", async () => {
    const debtor = makeAdmin({
      data: [{ rule_key: "subject_paid_marker" }],
      error: null,
    });
    const sales = makeAdmin({ data: [{ rule_key: "intent:demo" }], error: null });

    const d = await readWhitelist(debtor.admin, "debtor-email");
    const s = await readWhitelist(sales.admin, "sales-email");

    expect(d.has("subject_paid_marker")).toBe(true);
    expect(d.has("intent:demo")).toBe(false);
    expect(s.has("intent:demo")).toBe(true);
    expect(s.has("subject_paid_marker")).toBe(false);
  });
});
