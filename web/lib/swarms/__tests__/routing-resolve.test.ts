// Phase 131 Plan 01 Task 2 (ROUTE-02). loadRoutingDestinations cache/loader +
// the pure (bucket × brand) → target_mailbox resolver.
//
// Proves the cross-brand case (a fire-control mail received at info@smeba
// resolves to a fire-control mailbox, NOT smeba), the null-on-no-match
// fallback (caller treats null as → unrouted), and the []-for-empty-swarm
// behaviour (debtor/sales have no rows → the coordinator routing block is
// skipped → byte-neutral).

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRoutingDestinations,
  resolveRoutingDestination,
  __resetCacheForTests,
} from "../registry";
import type { RoutingDestinationRow } from "../types";

type DestResult = {
  data: RoutingDestinationRow[] | null;
  error: { message: string } | null;
};

// Mock SupabaseClient where .from("routing_destinations") returns a chainable
// builder whose SECOND .eq(...) (swarm_type, then active) resolves the result.
function makeAdmin(opts: { destinations?: () => DestResult }): {
  admin: SupabaseClient;
  destCalls: { count: number };
} {
  const destCalls = { count: 0 };
  let eqDepth = 0;
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (this: unknown) {
      eqDepth += 1;
      // The loader issues .eq("swarm_type", …).eq("active", true). Resolve on
      // the SECOND .eq (the terminal one).
      if (eqDepth >= 2) {
        eqDepth = 0;
        destCalls.count += 1;
        return Promise.resolve(
          opts.destinations ? opts.destinations() : { data: [], error: null },
        );
      }
      return chain;
    }),
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "routing_destinations") return chain;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;
  return { admin, destCalls };
}

const dest = (
  destination_key: string,
  brand: string,
  target_mailbox: string | null,
): RoutingDestinationRow => ({
  destination_key,
  brand,
  target_mailbox,
  outlook_category: target_mailbox ? "Cat" : null,
  active: true,
});

describe("Phase 131 ROUTE-02: loadRoutingDestinations loader", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.useRealTimers();
  });

  it("returns the active rows and caches them (no second round-trip within TTL)", async () => {
    const rows = [
      dest("inspecties", "smeba", "planning@smeba.nl"),
      dest("inspecties", "fire-control", "planning@fire-control.nl"),
    ];
    const { admin, destCalls } = makeAdmin({
      destinations: () => ({ data: rows, error: null }),
    });
    const first = await loadRoutingDestinations(admin, "info-routing");
    expect(first).toHaveLength(2);
    expect(destCalls.count).toBe(1);
    const second = await loadRoutingDestinations(admin, "info-routing");
    expect(second).toHaveLength(2);
    expect(destCalls.count).toBe(1); // cache hit
  });

  it("returns [] for a swarm_type with no rows (debtor/sales → block skipped)", async () => {
    const { admin } = makeAdmin({
      destinations: () => ({ data: [], error: null }),
    });
    const got = await loadRoutingDestinations(admin, "debtor-email");
    expect(Array.isArray(got)).toBe(true);
    expect(got).toEqual([]);
  });

  it("returns [] (not null) when Supabase delivers null data with no error", async () => {
    const { admin } = makeAdmin({
      destinations: () => ({ data: null, error: null }),
    });
    const got = await loadRoutingDestinations(admin, "sales-email");
    expect(got).toEqual([]);
  });

  it("returns last-known-good on Supabase error after a prior success", async () => {
    let firstCall = true;
    const rows = [dest("verkoop", "smeba", "verkoop@smeba.nl")];
    const { admin } = makeAdmin({
      destinations: () => {
        if (firstCall) {
          firstCall = false;
          return { data: rows, error: null };
        }
        return { data: null, error: { message: "boom" } };
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00Z"));
    const first = await loadRoutingDestinations(admin, "info-routing");
    expect(first).toEqual(rows);
    vi.advanceTimersByTime(60_001);
    const second = await loadRoutingDestinations(admin, "info-routing");
    expect(second).toEqual(rows); // last-known-good
  });
});

describe("Phase 131 ROUTE-02: resolveRoutingDestination (pure)", () => {
  const rows = [
    dest("inspecties", "smeba", "planning@smeba.nl"),
    dest("inspecties", "fire-control", "planning@fire-control.nl"),
    dest("verkoop", "smeba", "verkoop@smeba.nl"),
    dest("algemeen", "smeba", null), // gap-closure: matched-but-no-forward
    dest("unrouted", "smeba", null),
  ];

  it("resolves the CROSS-BRAND case: (inspecties, fire-control) → the fire-control mailbox, not smeba", () => {
    const got = resolveRoutingDestination(rows, "inspecties", "fire-control");
    expect(got).toEqual({ matched: true, target_mailbox: "planning@fire-control.nl" });
    // Sanity: the smeba pick is a different mailbox.
    expect(resolveRoutingDestination(rows, "inspecties", "smeba")).toEqual({
      matched: true,
      target_mailbox: "planning@smeba.nl",
    });
  });

  it("returns matched=false for a (bucket × brand) pair with no active row (→ caller treats as unrouted)", () => {
    expect(resolveRoutingDestination(rows, "inspecties", "berki")).toEqual({
      matched: false,
      target_mailbox: null,
    });
    expect(resolveRoutingDestination(rows, "storingen", "smeba")).toEqual({
      matched: false,
      target_mailbox: null,
    });
  });

  // Phase 131 gap-closure — a MATCHED row with a NULL target_mailbox is
  // matched:true, target null ("classified, no forward / stays"). This is the
  // signal the verdict builder turns into bucket-preserved + unrouted=false,
  // distinct from the no-match (matched:false) case above.
  it("returns matched=true, target null for a matched row whose target_mailbox is NULL (no-forward bucket)", () => {
    expect(resolveRoutingDestination(rows, "algemeen", "smeba")).toEqual({
      matched: true,
      target_mailbox: null,
    });
  });

  it("returns matched=true, target null for the unrouted sentinel (NULL target_mailbox)", () => {
    expect(resolveRoutingDestination(rows, "unrouted", "smeba")).toEqual({
      matched: true,
      target_mailbox: null,
    });
  });
});

// BUG 1 (CR-02) — the agent emits brand:null for single-tenant/no-brand mail
// (algemeen, sollicitaties, inspecties, storingen, opleidingen) but every seeded
// row has a NON-NULL brand. A strict (key && brand===brand) match collapses these
// to unrouted. The resolver must fall back to the SOLE row when a bucket has
// exactly one row (the brand guess is irrelevant — only one mailbox), while
// keeping cross-tenant exact-match safety (order_entry/verkoop have multiple rows
// → a null brand stays ambiguous → unrouted).
describe("Phase 131 BUG 1 (CR-02): null-brand single-tenant fallback", () => {
  // Mirrors the verified live seed: single row per single-tenant bucket, multiple
  // rows for the cross-tenant buckets (order_entry, verkoop), unrouted sentinel.
  const seed = [
    dest("algemeen", "smeba", "algemeen@smeba.nl"),
    dest("inspecties", "smeba", "inspecties@smeba.nl"),
    dest("opleidingen", "fire-control", "opleidingen@fire-control.nl"),
    dest("sollicitaties", "smeba", "hrm@smeba.nl"),
    dest("storingen", "smeba", "storingen@smeba.nl"),
    dest("order_entry", "smeba", "order@smeba.nl"),
    dest("order_entry", "fire-control", "order@fire-control.nl"),
    dest("order_entry", "berki", "order@berki.nl"),
    dest("verkoop", "smeba", "verkoop@smeba.nl"),
    dest("verkoop", "fire-control", "verkoop@fire-control.nl"),
    dest("verkoop", "berki", "verkoop@berki.nl"),
    dest("unrouted", "smeba", null),
  ];

  it("resolves a single-tenant bucket with brand=null to its sole mailbox", () => {
    expect(resolveRoutingDestination(seed, "sollicitaties", null)).toEqual({
      matched: true,
      target_mailbox: "hrm@smeba.nl",
    });
    expect(resolveRoutingDestination(seed, "algemeen", null)).toEqual({
      matched: true,
      target_mailbox: "algemeen@smeba.nl",
    });
    expect(resolveRoutingDestination(seed, "inspecties", null)).toEqual({
      matched: true,
      target_mailbox: "inspecties@smeba.nl",
    });
    expect(resolveRoutingDestination(seed, "storingen", null)).toEqual({
      matched: true,
      target_mailbox: "storingen@smeba.nl",
    });
    expect(resolveRoutingDestination(seed, "opleidingen", null)).toEqual({
      matched: true,
      target_mailbox: "opleidingen@fire-control.nl",
    });
  });

  it("keeps cross-tenant ambiguous: order_entry + brand=null → matched=false (unrouted)", () => {
    expect(resolveRoutingDestination(seed, "order_entry", null)).toEqual({
      matched: false,
      target_mailbox: null,
    });
    expect(resolveRoutingDestination(seed, "verkoop", null)).toEqual({
      matched: false,
      target_mailbox: null,
    });
  });

  it("keeps exact-match winning for cross-tenant: order_entry + 'berki' → order@berki.nl", () => {
    expect(resolveRoutingDestination(seed, "order_entry", "berki")).toEqual({
      matched: true,
      target_mailbox: "order@berki.nl",
    });
    expect(resolveRoutingDestination(seed, "verkoop", "fire-control")).toEqual({
      matched: true,
      target_mailbox: "verkoop@fire-control.nl",
    });
  });

  it("returns matched=false for a bucket with no rows at all", () => {
    expect(resolveRoutingDestination(seed, "nonexistent", null)).toEqual({
      matched: false,
      target_mailbox: null,
    });
    expect(resolveRoutingDestination(seed, "nonexistent", "smeba")).toEqual({
      matched: false,
      target_mailbox: null,
    });
  });

  it("single-tenant sentinel (sole row, NULL target) with brand=null → matched=true, target null", () => {
    expect(resolveRoutingDestination(seed, "unrouted", null)).toEqual({
      matched: true,
      target_mailbox: null,
    });
  });
});
