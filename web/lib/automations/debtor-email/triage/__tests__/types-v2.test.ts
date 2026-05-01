/**
 * Phase 65 Wave 0 scaffold — Plan 65-01 Task 2 fills in the four CORD-01
 * assertions. Plans 03/04/05 build on these.
 */
import { describe, it, expect } from "vitest";
import {
  INTENT_VERSION_V2,
  intentAgentOutputSchemaV2,
} from "../types";

describe("CORD-01 intentAgentOutputSchemaV2", () => {
  it("rejects v1 single-label shape against intentAgentOutputSchemaV2", () => {
    const v1Shape = {
      intent: "copy_document_request",
      sub_type: null,
      document_reference: null,
      urgency: "normal",
      language: "nl",
      confidence: "high",
      reasoning: "v1 single-label",
      intent_version: "2026-04-23.v1",
    };
    const result = intentAgentOutputSchemaV2.safeParse(v1Shape);
    expect(result.success).toBe(false);
  });

  it("accepts ranked array with 1..5 entries; rejects empty array; rejects 6 entries", () => {
    const entry = {
      intent: "copy_document_request",
      confidence: "high",
      document_reference: null,
      sub_type: null,
      reasoning: "r",
    } as const;
    const base = {
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V2,
    } as const;

    const one = intentAgentOutputSchemaV2.safeParse({ ...base, ranked: [entry] });
    expect(one.success).toBe(true);

    const five = intentAgentOutputSchemaV2.safeParse({
      ...base,
      ranked: [entry, entry, entry, entry, entry],
    });
    expect(five.success).toBe(true);

    const empty = intentAgentOutputSchemaV2.safeParse({ ...base, ranked: [] });
    expect(empty.success).toBe(false);

    const six = intentAgentOutputSchemaV2.safeParse({
      ...base,
      ranked: [entry, entry, entry, entry, entry, entry],
    });
    expect(six.success).toBe(false);
  });

  it("requires intent_version === '2026-05-01.v2' literal", () => {
    expect(INTENT_VERSION_V2).toBe("2026-05-01.v2");

    const wrongVersion = intentAgentOutputSchemaV2.safeParse({
      ranked: [
        {
          intent: "copy_document_request",
          confidence: "high",
          document_reference: null,
          sub_type: null,
          reasoning: "r",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_version: "2026-04-23.v1", // v1 literal — must mismatch v2
    });
    expect(wrongVersion.success).toBe(false);
  });

  it("requires non-null fields when nullable fields are populated correctly", () => {
    const ok = intentAgentOutputSchemaV2.safeParse({
      ranked: [
        {
          intent: "payment_dispute",
          confidence: "medium",
          document_reference: "INV-12345",
          sub_type: "invoice",
          reasoning: "operator referenced invoice INV-12345",
        },
      ],
      language: "fr",
      urgency: "high",
      intent_version: INTENT_VERSION_V2,
    });
    expect(ok.success).toBe(true);
  });
});
