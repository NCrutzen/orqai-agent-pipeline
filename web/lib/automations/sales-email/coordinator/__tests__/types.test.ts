import { describe, it, expect } from "vitest";
import {
  ENTITY_RELATIONSHIP,
  entityRelationshipField,
} from "../../../debtor-email/coordinator/intent-output-shared";
import { salesIntentOutputSchema, SALES_INTENT_VERSION } from "../types";

function validSalesOutput(overrides: Record<string, unknown> = {}) {
  return {
    ranked: [{ intent: "other", confidence: "high", reasoning: "x" }],
    language: "nl",
    urgency: "normal",
    intent_version: SALES_INTENT_VERSION,
    intent_proposal: null,
    proposal_reason: null,
    entity_relationship: null,
    ...overrides,
  };
}

describe("entity_relationship shared axis (Task 1)", () => {
  it("ENTITY_RELATIONSHIP exports the expected tuple", () => {
    expect(ENTITY_RELATIONSHIP).toEqual([
      "resolved_entity",
      "unresolved_known_pattern",
      "unknown_third_party",
    ]);
  });

  it("entityRelationshipField accepts each enum value", () => {
    for (const v of ENTITY_RELATIONSHIP) {
      expect(entityRelationshipField.safeParse(v).success).toBe(true);
    }
  });

  it("entityRelationshipField accepts null", () => {
    expect(entityRelationshipField.safeParse(null).success).toBe(true);
  });

  it("entityRelationshipField rejects an unknown string", () => {
    expect(entityRelationshipField.safeParse("customer").success).toBe(false);
  });
});

describe("salesIntentOutputSchema (Task 2)", () => {
  it("accepts a valid object", () => {
    expect(salesIntentOutputSchema.safeParse(validSalesOutput()).success).toBe(
      true,
    );
  });

  it("rejects ranked with 0 entries", () => {
    expect(
      salesIntentOutputSchema.safeParse(validSalesOutput({ ranked: [] })).success,
    ).toBe(false);
  });

  it("rejects ranked with 6 entries", () => {
    const six = Array.from({ length: 6 }, () => ({
      intent: "other",
      confidence: "low",
      reasoning: "x",
    }));
    expect(
      salesIntentOutputSchema.safeParse(validSalesOutput({ ranked: six }))
        .success,
    ).toBe(false);
  });

  it("rejects reasoning longer than 300 chars", () => {
    const long = "a".repeat(301);
    expect(
      salesIntentOutputSchema.safeParse(
        validSalesOutput({
          ranked: [{ intent: "other", confidence: "high", reasoning: long }],
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts entity_relationship='resolved_entity'", () => {
    expect(
      salesIntentOutputSchema.safeParse(
        validSalesOutput({ entity_relationship: "resolved_entity" }),
      ).success,
    ).toBe(true);
  });

  it("rejects entity_relationship='customer'", () => {
    expect(
      salesIntentOutputSchema.safeParse(
        validSalesOutput({ entity_relationship: "customer" }),
      ).success,
    ).toBe(false);
  });

  it("rejects intent_proposal containing uppercase", () => {
    expect(
      salesIntentOutputSchema.safeParse(
        validSalesOutput({ intent_proposal: "Quote_Request" }),
      ).success,
    ).toBe(false);
  });

  it("accepts a snake_case intent_proposal", () => {
    expect(
      salesIntentOutputSchema.safeParse(
        validSalesOutput({
          intent_proposal: "quote_request",
          proposal_reason: "looks like a new intent",
        }),
      ).success,
    ).toBe(true);
  });
});
