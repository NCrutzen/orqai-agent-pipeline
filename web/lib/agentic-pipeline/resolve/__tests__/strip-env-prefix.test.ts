// Phase 91 Plan 01 Task 2 — D-01/D-02 composite→numeric strip.
//
// The substrate returns composite party ids `environment_id || id_org`
// (e.g. "BX593290"). The persisted customer_account_id is the NUMERIC id
// ("593290", D-01); the environment_id qualifier is carried SEPARATELY by the
// caller (D-02), never discarded. This helper performs only the presentation
// strip — it returns the numeric and leaves the caller to persist the
// environment_id alongside.

import { describe, it, expect } from "vitest";
import { stripEnvPrefix } from "../strip-env-prefix";

describe("stripEnvPrefix — D-01 numeric strip", () => {
  it("BX593290 → 593290", () => {
    expect(stripEnvPrefix("BX593290", "BX")).toBe("593290");
  });

  it("BX471214 → 471214", () => {
    expect(stripEnvPrefix("BX471214", "BX")).toBe("471214");
  });

  it("returns the partyId unchanged when it does not start with the prefix", () => {
    // Defensive: a non-BX-prefixed id (or already-numeric) is passed through.
    expect(stripEnvPrefix("593290", "BX")).toBe("593290");
    expect(stripEnvPrefix("IE593290", "BX")).toBe("IE593290");
  });

  it("D-02: the helper does NOT discard the environment_id qualifier", () => {
    // The strip only removes the prefix from the returned numeric; the caller
    // still holds the environment_id ("BX") to persist alongside. We assert the
    // helper is purely the numeric strip — given environmentId="BX", the numeric
    // is recoverable as prefix + result.
    const partyId = "BX593290";
    const environmentId = "BX";
    const numeric = stripEnvPrefix(partyId, environmentId);
    expect(numeric).toBe("593290");
    // The composite is reconstructable from the parts the caller carries.
    expect(environmentId + numeric).toBe(partyId);
  });
});
