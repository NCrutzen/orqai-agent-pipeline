// Phase 69 Wave 6 (CANO-04). Cross-swarm reuse fixtures: the
// debtor-copy-document-body-agent must work for a non-debtor swarm
// (`sales-email-stub`) without ANY agent prompt edit. Three synthetic
// English-register fixtures supply the brand_register inline so no
// production DB row is created (per CONTEXT D-Discretion-5 + RESEARCH §6).
//
// Mocked-only: no Orq.ai calls. The matching live invocation runs in
// live-smoke.test.ts under LIVE_SMOKE=1.

import { describe, it, expect } from "vitest";
import { fixture as fx1 } from "./sales-fixtures/sales-en-1.fixture";
import { fixture as fx2 } from "./sales-fixtures/sales-en-2.fixture";
import { fixture as fx3 } from "./sales-fixtures/sales-en-3.fixture";

const FIXTURES = [fx1, fx2, fx3];

describe("canonicalisation — sales-email-stub fixtures (cross-swarm reuse)", () => {
  it("supplies exactly 3 sales fixtures", () => {
    expect(FIXTURES).toHaveLength(3);
  });

  describe.each(FIXTURES)("sales-fixture: $email_subject", (fx) => {
    it("targets the cross-swarm sales-email-stub swarm", () => {
      expect(fx.swarm_type).toBe("sales-email-stub");
    });

    it("uses English register with 'Kind regards' signoff and 'you'", () => {
      expect(fx.expected_register_language).toBe("en");
      expect(fx.expected_signoff).toBe("Kind regards");
      expect(fx.expected_formal_address).toBe("you");
    });

    it("supplies brand_register inline (no DB row created)", () => {
      expect(fx.brand_register).toBeDefined();
      expect(fx.brand_register?.code).toBe(fx.brand_code);
      expect(fx.brand_register?.register_language).toBe("en");
      expect(fx.brand_register?.signoff_phrase).toBe("Kind regards");
      expect(fx.brand_register?.formal_address).toBe("you");
    });

    it("does NOT carry legacy Phase 68 input fields", () => {
      const opaque = fx as unknown as Record<string, unknown>;
      expect(opaque.email_entity).toBeUndefined();
      expect(opaque.email_language).toBeUndefined();
    });
  });

  it("all sales fixtures share the same brand_code (acme-corp)", () => {
    const codes = new Set(FIXTURES.map((f) => f.brand_code));
    expect(codes.size).toBe(1);
    expect(codes.has("acme-corp")).toBe(true);
  });
});
