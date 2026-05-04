// Phase 56.7-01 (D-06). Loader/cache for the swarm registry: TTL hit/miss,
// per-swarm-type isolation, last-known-good on Supabase error, empty-array
// fallback for categories, and __resetCacheForTests behavior. Mirrors
// web/lib/classifier/__tests__/cache.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadSwarm,
  loadSwarmCategories,
  loadSwarmIntents,
  loadHandlerEvent,
  loadCanonicalContextShape,
  __resetCacheForTests,
} from "../registry";
import type { SwarmRow, SwarmCategoryRow, SwarmIntentRow } from "../types";

type SwarmResult = { data: SwarmRow | null; error: { message: string } | null };
type CategoriesResult = {
  data: SwarmCategoryRow[] | null;
  error: { message: string } | null;
};
type IntentsResult = {
  data: SwarmIntentRow[] | null;
  error: { message: string } | null;
};

// Build a programmable mock SupabaseClient where each .from(<table>) returns a
// chainable builder ending in `.maybeSingle()` (for swarms) or `.order(...)`
// (for swarm_categories). Both ultimately resolve a per-call result via
// the supplied result-getter.

function makeAdmin(opts: {
  swarm?: () => SwarmResult;
  categories?: () => CategoriesResult;
  intents?: () => IntentsResult;
}): {
  admin: SupabaseClient;
  swarmCalls: { count: number };
  categoryCalls: { count: number };
  intentCalls: { count: number };
} {
  const swarmCalls = { count: 0 };
  const categoryCalls = { count: 0 };
  const intentCalls = { count: 0 };

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

  // swarm_intents chain ends at .eq(...) (no .order/.maybeSingle).
  const intentsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(async () => {
      intentCalls.count += 1;
      return opts.intents ? opts.intents() : { data: [], error: null };
    }),
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "swarms") return swarmsBuilder;
      if (table === "swarm_categories") return categoriesChain;
      if (table === "swarm_intents") return intentsChain;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { admin, swarmCalls, categoryCalls, intentCalls };
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
  stage1_regex_module: null,
  stage2_entity_resolver: null,
  stage3_coordinator_agent_key: null,
  canonical_context_shape: null,
  entity_brand: null,
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

// Phase 68 — registry helpers for swarm_intents + canonical context shape.
const sampleIntent = (
  swarm_type: string,
  intent_key: string,
  handler_event: string,
  handler_agent_key: string | null = null,
): SwarmIntentRow => ({
  swarm_type,
  intent_key,
  handler_agent_key,
  handler_event,
  requires_orchestration: false,
  created_at: "2026-05-04T00:00:00Z",
  updated_at: "2026-05-04T00:00:00Z",
});

describe("Phase 68: loadSwarmIntents — TTL cache + last-known-good", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.useRealTimers();
  });

  it("returns 8 rows on first call and caches them", async () => {
    const intents = [
      sampleIntent("debtor-email", "copy_document_request", "debtor-email/copy_document_request.requested", "debtor-copy-document-body-agent"),
      sampleIntent("debtor-email", "payment_dispute", "debtor-email/payment_dispute.requested"),
      sampleIntent("debtor-email", "address_change", "debtor-email/address_change.requested"),
      sampleIntent("debtor-email", "peppol_request", "debtor-email/peppol_request.requested"),
      sampleIntent("debtor-email", "credit_request", "debtor-email/credit_request.requested"),
      sampleIntent("debtor-email", "contract_inquiry", "debtor-email/contract_inquiry.requested"),
      sampleIntent("debtor-email", "general_inquiry", "debtor-email/general_inquiry.requested"),
      sampleIntent("debtor-email", "other", "debtor-email/other.requested"),
    ];
    const { admin, intentCalls } = makeAdmin({
      intents: () => ({ data: intents, error: null }),
    });

    const first = await loadSwarmIntents(admin, "debtor-email");
    expect(first).toHaveLength(8);
    expect(intentCalls.count).toBe(1);

    // Cache hit — no second .from() call.
    const second = await loadSwarmIntents(admin, "debtor-email");
    expect(second).toHaveLength(8);
    expect(intentCalls.count).toBe(1);
  });

  it("returns last-known-good on Supabase error", async () => {
    let firstCall = true;
    const intents = [sampleIntent("debtor-email", "other", "debtor-email/other.requested")];
    const { admin } = makeAdmin({
      intents: () => {
        if (firstCall) {
          firstCall = false;
          return { data: intents, error: null };
        }
        return { data: null, error: { message: "boom" } };
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T10:00:00Z"));
    const first = await loadSwarmIntents(admin, "debtor-email");
    expect(first).toEqual(intents);
    vi.advanceTimersByTime(60_001);
    const second = await loadSwarmIntents(admin, "debtor-email");
    expect(second).toEqual(intents);
  });

  it("__resetCacheForTests clears INTENTS_CACHE", async () => {
    const intents = [sampleIntent("debtor-email", "other", "debtor-email/other.requested")];
    const { admin, intentCalls } = makeAdmin({
      intents: () => ({ data: intents, error: null }),
    });
    await loadSwarmIntents(admin, "debtor-email");
    expect(intentCalls.count).toBe(1);
    __resetCacheForTests();
    await loadSwarmIntents(admin, "debtor-email");
    expect(intentCalls.count).toBe(2);
  });
});

describe("Phase 68: loadHandlerEvent — intent → event lookup", () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it("returns the handler_event for a known intent", async () => {
    const intents = [
      sampleIntent("debtor-email", "copy_document_request", "debtor-email/copy_document_request.requested", "debtor-copy-document-body-agent"),
    ];
    const { admin } = makeAdmin({
      intents: () => ({ data: intents, error: null }),
    });
    const got = await loadHandlerEvent(admin, "debtor-email", "copy_document_request");
    expect(got).toBe("debtor-email/copy_document_request.requested");
  });

  it("returns null for an unknown intent", async () => {
    const intents = [
      sampleIntent("debtor-email", "other", "debtor-email/other.requested"),
    ];
    const { admin } = makeAdmin({
      intents: () => ({ data: intents, error: null }),
    });
    const got = await loadHandlerEvent(admin, "debtor-email", "unknown_intent");
    expect(got).toBeNull();
  });
});

describe("Phase 68: loadCanonicalContextShape", () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it("returns the shape with version field when present on swarm row", async () => {
    const row: SwarmRow = {
      ...sampleSwarm("debtor-email"),
      canonical_context_shape: {
        version: "2026-05-04.v1",
        fields: {
          customer_account_id: { type: "string", nullable: true },
        },
      },
    };
    const { admin } = makeAdmin({
      swarm: () => ({ data: row, error: null }),
    });
    const got = await loadCanonicalContextShape(admin, "debtor-email");
    expect(got?.version).toBe("2026-05-04.v1");
    expect(got?.fields.customer_account_id?.type).toBe("string");
  });

  it("returns null when swarm row absent", async () => {
    const { admin } = makeAdmin({
      swarm: () => ({ data: null, error: null }),
    });
    const got = await loadCanonicalContextShape(admin, "missing");
    expect(got).toBeNull();
  });
});
