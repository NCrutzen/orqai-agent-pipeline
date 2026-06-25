import { describe, it, expect } from "vitest";
import {
  isForwardSubject,
  pickForwardRecipient,
} from "../forward-observer";

describe("isForwardSubject", () => {
  it("recognises forward prefixes across locales", () => {
    expect(isForwardSubject("FW: Offerte")).toBe(true);
    expect(isForwardSubject("Fwd: keuring")).toBe(true);
    expect(isForwardSubject("Doorst: storing")).toBe(true);
    expect(isForwardSubject("  WG: Anfrage")).toBe(true);
  });
  it("rejects fresh composes and replies", () => {
    expect(isForwardSubject("Offerteaanvraag")).toBe(false);
    expect(isForwardSubject("RE: Offerte")).toBe(false);
    expect(isForwardSubject(null)).toBe(false);
    expect(isForwardSubject("")).toBe(false);
  });
});

describe("pickForwardRecipient", () => {
  it("takes the first To recipient, lowercased", () => {
    expect(
      pickForwardRecipient([
        { emailAddress: { address: "Verkoop@Smeba.NL" } },
        { emailAddress: { address: "x@y.nl" } },
      ]),
    ).toBe("verkoop@smeba.nl");
  });
  it("returns null when there is no recipient", () => {
    expect(pickForwardRecipient([])).toBeNull();
    expect(pickForwardRecipient(undefined)).toBeNull();
  });
});
