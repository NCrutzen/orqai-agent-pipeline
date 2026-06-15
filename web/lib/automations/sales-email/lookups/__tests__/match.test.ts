// Spike 011 regression guard — the FAIL-CLOSED response matcher.
//
// The bug: the old pickCustomer took content[0] of /api/{quotes,orders,sites}/search
// blindly, so a broad/default response resolved EVERY identifier to the same
// customer (live: 512887 for all offertes). pickMatchingCustomer must return a
// customer ONLY when a row demonstrably references the searched identifier.

import { describe, it, expect } from "vitest";
import { pickMatchingCustomer, rowReferencesTerm } from "../_match";

describe("pickMatchingCustomer — fail-closed verify-the-match", () => {
  it("returns null when the response does NOT reference the searched term (the 512887 bug)", () => {
    // A 'default' search result whose only row is an unrelated quote.
    const data = {
      content: [
        { quoteReference: "SB000001", customerId: 512887, customerName: "Some BV" },
      ],
    };
    expect(pickMatchingCustomer(data, "SB014098")).toBeNull();
  });

  it("resolves when a row's reference field equals the searched term", () => {
    const data = {
      content: [
        { quoteReference: "SB000001", customerId: 512887 },
        { quoteReference: "SB014098", customerId: 999001, customerName: "Bever Utrecht" },
      ],
    };
    expect(pickMatchingCustomer(data, "SB014098")).toEqual({
      customer_account_id: "999001",
      customer_name: "Bever Utrecht",
    });
  });

  it("picks the MATCHING row even when it is not first", () => {
    const data = [
      { reference: "SB011111", customerId: 1 },
      { reference: "SB022222", customerId: 2 },
      { reference: "SB014098", customerId: 3 },
    ];
    expect(pickMatchingCustomer(data, "SB014098")?.customer_account_id).toBe("3");
  });

  it("matches a postcode embedded in an address line (≥6-char containment)", () => {
    const data = {
      content: [{ address: "Dorpsstraat 1, 1234 AB Plaats", customerId: 777, name: "Klant X" }],
    };
    // searched "1234AB" should match "1234 AB" inside the address (normalized).
    expect(pickMatchingCustomer(data, "1234AB")).toEqual({
      customer_account_id: "777",
      customer_name: "Klant X",
    });
  });

  it("formatting-agnostic: 'SMEQ 98082' search matches 'SMEQ98082' field", () => {
    const data = [{ quoteRef: "SMEQ98082", accountId: 42 }];
    expect(pickMatchingCustomer(data, "SMEQ98082")?.customer_account_id).toBe("42");
  });

  it("returns null when a matching row has no customer id", () => {
    const data = [{ reference: "SB014098", status: "open" }];
    expect(pickMatchingCustomer(data, "SB014098")).toBeNull();
  });

  it("handles empty / malformed responses safely", () => {
    expect(pickMatchingCustomer(null, "SB014098")).toBeNull();
    expect(pickMatchingCustomer({ content: [] }, "SB014098")).toBeNull();
    expect(pickMatchingCustomer("oops", "SB014098")).toBeNull();
  });
});

describe("rowReferencesTerm — short-term substring guard", () => {
  it("requires EXACT field equality for short (<6) terms (no substring collision)", () => {
    // order '1234' must NOT match a row where it only appears inside a longer number.
    expect(rowReferencesTerm({ someNumber: "9912345" }, "1234")).toBe(false);
    // but an exact field equal to '1234' matches.
    expect(rowReferencesTerm({ orderNo: "1234" }, "1234")).toBe(true);
  });

  it("rejects terms too short to verify (<4 chars)", () => {
    expect(rowReferencesTerm({ x: "123" }, "123")).toBe(false);
  });
});
