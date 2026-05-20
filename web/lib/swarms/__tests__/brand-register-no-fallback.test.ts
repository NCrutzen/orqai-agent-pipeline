// Phase 69 (CANO-02, threat T-69-01). Asserts that loadBrandRegister has NO
// defensive fallback: an unknown brand_code MUST throw, not return a
// hardcoded "smeba" or any default. Locking this test in keeps a future
// well-meaning refactor from re-introducing a silent default that would
// render replies with the wrong register/signoff for an unrecognised brand.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadBrandRegister,
  UnknownBrandError,
  __resetBrandRegisterCacheForTests,
  type BrandRegister,
} from "../brand-register";
import { __resetCacheForTests as __resetSwarmCacheForTests } from "../registry";
import type { SwarmRow } from "../types";

const SMEBA: BrandRegister = {
  code: "smeba",
  display_name: "Smeba",
  register_language: "nl",
  register_dialect: "nl-NL",
  signoff_phrase: "Met vriendelijke groet",
  formal_address: "u",
  nxt_database_alias: "smeba",
  icontroller_company: "smeba",
};

function makeAdmin(brands: BrandRegister[]): SupabaseClient {
  const swarmRow: SwarmRow = {
    swarm_type: "debtor-email",
    display_name: "Debtor Email",
    description: null,
    review_route: "",
    source_table: "",
    enabled: true,
    ui_config: {
      tree_levels: [],
      row_columns: [],
      drawer_fields: [],
      default_sort: "",
    },
    side_effects: null,
    stage1_regex_module: null,
    stage2_entity_resolver: null,
    stage3_coordinator_agent_key: null,
    canonical_context_shape: null,
    entity_brand: brands as unknown as SwarmRow["entity_brand"],
    tenant_domains: [],
  };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: swarmRow, error: null }),
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

beforeEach(() => {
  __resetBrandRegisterCacheForTests();
  __resetSwarmCacheForTests();
});

describe("brand-register has no defensive fallback (T-69-01)", () => {
  it("throws on unknown code instead of returning the first registry entry", async () => {
    const admin = makeAdmin([SMEBA]);
    await expect(
      loadBrandRegister(admin, "debtor-email", "smeba-uk"),
    ).rejects.toBeInstanceOf(UnknownBrandError);
  });

  it("throws on unknown code even when registry has many entries", async () => {
    const admin = makeAdmin([
      SMEBA,
      { ...SMEBA, code: "sicli-noord", display_name: "Sicli Noord" },
      { ...SMEBA, code: "berki", display_name: "Berki" },
    ]);
    await expect(
      loadBrandRegister(admin, "debtor-email", "totally-fake-brand"),
    ).rejects.toBeInstanceOf(UnknownBrandError);
  });

  it("UnknownBrandError message lists the known codes (audit trail)", async () => {
    const admin = makeAdmin([
      SMEBA,
      { ...SMEBA, code: "sicli-noord", display_name: "Sicli Noord" },
    ]);
    try {
      await loadBrandRegister(admin, "debtor-email", "ghost");
      expect.fail("expected UnknownBrandError");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownBrandError);
      expect((err as Error).message).toContain("smeba");
      expect((err as Error).message).toContain("sicli-noord");
      expect((err as Error).message).toContain("ghost");
    }
  });
});
