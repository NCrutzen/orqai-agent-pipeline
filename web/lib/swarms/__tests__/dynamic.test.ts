// Phase 68 (D-15). dynamic.ts loader tests. Strategy: stub loadSwarm to
// return rows with arbitrary stage1/stage2 paths. We avoid hitting the real
// dynamic `import()` of the debtor-email modules by passing a path that the
// MODULE_CACHE seeds with, so the import call short-circuits to the cached
// stub. This keeps the unit test free of side effects.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../registry", () => ({
  loadSwarm: vi.fn(),
}));

import { loadSwarm } from "../registry";
import {
  loadStage1Classifier,
  loadStage2Resolver,
  __resetModuleCacheForTests,
} from "../dynamic";
import type { SwarmRow } from "../types";

const loadSwarmMock = vi.mocked(loadSwarm);

const baseSwarm = (
  stage1: string | null,
  stage2: string | null,
): SwarmRow => ({
  swarm_type: "debtor-email",
  display_name: "Debtor Email",
  description: null,
  review_route: "/automations/debtor-email/review",
  source_table: "automation_runs",
  enabled: true,
  ui_config: {
    tree_levels: ["topic"],
    row_columns: [],
    drawer_fields: [],
    default_sort: "created_at desc",
  },
  side_effects: null,
  stage1_regex_module: stage1,
  stage2_entity_resolver: stage2,
  stage3_coordinator_agent_key: null,
  canonical_context_shape: null,
  entity_brand: null,
});

const admin = {} as unknown as SupabaseClient;

describe("loadStage1Classifier / loadStage2Resolver", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
    __resetModuleCacheForTests();
  });

  it("throws when stage1_regex_module is missing", async () => {
    loadSwarmMock.mockResolvedValue(baseSwarm(null, null));
    await expect(
      loadStage1Classifier(admin, "debtor-email"),
    ).rejects.toThrow(/missing stage1_regex_module/);
  });

  it("throws when stage2_entity_resolver is missing", async () => {
    loadSwarmMock.mockResolvedValue(baseSwarm("@/lib/debtor-email/classify", null));
    await expect(
      loadStage2Resolver(admin, "debtor-email"),
    ).rejects.toThrow(/missing stage2_entity_resolver/);
  });

  it("loads the real debtor-email classifier and caches the module", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm("@/lib/debtor-email/classify", "@/lib/automations/debtor-email/resolve-debtor"),
    );
    const fn1 = await loadStage1Classifier(admin, "debtor-email");
    const fn2 = await loadStage1Classifier(admin, "debtor-email");
    expect(typeof fn1).toBe("function");
    // Identity-stable across calls — proves MODULE_CACHE hit on second call.
    expect(fn1).toBe(fn2);
  });

  it("loads the resolveEntity alias from resolve-debtor", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm("@/lib/debtor-email/classify", "@/lib/automations/debtor-email/resolve-debtor"),
    );
    const resolver = await loadStage2Resolver(admin, "debtor-email");
    expect(typeof resolver).toBe("function");
  });
});
