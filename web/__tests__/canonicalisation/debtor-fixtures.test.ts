// Phase 69 Wave 6 (CANO-01). Per-brand debtor fixture inventory + shape
// validation. Mocked-only: no Orq.ai calls. Live integration is exercised
// by live-smoke.test.ts under LIVE_SMOKE=1.
//
// What this suite proves:
//   - Each of the 5 production debtor brands (smeba, smeba-fire, sicli-noord,
//     sicli-sud, berki) has a well-formed fixture matching the Phase 69
//     `Fixture` contract.
//   - Per-brand register_language + signoff_phrase + formal_address values
//     line up with the seed migration (20260505a_entity_brand_expansion.sql)
//     so that live-smoke.test.ts (which consumes the same fixtures) asserts
//     the right phrases against real Orq output.
//
// Full handler-level integration (event payload → handler → invokeOrqAgent
// with the canonical input shape) is verified by
// classifier-invoice-copy-handler-isolation.test.ts (Plan 04). This suite
// is intentionally narrow: fixture data correctness only.

import { describe, it, expect } from "vitest";
import { fixture as smebaFx } from "./debtor-fixtures/smeba.fixture";
import { fixture as smebaFireFx } from "./debtor-fixtures/smeba-fire.fixture";
import { fixture as sicliNoordFx } from "./debtor-fixtures/sicli-noord.fixture";
import { fixture as sicliSudFx } from "./debtor-fixtures/sicli-sud.fixture";
import { fixture as berkiFx } from "./debtor-fixtures/berki.fixture";
import type { Fixture } from "./shared/harness";

const FIXTURES: Fixture[] = [
  smebaFx,
  smebaFireFx,
  sicliNoordFx,
  sicliSudFx,
  berkiFx,
];

describe("canonicalisation — debtor-brand fixtures", () => {
  it("covers all 5 production debtor brands exactly once", () => {
    const codes = FIXTURES.map((f) => f.brand_code).sort();
    expect(codes).toEqual(
      ["berki", "sicli-noord", "sicli-sud", "smeba", "smeba-fire"].sort(),
    );
  });

  describe.each(FIXTURES)("debtor-fixture: $brand_code", (fx) => {
    it("brand_code matches the production seed", () => {
      expect(fx.brand_code).toMatch(
        /^(smeba|smeba-fire|sicli-noord|sicli-sud|berki)$/,
      );
    });

    it("expected_register_language is nl or fr (Benelux brands)", () => {
      expect(["nl", "fr"]).toContain(fx.expected_register_language);
    });

    it("expected_signoff is non-empty and language-appropriate", () => {
      expect(fx.expected_signoff.length).toBeGreaterThan(0);
      if (fx.expected_register_language === "nl") {
        expect(fx.expected_signoff).toBe("Met vriendelijke groet");
      }
      if (fx.expected_register_language === "fr") {
        expect(fx.expected_signoff).toBe("Cordialement");
      }
    });

    it("expected_formal_address matches register_language", () => {
      if (fx.expected_register_language === "nl") {
        expect(fx.expected_formal_address).toBe("u");
      }
      if (fx.expected_register_language === "fr") {
        expect(fx.expected_formal_address).toBe("vous");
      }
    });

    it("email payload fields are populated", () => {
      expect(fx.email_subject.length).toBeGreaterThan(0);
      expect(fx.email_body_text.length).toBeGreaterThan(0);
      expect(fx.email_sender_email).toMatch(/@/);
      expect(fx.email_mailbox).toMatch(/@/);
    });

    it("does NOT carry legacy Phase 68 input fields", () => {
      const opaque = fx as unknown as Record<string, unknown>;
      expect(opaque.email_entity).toBeUndefined();
      expect(opaque.email_language).toBeUndefined();
    });
  });
});
