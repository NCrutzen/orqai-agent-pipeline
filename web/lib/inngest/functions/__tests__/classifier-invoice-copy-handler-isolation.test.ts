// Phase 69 (CANO-01, threat T-69-02) Wave 4 — single-brand isolation
// guarantee. Asserts that loadBrandRegister + the canonical handler-input
// shape NEVER cross brands within a single invocation: per (swarm_type,
// brand_code) call returns exactly ONE BrandRegister object whose code matches
// the requested entity. Locks the data-driven prompt-input contract against
// accidental cross-brand register leakage. Mocks the Supabase client so the
// test stays hermetic (no live DB).

import { describe, it, expect, vi, beforeEach } from "vitest";

const FIVE_BRANDS = [
  { code: "smeba", display_name: "Smeba", register_language: "nl", register_dialect: "nl-NL", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "smeba", icontroller_company: "smeba" },
  { code: "smeba-fire", display_name: "Smeba-Fire", register_language: "nl", register_dialect: "nl-BE", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "smeba-fire", icontroller_company: "smeba-fire" },
  { code: "sicli-noord", display_name: "Sicli-Noord", register_language: "nl", register_dialect: "nl-BE", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "sicli-noord", icontroller_company: "sicli-noord" },
  { code: "sicli-sud", display_name: "Sicli-Sud", register_language: "fr", register_dialect: "fr-BE", signoff_phrase: "Cordialement", formal_address: "vous", nxt_database_alias: "sicli-sud", icontroller_company: "sicli-sud" },
  { code: "berki", display_name: "Berki", register_language: "nl", register_dialect: "nl-NL", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "berki", icontroller_company: "berki" },
];

vi.mock("@/lib/supabase/admin", () => {
  function makeChainForTable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === "swarms") {
        return Promise.resolve({
          data: { swarm_type: "debtor-email", entity_brand: FIVE_BRANDS, enabled: true },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  const from = vi.fn((table: string) => makeChainForTable(table));
  const schema = vi.fn(() => ({ from }));
  return {
    createAdminClient: vi.fn(() => ({ from, schema })),
  };
});

import { loadBrandRegister, UnknownBrandError } from "@/lib/swarms/brand-register";
import { __resetCacheForTests } from "@/lib/swarms/registry";
import { createAdminClient } from "@/lib/supabase/admin";

describe("classifier-invoice-copy-handler — single-brand input isolation (T-69-02)", () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it.each([
    ["smeba", "nl", "Met vriendelijke groet", "u"],
    ["sicli-sud", "fr", "Cordialement", "vous"],
    ["berki", "nl", "Met vriendelijke groet", "u"],
  ] as const)(
    "entity=%s resolves to that brand only (lang=%s, signoff=%s, formal_address=%s)",
    async (entity, expectedLang, expectedSignoff, expectedFormal) => {
      const admin = createAdminClient();
      const reg = await loadBrandRegister(admin, "debtor-email", entity);
      expect(reg.code).toBe(entity);
      expect(reg.register_language).toBe(expectedLang);
      expect(reg.signoff_phrase).toBe(expectedSignoff);
      expect(reg.formal_address).toBe(expectedFormal);
    },
  );

  it("loadBrandRegister returns a single object, never an array of brands", async () => {
    const admin = createAdminClient();
    const reg = await loadBrandRegister(admin, "debtor-email", "sicli-sud");
    expect(Array.isArray(reg)).toBe(false);
    expect(reg.code).toBe("sicli-sud");
    // No array-like indices leaked.
    expect((reg as unknown as Record<string, unknown>)["0"]).toBeUndefined();
  });

  it("unknown brand_code surfaces UnknownBrandError (no silent fallback)", async () => {
    const admin = createAdminClient();
    await expect(
      loadBrandRegister(admin, "debtor-email", "ghost-brand"),
    ).rejects.toBeInstanceOf(UnknownBrandError);
  });

  it("language input matches brand_register.register_language for every brand", async () => {
    const admin = createAdminClient();
    for (const brand of FIVE_BRANDS) {
      __resetCacheForTests();
      const reg = await loadBrandRegister(admin, "debtor-email", brand.code);
      expect(reg.register_language).toBe(brand.register_language);
      // The handler binds `language: brandReg.register_language` directly into
      // the agent inputs (Wave 4 refactor). Asserting the source field stays
      // aligned guarantees the canonical input shape never disagrees with the
      // brand registry on the single-brand path.
    }
  });
});
