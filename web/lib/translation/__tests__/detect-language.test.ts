// Plan 03-16 (UAT r3-5) — detectLanguage heuristic tests.
// Dependency-free stopword + diacritic detection; null when undecided.

import { describe, it, expect } from "vitest";

import { detectLanguage, translate } from "../translate";

describe("detectLanguage (Plan 03-16)", () => {
  it("detects Dutch from clear stopwords", () => {
    const text =
      "Beste klant, dit is een bericht over de openstaande factuur en wij hebben het niet ontvangen.";
    expect(detectLanguage(text)).toBe("nl");
  });

  it("detects French from clear stopwords", () => {
    const text =
      "Bonjour, je vous écris pour la facture qui n'est pas encore payée et nous attendons une réponse.";
    expect(detectLanguage(text)).toBe("fr");
  });

  it("detects German from clear stopwords", () => {
    const text =
      "Sehr geehrte Damen und Herren, die Rechnung ist nicht bezahlt und wir warten auf eine Antwort für den Betrag.";
    expect(detectLanguage(text)).toBe("de");
  });

  it("detects English from clear stopwords", () => {
    const text =
      "Hello, this is a message about the outstanding invoice and we have not received the payment yet.";
    expect(detectLanguage(text)).toBe("en");
  });

  it("returns null for empty text", () => {
    expect(detectLanguage("")).toBeNull();
  });

  it("returns null for too-short text", () => {
    expect(detectLanguage("ok")).toBeNull();
  });

  it("returns null for ambiguous text with no decisive stopwords", () => {
    // No language-distinguishing stopwords → no clear winner.
    expect(detectLanguage("Factuur 12345 EUR 9000 ref ABC987 xyz qrs")).toBeNull();
  });

  it("translate() is unchanged — still fails closed as not_configured", async () => {
    const r = await translate({ text: "x", target_lang: "en", scope: "message" });
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });
});
