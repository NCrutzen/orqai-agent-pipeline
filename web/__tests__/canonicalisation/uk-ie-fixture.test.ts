// Phase 69 Wave 6 (CANO-04). Zero-prompt-edit onboarding proof for the UK
// register. The fixture supplies a synthetic `smeba-uk` brand_register inline
// — no production DB row is created. When ops later inserts the real row
// into swarms.entity_brand jsonb, loadBrandRegister picks it up with the
// same agent prompt: that's CANO-04.
//
// Mocked-only: no Orq.ai calls. Live invocation runs in live-smoke.test.ts
// under LIVE_SMOKE=1.

import { describe, it, expect } from "vitest";
import { fixture as smebaUk } from "./uk-ie-fixture/smeba-uk.fixture";

describe("canonicalisation — UK fixture: smeba-uk (CANO-04 zero-prompt-edit)", () => {
  it("brand_code is smeba-uk", () => {
    expect(smebaUk.brand_code).toBe("smeba-uk");
  });

  it("uses English register with GB dialect", () => {
    expect(smebaUk.expected_register_language).toBe("en");
    expect(smebaUk.brand_register?.register_dialect).toBe("en-GB");
  });

  it("uses 'Kind regards' signoff and 'you' formal_address", () => {
    expect(smebaUk.expected_signoff).toBe("Kind regards");
    expect(smebaUk.expected_formal_address).toBe("you");
    expect(smebaUk.brand_register?.signoff_phrase).toBe("Kind regards");
    expect(smebaUk.brand_register?.formal_address).toBe("you");
  });

  it("brand_register is supplied inline (no DB write needed)", () => {
    // CANO-04 acceptance: smeba-uk is NOT in production swarms.entity_brand
    // yet. It works today because the handler accepts brand_register inline.
    // When ops INSERTs the row, loadBrandRegister picks it up. Either path
    // requires zero agent prompt edits.
    expect(smebaUk.brand_register).toBeDefined();
    expect(smebaUk.brand_register?.code).toBe("smeba-uk");
    expect(smebaUk.brand_register?.display_name).toBe("Smeba UK");
  });

  it("targets the canonical debtor-email swarm (cross-region not cross-swarm)", () => {
    expect(smebaUk.swarm_type).toBe("debtor-email");
  });

  it("does NOT carry legacy Phase 68 input fields", () => {
    const opaque = smebaUk as unknown as Record<string, unknown>;
    expect(opaque.email_entity).toBeUndefined();
    expect(opaque.email_language).toBeUndefined();
  });
});
