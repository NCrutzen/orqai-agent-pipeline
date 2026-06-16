// Phase 130 NOISE-04 — actionable-token carve-out boundary test.
//
// The cardinal safety constraint of the info-routing noise leak-fix: an email
// carrying an actionable signal (offerte / order / inkooporder / factuur /
// aanmaning / keuring / ontruiming / storing / werkbon) must NEVER be
// classified as noise — even from a noisy-looking sender (impexcompany.nl,
// securitas.nl). A leak-fix that eats routable mail is worse than the leak
// (CONTEXT: the "unknown" pool is MIXED — several high-frequency senders are
// genuinely routable).
//
// This test imports the production `hasActionableToken` predicate (it does NOT
// redefine it) so the carve-out used by the screen-worker is the exact code
// under test. The carve-out wins BEFORE any noise classification runs.

import { describe, it, expect } from "vitest";
import {
  hasActionableToken,
  ACTIONABLE_TOKEN_REGEX,
} from "@/lib/stage-1/actionable-tokens";

const ACTIONABLE_TOKENS = [
  "offerte",
  "order",
  "inkooporder",
  "factuur",
  "aanmaning",
  "keuring",
  "ontruiming",
  "storing",
  "werkbon",
] as const;

// Senders the noise classes target — used to prove the carve-out wins
// regardless of how noisy the sender looks.
const NOISY_SENDERS = [
  "info@impexcompany.nl",
  "noreply@securitas.nl",
  "noreply@lidl.nl",
];

describe("NOISE-04 actionable-token carve-out", () => {
  it("the carve-out regex is bounded/anchored (ReDoS-safe — no unbounded .*)", () => {
    const src = ACTIONABLE_TOKEN_REGEX.source;
    expect(src).not.toContain(".*");
    expect(src).not.toContain(".+");
    // Word-boundary anchored on both sides of the alternation.
    expect(src).toContain("\\b");
  });

  describe("every actionable token present → carve-out wins → NOT noise", () => {
    for (const token of ACTIONABLE_TOKENS) {
      it(`token "${token}" in the subject → hasActionableToken true`, () => {
        expect(hasActionableToken(`Betreft uw ${token} van vorige week`)).toBe(
          true,
        );
      });

      it(`token "${token}" in the body → hasActionableToken true`, () => {
        expect(
          hasActionableToken(
            `Goedemiddag,\n\nHierbij de gevraagde ${token}.\n\nMvg`,
          ),
        ).toBe(true);
      });
    }
  });

  it("carve-out wins even when the sender is a known noisy domain", () => {
    // The predicate is content-only; the sender is irrelevant to the carve-out.
    // We assert the content carries the signal regardless of who sent it.
    for (const sender of NOISY_SENDERS) {
      const subject = "Spoed: storing aan de installatie";
      // hasActionableToken does not take the sender — that is the point: a
      // noisy sender cannot strip the actionable signal out of the content.
      expect(hasActionableToken(subject)).toBe(true);
      expect(sender).toMatch(/@/); // sanity: these are real-looking senders
    }
  });

  describe("sender-noisy but NO actionable token → eligible for noise", () => {
    const NON_ACTIONABLE = [
      "Beste bod voor uw auto — reageer snel!", // auto_dealer_spam
      "Rank Higher: improve your website SEO today", // cold_sales_outreach
      "Onze nieuwsbrief van deze maand", // marketing_newsletter
      "Initiativbewerbung — Ihre Vision", // unsolicited_job_application
      "Help us improve: take our 2-minute survey", // survey_feedback_invite
    ];
    for (const text of NON_ACTIONABLE) {
      it(`"${text}" → hasActionableToken false (noise eligible)`, () => {
        expect(hasActionableToken(text)).toBe(false);
      });
    }
  });

  describe("word-boundary semantics are pinned", () => {
    it('\\bstoring matches "storingsmelding" (start-boundary; trailing chars are fine)', () => {
      expect(hasActionableToken("storingsmelding ontvangen")).toBe(true);
    });

    it('\\bstoring matches "storingsdienst" (start-boundary)', () => {
      expect(hasActionableToken("bel de storingsdienst")).toBe(true);
    });

    it('\\bfactuur\\b does NOT match "factuurloos" (compound-word exclusion is correct)', () => {
      // The carve-out protects standalone tokens, not compounds — the trailing
      // word-character defeats the right-hand \b.
      expect(hasActionableToken("een factuurloos abonnement")).toBe(false);
    });

    it("matches standalone 'factuur' (the token the carve-out protects)", () => {
      expect(hasActionableToken("uw factuur is bijgevoegd")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(hasActionableToken("OFFERTE bijgevoegd")).toBe(true);
    });
  });
});
