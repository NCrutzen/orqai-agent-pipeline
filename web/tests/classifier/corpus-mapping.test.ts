// Phase 60-08 (D-04, D-22). Tests for the pure agreement-mapping module.
// Encodes the predicted-category × LLM-field truth table approved 2026-04-29
// in 60-08-PLAN.md <agreement_table>.

import { describe, it, expect } from "vitest";
import { isAgreement, AGREEMENT_MAP } from "@/lib/classifier/corpus-mapping";

describe("60-08 isAgreement — agreement-table truth", () => {
  it("auto_reply ↔ category='auto_reply' → true", () => {
    expect(isAgreement("auto_reply", "auto_reply", null)).toBe(true);
  });

  it("auto_reply ↔ intent='auto_reply' → true", () => {
    expect(isAgreement("auto_reply", null, "auto_reply")).toBe(true);
  });

  it("auto_reply ↔ category='payment' → false", () => {
    expect(isAgreement("auto_reply", "payment", null)).toBe(false);
  });

  it("ooo_temporary ↔ category='auto_reply' → true (coarse mapping)", () => {
    expect(isAgreement("ooo_temporary", "auto_reply", null)).toBe(true);
  });

  it("ooo_permanent ↔ intent='auto_reply' → true (coarse mapping)", () => {
    expect(isAgreement("ooo_permanent", null, "auto_reply")).toBe(true);
  });

  it("ooo_permanent ↔ category='payment' → false", () => {
    expect(isAgreement("ooo_permanent", "payment", null)).toBe(false);
  });

  it("payment_admittance ↔ category='payment' → true", () => {
    expect(isAgreement("payment_admittance", "payment", null)).toBe(true);
  });

  it("payment_admittance ↔ intent='payment_confirmation' → true", () => {
    expect(isAgreement("payment_admittance", null, "payment_confirmation")).toBe(true);
  });

  it("payment_admittance ↔ category='auto_reply' → false", () => {
    expect(isAgreement("payment_admittance", "auto_reply", null)).toBe(false);
  });

  it("unknown ↔ anything → false (always; catch-all not promotable)", () => {
    expect(isAgreement("unknown", "auto_reply", "auto_reply")).toBe(false);
    expect(isAgreement("unknown", "payment", "payment_confirmation")).toBe(false);
    expect(isAgreement("unknown", null, null)).toBe(false);
  });

  it("null/undefined LLM fields → false (no signal)", () => {
    expect(isAgreement("auto_reply", null, null)).toBe(false);
    expect(isAgreement("payment_admittance", undefined, undefined)).toBe(false);
    expect(isAgreement("ooo_temporary", null, undefined)).toBe(false);
  });

  it("both LLM fields present, only one matches → true", () => {
    // category mismatches, intent matches
    expect(isAgreement("auto_reply", "payment", "auto_reply")).toBe(true);
    // category matches, intent mismatches
    expect(isAgreement("payment_admittance", "payment", "auto_reply")).toBe(true);
  });

  it("AGREEMENT_MAP exposes all Category values", () => {
    // Phase 88.2-04: noise-category registry expanded since the original 5
    // values; assertion now checks the current key set rather than a hard-
    // coded 5. unknown's empty-arrays invariant is still verified below.
    expect(Object.keys(AGREEMENT_MAP).sort()).toEqual([
      "auto_reply",
      "coupa_invoice_approved_notification",
      "coupa_invoice_paid_notification",
      "frieslandcampina_portal_reject",
      "iss_ptp_autoreply",
      "m365_quarantine",
      "ooo_permanent",
      "ooo_temporary",
      "own_outbound_invoice_loopback",
      "payment_admittance",
      "sender_phishing_notice",
      "spam",
      "supplier_bank_change_notification",
      "unknown",
    ]);
    // unknown has empty arrays — never agrees
    expect(AGREEMENT_MAP.unknown.categories).toEqual([]);
    expect(AGREEMENT_MAP.unknown.intents).toEqual([]);
  });

  it("is pure: same inputs produce same output across multiple calls", () => {
    const a1 = isAgreement("auto_reply", "auto_reply", null);
    const a2 = isAgreement("auto_reply", "auto_reply", null);
    expect(a1).toBe(a2);
    expect(a1).toBe(true);
  });
});
