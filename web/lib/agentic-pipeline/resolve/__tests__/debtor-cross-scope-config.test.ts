// Phase 122-04 Task 1 (TDD) — debtorP0Config ↔ live-seed cross_scope lockstep.
//
// LOCKED 2026-06-18: the in-code debtorP0Config constant (the D-07 kill-switch
// revert target) is kept in lockstep with the live debtor seed
// (20260618a_debtor_cross_scope_optin.sql) ONLY for the `cross_scope`
// sub-object — its precedence + auto_safe_kinds stay P0 by design and are NOT
// mirrored. This test scopes its assertion to `.cross_scope` exactly, never full
// deep-equality (mirrors the Phase 120-03 corroboration lockstep precedent).

import { describe, it, expect } from "vitest";
import { debtorP0Config } from "../../../automations/debtor-email/resolve-debtor";

// The cross_scope value added to public.swarms (debtor-email) by
// 20260618a_debtor_cross_scope_optin.sql. Keep this literal in sync with the
// migration; the lockstep is the whole point of this test.
const SEEDED_CROSS_SCOPE = {
  enabled: true,
  auto_resolve_kinds: ["invoice_no", "customer_no", "site_no"],
  allow_corroboration_auto: true,
};

describe("Phase 122-04: debtorP0Config cross_scope lockstep", () => {
  it("debtorP0Config.cross_scope deep-equals the live debtor seed value", () => {
    expect(debtorP0Config.cross_scope).toBeDefined();
    expect(debtorP0Config.cross_scope).toEqual(SEEDED_CROSS_SCOPE);
  });
});
