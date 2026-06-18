// Phase 120-02 Task 1 (TDD) — postcode → Site → account via the resolver_index
// SQL back-search. POSTCODE PATH IS PAUSED: resolver_index does not index
// postcodes today (its site_no kind holds numeric site numbers; no postcode kind),
// so a real postcode resolves to null (fail-closed) — NOT a REST fallback. The
// wiring is present so it self-enables the moment a postcode/site kind lands.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { lookupResolveCandidatesMock } = vi.hoisted(() => ({
  lookupResolveCandidatesMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { lookupPostcodeToAccount } from "../sites";

const ctx = { nxt_database: "nxt", brand_id: "SB" };

beforeEach(() => {
  lookupResolveCandidatesMock.mockReset();
});

describe("Phase 120-02: postcode resolver_index back-search (paused)", () => {
  it("postcode with no matching kind in the substrate → null (paused: resolver_index has no postcode index)", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });
    const r = await lookupPostcodeToAccount(
      ctx,
      "Onderhoud op locatie",
      "Adres: Dorpsstraat 1, 1234 AB Smeba — graag inplannen.",
    );
    expect(r).toBeNull();
    // It used the SQL back-search transport (not REST).
    expect(lookupResolveCandidatesMock).toHaveBeenCalled();
  });

  it("self-enables at confidence:medium when a site/postcode kind row exists (future substrate extension)", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "site_no", identifier_value_norm: "1234AB", party_id: "BX778899", party_name: "Site BV", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });
    const r = await lookupPostcodeToAccount(
      ctx,
      "Onderhoud op locatie",
      "Adres: Dorpsstraat 1, 1234 AB Smeba — graag inplannen.",
    );
    expect(r?.customer_account_id).toBe("BX778899");
    expect(r?.confidence).toBe("medium");
    expect(r?.confidence).not.toBe("high");
  });

  it("no address-context postcode (bare SKU token) → substrate never called (V5/WR-02)", async () => {
    const r = await lookupPostcodeToAccount(ctx, "Onderdeel 1234AB op voorraad?", "");
    expect(r).toBeNull();
    expect(lookupResolveCandidatesMock).not.toHaveBeenCalled();
  });

  it("substrate rejection → null", async () => {
    lookupResolveCandidatesMock.mockRejectedValue(new Error("boom"));
    const r = await lookupPostcodeToAccount(ctx, "Adres", "Dorpsstraat 1, 1234 AB Smeba");
    expect(r).toBeNull();
  });
});
