// Phase 69 (CANO-02, D-11). Tests for the brand-register loader skeleton.
// Covers happy path + unknown-code throw + malformed-shape throw against an
// in-memory mock SupabaseClient. End-to-end live-DB assertions are layered on
// in Wave 2.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadBrandRegister,
  loadAllBrandRegisters,
  UnknownBrandError,
  MalformedRegistryError,
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

const SICLI_SUD: BrandRegister = {
  code: "sicli-sud",
  display_name: "Sicli Sud",
  register_language: "fr",
  register_dialect: "fr-BE",
  signoff_phrase: "Cordialement",
  formal_address: "vous",
  nxt_database_alias: "sicli-sud",
  icontroller_company: "sicli-sud",
};

function makeAdmin(swarmRow: SwarmRow | null): SupabaseClient {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: swarmRow, error: null }),
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

function swarmRowWith(entityBrand: unknown): SwarmRow {
  return {
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
    entity_brand: entityBrand as SwarmRow["entity_brand"],
    tenant_domains: [],
  };
}

beforeEach(() => {
  __resetBrandRegisterCacheForTests();
  __resetSwarmCacheForTests();
});

describe("loadBrandRegister", () => {
  it("returns the BrandRegister for a known code", async () => {
    const admin = makeAdmin(swarmRowWith([SMEBA, SICLI_SUD]));
    const out = await loadBrandRegister(admin, "debtor-email", "smeba");
    expect(out).toEqual(SMEBA);
  });

  it("returns the FR brand metadata for sicli-sud", async () => {
    const admin = makeAdmin(swarmRowWith([SMEBA, SICLI_SUD]));
    const out = await loadBrandRegister(admin, "debtor-email", "sicli-sud");
    expect(out.register_language).toBe("fr");
    expect(out.signoff_phrase).toBe("Cordialement");
    expect(out.formal_address).toBe("vous");
  });

  it("throws UnknownBrandError for a code not in the registry", async () => {
    const admin = makeAdmin(swarmRowWith([SMEBA]));
    await expect(
      loadBrandRegister(admin, "debtor-email", "smeba-uk"),
    ).rejects.toBeInstanceOf(UnknownBrandError);
  });

  it("throws MalformedRegistryError when entity_brand is still string-array", async () => {
    const admin = makeAdmin(swarmRowWith(["smeba", "sicli-sud"]));
    await expect(
      loadBrandRegister(admin, "debtor-email", "smeba"),
    ).rejects.toBeInstanceOf(MalformedRegistryError);
  });

  it("throws MalformedRegistryError when swarm row is missing", async () => {
    const admin = makeAdmin(null);
    await expect(
      loadBrandRegister(admin, "debtor-email", "smeba"),
    ).rejects.toBeInstanceOf(MalformedRegistryError);
  });

  it("throws MalformedRegistryError when an element is missing required fields", async () => {
    const broken = { code: "smeba", display_name: "Smeba" }; // missing other fields
    const admin = makeAdmin(swarmRowWith([broken]));
    await expect(
      loadBrandRegister(admin, "debtor-email", "smeba"),
    ).rejects.toBeInstanceOf(MalformedRegistryError);
  });

  it.todo("caches the resolved BrandRegister per (swarm_type, brand_code)");
  it.todo("re-reads from Supabase after __resetBrandRegisterCacheForTests");
});

describe("loadAllBrandRegisters", () => {
  it("returns the full list when entity_brand is the post-Wave-1 shape", async () => {
    const admin = makeAdmin(swarmRowWith([SMEBA, SICLI_SUD]));
    const out = await loadAllBrandRegisters(admin, "debtor-email");
    expect(out).toHaveLength(2);
    expect(out.map((b) => b.code).sort()).toEqual(["sicli-sud", "smeba"]);
  });

  it("rejects an empty array vs a malformed shape distinctly", async () => {
    const admin = makeAdmin(swarmRowWith([]));
    const out = await loadAllBrandRegisters(admin, "debtor-email");
    expect(out).toEqual([]);
  });
});
