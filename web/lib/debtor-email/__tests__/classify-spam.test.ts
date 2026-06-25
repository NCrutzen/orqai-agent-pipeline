// Stage-1 spam coverage (2026-06-24) — high-precision Pass-1 regex rules for
// the unsolicited cold-solicitation spam the operator saw slipping through to
// `unknown` (SEO/link-building pitches, car-buying spam, foreign trade-fair
// invites). All emit the shared `spam` category (action=categorize_archive).
// The negatives guard the costly failure mode: a false-positive archive.

import { describe, it, expect } from "vitest";
import { classify } from "../classify";

describe("Stage-1 spam — SEO / link-building solicitation", () => {
  it("'SEO...##' subject → spam_seo_solicitation", () => {
    const r = classify({
      subject: "SEO...##",
      from: "surendr.jaswaal@gmail.com",
      bodySnippet:
        "Hi, Hope you are doing well. We can get your website on the first page of Google with quality backlinks and guest posts.",
    });
    expect(r.category).toBe("spam");
    expect(r.matchedRule).toBe("spam_seo_solicitation");
  });

  it("'Top Ranking' SEO pitch → spam_seo_solicitation", () => {
    const r = classify({
      subject: "Top Ranking",
      from: "rohan.lal@outreach-co.in",
      bodySnippet:
        "Hello, Still interested in improving your google ranking and web traffic? Our off-page SEO and link building service guarantees results.",
    });
    expect(r.category).toBe("spam");
    expect(r.matchedRule).toBe("spam_seo_solicitation");
  });
});

describe("Stage-1 spam — car-buying solicitation", () => {
  it("'beste bod voor uw auto' → spam_car_offer", () => {
    const r = classify({
      subject: "De zomer komt eraan",
      from: "noreply@pimonline.nl",
      bodySnippet:
        "Laatste uitvraag: wilt u het beste bod voor uw auto? Gratis taxatie binnen 24 uur.",
    });
    expect(r.category).toBe("spam");
    expect(r.matchedRule).toBe("spam_car_offer");
  });
});

describe("Stage-1 spam — foreign trade-fair invites (needs fair + foreign ctx)", () => {
  it("Turkiye exhibition invite → spam_foreign_fair", () => {
    const r = classify({
      subject: "Turkiye's ONLY Exhibition",
      from: "info@marmarafuar.com.tr",
      bodySnippet:
        "Dear Sir, We invite you as an exhibitor to the biggest trade fair in Istanbul, Turkiye. Book your booth now for international visitors.",
    });
    expect(r.category).toBe("spam");
    expect(r.matchedRule).toBe("spam_foreign_fair");
  });

  it("legitimate NL expo mention (no foreign context) does NOT archive", () => {
    const r = classify({
      subject: "Wij staan op de Fire Safety expo in Utrecht",
      from: "marloes.dijkstra@brandpreventie.nl",
      bodySnippet:
        "Beste, kom langs bij onze stand op de beurs in de Jaarbeurs Utrecht voor een demonstratie van onze brandblussers.",
    });
    expect(r.category).not.toBe("spam");
  });
});

describe("Stage-1 spam — genuine business mail is never spam", () => {
  it("real offerte request stays unknown", () => {
    const r = classify({
      subject: "Offerteaanvraag brandblussers",
      from: "inkoop@bouwbedrijf-jansen.nl",
      bodySnippet:
        "Goedemiddag, graag een prijsopgave voor 12 poederblussers 6kg en de levertijd.",
    });
    expect(r.category).not.toBe("spam");
  });
});
