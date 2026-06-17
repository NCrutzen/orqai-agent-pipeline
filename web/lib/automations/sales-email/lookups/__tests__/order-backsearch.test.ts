// Phase 120-02 Task 1 (TDD) — order/werkorder → account via the resolver_index
// SQL back-search (order_no kind). Substrate mocked. Same kind-disambiguation +
// fail-closed discipline as offerte.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { lookupResolveCandidatesMock } = vi.hoisted(() => ({
  lookupResolveCandidatesMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { lookupOrderToAccount } from "../order";

const ctx = { nxt_database: "nxt", brand_id: "SB" };

beforeEach(() => {
  lookupResolveCandidatesMock.mockReset();
});

describe("Phase 120-02: order resolver_index back-search", () => {
  it("order 14098 → order_no party BX490393 (kind-disambiguated from quote_no)", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX228895", party_name: "Bever B.V.", scope_key: "SB", is_unique_in_scope: true, status: "active" },
        { identifier_kind: "order_no", identifier_value_norm: "14098", party_id: "BX490393", party_name: "Order Klant", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOrderToAccount(ctx, "Status ordernummer 14098?", "");

    expect(r?.customer_account_id).toBe("BX490393");
    expect(r?.identifier_kind).toBe("order_no");
    expect(r?.matched_identifier).toBe("14098");
    const arg = lookupResolveCandidatesMock.mock.calls[0][0];
    expect(arg.identifiers).toContain("14098");
    expect(arg.environment_id).toBe("BX");
  });

  it("werkorder leading-zero form normalizes to bare digits", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "order_no", identifier_value_norm: "1634448", party_id: "BX700", party_name: "WO Klant", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOrderToAccount(ctx, "werkorder 1634448", "");
    expect(r?.customer_account_id).toBe("BX700");
  });

  it("ambiguous order (≥2 distinct order_no parties) → null", async () => {
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "order_no", identifier_value_norm: "12345", party_id: "BX1", party_name: "A", scope_key: "SB", is_unique_in_scope: true, status: "active" },
        { identifier_kind: "order_no", identifier_value_norm: "12345", party_id: "BX2", party_name: "B", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await lookupOrderToAccount(ctx, "order 12345", "");
    expect(r).toBeNull();
  });

  it("substrate rejection → null", async () => {
    lookupResolveCandidatesMock.mockRejectedValue(new Error("boom"));
    const r = await lookupOrderToAccount(ctx, "order 12345", "");
    expect(r).toBeNull();
  });
});
