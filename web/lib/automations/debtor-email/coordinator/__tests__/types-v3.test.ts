/**
 * Phase 85 Wave 0 — RED tests for the V3 intent-agent schema.
 *
 * These tests import V3 symbols that DO NOT YET EXIST in `../types`. Until
 * Plan 02 (Wave 1) lands `INTENT_VERSION_V3`, `intentAgentOutputSchemaV3`,
 * and the `intentAgentOutputSchemaAny` discriminated union, this suite is
 * RED by design (TypeScript build will surface "is not exported" errors
 * — `// @ts-expect-error` annotations let the file compile so vitest can
 * report the assertion failures rather than choking at parse time).
 *
 * Behaviours asserted here (from 85-01-PLAN.md `<behavior>`):
 *   - `INTENT_VERSION_V3` literal === "2026-05-19.v3"
 *   - V3 schema accepts closed-list path (intent_proposal=null, proposal_reason=null)
 *   - V3 schema accepts open-set path (intent_proposal="wka_data_request", reason populated)
 *   - V3 schema rejects intent_proposal violating snake_case regex (3 cases)
 *   - V3 schema rejects intent_proposal length > 64
 *   - V3 schema rejects proposal_reason length > 280
 *   - V3 schema rejects V2-shape payload (missing intent_proposal/proposal_reason keys)
 *   - V2 schema STILL accepts a V2 row (D-07 back-compat)
 *   - intentAgentOutputSchemaAny discriminates on intent_version and routes V2/V3 correctly
 */

import { describe, it, expect } from "vitest";
import {
  INTENT_VERSION_V2,
  intentAgentOutputSchemaV2,
  // @ts-expect-error — V3 lands in Wave 1 (Plan 02). Until then this import resolves to undefined.
  INTENT_VERSION_V3,
  // @ts-expect-error — V3 lands in Wave 1 (Plan 02).
  intentAgentOutputSchemaV3,
  // @ts-expect-error — V3 lands in Wave 1 (Plan 02).
  intentAgentOutputSchemaAny,
} from "../types";
import {
  V2_FIXTURE,
  V3_FIXTURE_CLOSED,
  V3_FIXTURE_OPEN,
  V3_FIXTURE_BAD_SNAKE_CASE,
  V3_FIXTURE_BAD_HYPHEN,
  V3_FIXTURE_BAD_LEADING_DIGIT,
  V3_FIXTURE_PROPOSAL_TOO_LONG,
  V3_FIXTURE_REASON_TOO_LONG,
  V3_FIXTURE_MISSING_PROPOSAL_KEYS,
  INTENT_VERSION_V3_LITERAL,
} from "./fixtures/intent-v3";

describe("Phase 85 intentAgentOutputSchemaV3", () => {
  it("INTENT_VERSION_V3 literal equals '2026-05-19.v3' byte-for-byte", () => {
    // PATTERNS §types.ts literal-equality rule: must match Orq json_schema const.
    expect(INTENT_VERSION_V3).toBe("2026-05-19.v3");
    expect(INTENT_VERSION_V3).toBe(INTENT_VERSION_V3_LITERAL);
  });

  it("accepts V3 closed-list path (intent_proposal=null, proposal_reason=null)", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_CLOSED);
    expect(result.success).toBe(true);
  });

  it("accepts V3 open-set path (intent_proposal='wka_data_request', reason populated)", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_OPEN);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent_proposal).toBe("wka_data_request");
      expect(result.data.proposal_reason).not.toBeNull();
    }
  });

  it("rejects intent_proposal containing spaces / uppercase (snake_case regex)", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_BAD_SNAKE_CASE);
    expect(result.success).toBe(false);
  });

  it("rejects intent_proposal with hyphens (snake_case regex)", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_BAD_HYPHEN);
    expect(result.success).toBe(false);
  });

  it("rejects intent_proposal starting with a digit (snake_case regex)", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_BAD_LEADING_DIGIT);
    expect(result.success).toBe(false);
  });

  it("rejects intent_proposal length > 64", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_PROPOSAL_TOO_LONG);
    expect(result.success).toBe(false);
  });

  it("rejects proposal_reason length > 280", () => {
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_REASON_TOO_LONG);
    expect(result.success).toBe(false);
  });

  it("rejects V2-shape payload (missing intent_proposal/proposal_reason keys)", () => {
    // V3 schema should not accept a row that lacks the V3-only keys, even if
    // ranked/language/urgency/intent_version look right. (Plan 02's schema
    // shape: intent_proposal is `string|null` — null is allowed but the key
    // MUST be present.)
    const result = intentAgentOutputSchemaV3.safeParse(V3_FIXTURE_MISSING_PROPOSAL_KEYS);
    expect(result.success).toBe(false);
  });

  it("V2 schema STILL accepts a clean V2 row after V3 lands (D-07 back-compat)", () => {
    // This is copy-equivalent to types-v2.test.ts:80-96 — proves the V3
    // addition did not regress the V2 export.
    const result = intentAgentOutputSchemaV2.safeParse(V2_FIXTURE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent_version).toBe(INTENT_VERSION_V2);
    }
  });
});

describe("Phase 85 intentAgentOutputSchemaAny (discriminated union)", () => {
  it("routes a V2 payload through the V2 branch (intent_version literal preserved)", () => {
    const result = intentAgentOutputSchemaAny.safeParse(V2_FIXTURE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent_version).toBe(INTENT_VERSION_V2);
    }
  });

  it("routes a V3 closed-list payload through the V3 branch", () => {
    const result = intentAgentOutputSchemaAny.safeParse(V3_FIXTURE_CLOSED);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intent_version).toBe("2026-05-19.v3");
      // V3 branch — intent_proposal key must be present (even if null).
      expect("intent_proposal" in result.data).toBe(true);
    }
  });

  it("routes a V3 open-set payload through the V3 branch and preserves proposal fields", () => {
    const result = intentAgentOutputSchemaAny.safeParse(V3_FIXTURE_OPEN);
    expect(result.success).toBe(true);
    if (result.success && result.data.intent_version === "2026-05-19.v3") {
      // After discrimination, TS narrows to V3 — proposal fields are typed.
      expect(result.data.intent_proposal).toBe("wka_data_request");
    }
  });

  it("rejects a mismatched intent_version / payload (V2 literal + V3-shape body)", () => {
    // Discriminator key is intent_version; if it says V2 but the body has V3
    // extras, the V2 branch rejects unknown keys (zod strict) OR strips them
    // (zod default) — either way the resulting parsed shape MUST NOT carry
    // the V3 proposal fields when intent_version === V2.
    const mismatched = {
      ...V3_FIXTURE_OPEN,
      intent_version: INTENT_VERSION_V2,
    };
    const result = intentAgentOutputSchemaAny.safeParse(mismatched);
    if (result.success) {
      // V2 branch — must not carry V3 extras through the type.
      // @ts-expect-error — V2 type does not have intent_proposal; if it did, this is a regression.
      expect(result.data.intent_proposal).toBeUndefined();
    } else {
      // Equally acceptable: the union rejects the mismatch.
      expect(result.success).toBe(false);
    }
  });

  it("rejects a payload with unknown intent_version literal", () => {
    const unknown = { ...V3_FIXTURE_CLOSED, intent_version: "2099-01-01.v9" };
    const result = intentAgentOutputSchemaAny.safeParse(unknown);
    expect(result.success).toBe(false);
  });
});
