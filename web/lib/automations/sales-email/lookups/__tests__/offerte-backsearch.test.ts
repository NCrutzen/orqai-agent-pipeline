// Phase 120-02 Task 1 (TDD) — offerte → account via the resolver_index SQL
// back-search. Replaces the spike-011 REST false-positive (/api/quotes/search
// ignored searchTerm → every offerte resolved to 512887). The substrate
// (lookupResolveCandidates) is mocked so this suite never touches NXT.
//
// Ground-truth (verified live, 2026-06-17): "SB014098" normalizes to bare digits
// "14098" → identifier_kind "quote_no", scope_key "SB", party_id "BX228895"
// (Bever B.V.), is_unique_in_scope true. The SAME digits also exist under
// "order_no" for BX490393 — so the offerte path MUST filter by kind first.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { lookupResolveCandidatesMock } = vi.hoisted(() => ({
  lookupResolveCandidatesMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { lookupOfferteToAccount } from "../offerte";

const ctx = { nxt_database: "nxt", brand_id: "SB" };

beforeEach(() => {
  lookupResolveCandidatesMock.mockReset();
});

describe("Phase 120-02: offerte resolver_index back-search", () => {
  it("SB014098 → 14098 → BX228895 (quote_no, unique-in-scope), kind-disambiguated from order_no", async () => {
    // Both kinds present for the digits — the offerte path must pick the quote_no.
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "order_no", identifier_value_norm: "14098", party_id: "BX490393", party_name: "Other BV", scope_key: "SB", is_unique_in_scope: true, status: "active" },
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX228895", party_name: "Bever B.V.", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOfferteToAccount(ctx, "Vraag over Offerte SB014098", "");

    expect(r?.customer_account_id).toBe("BX228895");
    expect(r?.customer_name).toBe("Bever B.V.");
    expect(r?.identifier_kind).toBe("quote_no");
    expect(r?.matched_identifier).toBe("SB014098");

    // The bare-digit form (prefix + leading zeros stripped) is what hits the
    // substrate, scoped to BX / SB.
    const arg = lookupResolveCandidatesMock.mock.calls[0][0];
    expect(arg.identifiers).toContain("14098");
    expect(arg.environment_id).toBe("BX");
    expect(arg.brand_scope).toContain("SB");
  });

  it("ambiguous (≥2 distinct quote_no parties) → null (fail-closed, no confident wrong guess)", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX111", party_name: "A", scope_key: "SB", is_unique_in_scope: true, status: "active" },
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX222", party_name: "B", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOfferteToAccount(ctx, "Offerte SB014098", "");
    expect(r).toBeNull();
  });

  it("only an order_no row for the digits → null (it is not an offerte)", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "order_no", identifier_value_norm: "14098", party_id: "BX490393", party_name: "Other", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOfferteToAccount(ctx, "Offerte SB014098", "");
    expect(r).toBeNull();
  });

  it("substrate rejection → null (single-layer failure must not fail the resolver)", async () => {
    lookupResolveCandidatesMock.mockRejectedValue(new Error("zap timeout"));
    const r = await lookupOfferteToAccount(ctx, "Offerte SB014098", "");
    expect(r).toBeNull();
  });

  it("no offerte identifier in subject/body → substrate never called (V5)", async () => {
    const r = await lookupOfferteToAccount(ctx, "Algemene vraag", "geen nummer");
    expect(r).toBeNull();
    expect(lookupResolveCandidatesMock).not.toHaveBeenCalled();
  });
});
