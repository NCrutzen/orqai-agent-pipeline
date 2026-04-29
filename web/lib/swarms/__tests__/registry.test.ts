// Phase 56.7-01 (D-06). Loader/cache for the swarm registry: TTL hit/miss,
// per-swarm-type isolation, last-known-good on Supabase error, empty-array
// fallback for categories, and __resetCacheForTests behavior. Mirrors
// web/lib/classifier/__tests__/cache.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSwarm,
  loadSwarmCategories,
  __resetCacheForTests,
} from "../registry";
import type { SwarmRow, SwarmCategoryRow } from "../types";

type SwarmResult = { data: SwarmRow | null; error: { message: string } | null };
type CategoriesResult = {
  data: SwarmCategoryRow[] | null;
  error: { message: string } | null;
};

// Build a programmable mock SupabaseClient where each .from(<table>) returns a
// chainable builder ending in `.maybeSingle()` (for swarms) or `.order(...)`
// (for swarm_categories). Both ultimately resolve a per-call result via
// the supplied result-getter.

function makeAdmin(opts: {
  swarm?: () => SwarmResult;
  categories?: () => CategoriesResult;
}): {
  admin: SupabaseClient;
  swarmCalls: { count: number };
  categoryCalls: { count: number };
} {
  const swarmCalls = { count: 0 };
  const categoryCalls = { count: 0 };

  const swarmsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      swarmCalls.count += 1;
      return opts.swarm
        ? opts.swarm()
        : { data: null, error: null };
    }),
  };

  const categoriesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(async () => {
      categoryCalls.count += 1;
      return opts.categories
        ? opts.categories()
        : { data: [], error: null };
    }),
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "swarms") return swarmsBuilder;
      if (table === "swarm_categories") return categoriesChain;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { admin, swarmCalls, categoryCalls };
}

const sampleSwarm = (swarm_type: string): SwarmRow => ({
  swarm_type,
  display_name: "Sample",
  description: null,
  review_route: "/automations/[swarm]/review",
  source_table: "automation_runs",
  enabled: true,
  ui_config: {
    tree_levels: ["topic"],
    row_columns: [],
    drawer_fields: [],
    default_sort: "created_at desc",
  },
  side_effects: null,
});

const sampleCategory = (
  swarm_type: string,
  category_key: string,
  display_order: number,
): SwarmCategoryRow => ({
  swarm_type,
  category_key,
  display_label: category_key,
  outlook_label: null,
  action: "categorize_archive",
  swarm_dispatch: null,
  display_order,
  enabled: true,
});

describe("D-06: loadSwarm — 60s TTL cache", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.useRealTimers();
  });

  it("returns the row from Supabase on first call and caches it", async () => {
    const row = sampleSwarm("debtor-email");
    const { admin, swarmCalls } = makeAdmin({
      swarm: () => ({ data: row, error: null }),
    });
    const got = await loadSwarm(admin, "debtor-email");
    expect(got).toEqual(row);
    expect(swarmCalls.count).toBe(1);

    // Test 1 (TTL hit): second call within 60s does NOT round-trip.
    await loadSwarm(admin, "debtor-email");
    expect(swarmCalls.count).toBe(1);
  });

  it("refetches after TTL elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00Z"));
    const row = sampleSwarm("debtor-email");
    const { admin, swarmCalls } = makeAdmin({
      swarm: () => ({ data: row, error: null }),
    });
    await loadSwarm(admin, "debtor-email");
    expect(swarmCalls.count).toBe(1);
    vi.advanceTimersByTime(60_001);
    await loadSwarm(admin, "debtor-email");
    expect(swarmCalls.count).toBe(2);
  });

  it("isolates caches per swarm_type", async () => {
    const a = sampleSwarm("a");
    const b = sampleSwarm("b");
    const adminA = makeAdmin({ swarm: () => ({ data: a, error: null }) });
    const adminB = makeAdmin({ swarm: () => ({ data: b, error: null }) });

    const got1 = await loadSwarm(adminA.admin, "a");
    const got2 = await loadSwarm(adminB.admin, "b");
    expect(got1?.swarm_type).toBe("a");
    expect(got2?.swarm_type).toBe("b");

    // Re-read 'a' must still return 'a' (not 'b').
    const got1again = await loadSwarm(adminA.admin, "a");
    expect(got1again?.swarm_type).toBe("a");
  });

  it("returns last-known-good on Supabase error after a successful prior call", async () => {
    let firstCall = true;
    const row = sampleSwarm("debtor-email");
    const { admin } = makeAdmin({
      swarm: () => {
        if (firstCall) {
          firstCall = false;
          return { data: row, error: null };
        }
        return { data: null, error: { message: "boom" } };
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00Z"));
    const first = await loadSwarm(admin, "debtor-email");
    expect(first).toEqual(row);

    // Bust the TTL so the loader re-queries (and gets the error).
    vi.advanceTimersByTime(60_001);
    const second = await loadSwarm(admin, "debtor-email");
    expect(second).toEqual(row); // last-known-good
  });

  it("__resetCacheForTests forces a refetch within TTL", async () => {
    const row = sampleSwarm("debtor-email");
    const { admin, swarmCalls } = makeAdmin({
      swarm: () => ({ data: row, error: null }),
    });
    await loadSwarm(admin, "debtor-email");
    expect(swarmCalls.count).toBe(1);
    __resetCacheForTests();
    await loadSwarm(admin, "debtor-email");
    expect(swarmCalls.count).toBe(2);
  });
});

describe("D-06: loadSwarmCategories — empty fallback, ordering, last-known-good", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.useRealTimers();
  });

  it("returns [] (NOT null) when Supabase delivers null data with no error", async () => {
    const { admin } = makeAdmin({
      categories: () => ({ data: null, error: null }),
    });
    const got = await loadSwarmCategories(admin, "debtor-email");
    expect(Array.isArray(got)).toBe(true);
    expect(got).toEqual([]);
  });

  it("issues an .order('display_order', { ascending: true }) clause", async () => {
    // Track that .order is called. The mock above returns whatever Supabase
    // delivers, so we just verify the chain reached .order.
    const orderSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: orderSpy,
    };
    const admin = {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as SupabaseClient;

    await loadSwarmCategories(admin, "debtor-email");
    expect(orderSpy).toHaveBeenCalledWith("display_order", { ascending: true });
  });

  it("returns last-known-good on subsequent error", async () => {
    let firstCall = true;
    const cats = [
      sampleCategory("debtor-email", "payment", 10),
      sampleCategory("debtor-email", "unknown", 60),
    ];
    const { admin } = makeAdmin({
      categories: () => {
        if (firstCall) {
          firstCall = false;
          return { data: cats, error: null };
        }
        return { data: null, error: { message: "boom" } };
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00Z"));
    const first = await loadSwarmCategories(admin, "debtor-email");
    expect(first).toHaveLength(2);

    vi.advanceTimersByTime(60_001);
    const second = await loadSwarmCategories(admin, "debtor-email");
    expect(second).toEqual(cats); // last-known-good
  });
});
