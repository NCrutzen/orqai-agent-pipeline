// Phase 120-03 Task 1 (TDD) — debtorP0Config ↔ live-seed corroboration lockstep.
//
// W2 (LOCKED 2026-06-16): the in-code debtorP0Config constant (the D-07 kill-switch
// revert target) is kept in lockstep with the live debtor seed
// (20260616a_debtor_corroboration_optin.sql) ONLY for the `corroboration`
// sub-object — its precedence + auto_safe_kinds stay P0 by design and are NOT
// mirrored. This test scopes its assertion to `.corroboration` exactly, never full
// deep-equality.

import { describe, it, expect } from "vitest";
import { debtorP0Config } from "../../../automations/debtor-email/resolve-debtor";

// The corroboration value seeded into public.swarms (debtor-email) by
// 20260616a_debtor_corroboration_optin.sql. Keep this literal in sync with the
// migration; the lockstep is the whole point of this test.
const SEEDED_CORROBORATION = {
  min_signals: 2,
  boost: "high" as const,
  auto_safe_alone_kinds: ["customer_no", "site_no", "invoice_no"],
};

describe("Phase 120-03: debtorP0Config corroboration lockstep", () => {
  it("debtorP0Config.corroboration deep-equals the live debtor seed value", () => {
    expect(debtorP0Config.corroboration).toBeDefined();
    expect(debtorP0Config.corroboration).toEqual(SEEDED_CORROBORATION);
  });

  it("min_signals is at least 2 (the agreement floor — a lone signal cannot self-agree)", () => {
    expect(debtorP0Config.corroboration?.min_signals).toBeGreaterThanOrEqual(2);
  });

  it("lockstep is scoped to corroboration ONLY — precedence stays the P0 kill-switch order", () => {
    // W2: the constant is the D-07 revert target; its precedence is intentionally
    // P0 and is NOT mirrored from the live (possibly re-ordered) registry row.
    expect(debtorP0Config.precedence).toEqual([
      "thread_inheritance",
      "sender_match",
      "identifier_match",
    ]);
    expect(debtorP0Config.auto_safe_kinds).toEqual([]);
  });
});
