/**
 * Phase 83 Plan 06 — Task 1 RED.
 *
 * Pins the assembleInput contract:
 *  - D-04 wrapped XML structure (<inbound_message>, <quoted_thread>, <prior>).
 *  - D-08 truncation policy: preserve oldest non-tenant inbound + newest reply.
 *  - D-09 hard cap (8000 chars) with truncated flag + inputChars telemetry.
 *
 * Stage 3 input shape only — registry behaviour (swarm_intents) is untouched.
 */
import { describe, it, expect } from "vitest";
import { assembleInput } from "../assemble-input";

const TENANT_DOMAINS = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"];

describe("Phase 83-06 assembleInput", () => {
  it("Test 1: no priors — emits inbound_message + empty quoted_thread block", () => {
    const result = assembleInput({
      subject: "Vraag over factuur 12345",
      bodyFull: "Hallo, kunt u mij een kopie sturen?",
      priors: [],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    expect(result.text).toContain("<inbound_message>");
    expect(result.text).toContain("Vraag over factuur 12345");
    expect(result.text).toContain("Hallo, kunt u mij een kopie sturen?");
    expect(result.text).toContain("<quoted_thread>");
    expect(result.text).toContain("</quoted_thread>");
    expect(result.truncated).toBe(false);
  });

  it("Test 2: 2 priors — ordered by position ASC", () => {
    const result = assembleInput({
      subject: "Re: Vraag",
      bodyFull: "Antwoord van Elger",
      priors: [
        {
          position: 1,
          senderEmail: "elger@smeba-fire.be",
          subject: "Re: Vraag",
          receivedAt: "2026-05-12T09:00:00Z",
          bodyText: "Tussenliggende reply",
        },
        {
          position: 2,
          senderEmail: "ap@cbre.com",
          subject: "Vraag",
          receivedAt: "2026-05-11T09:00:00Z",
          bodyText: "Originele debiteur-vraag",
        },
      ],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    const pos1 = result.text.indexOf('position="1"');
    const pos2 = result.text.indexOf('position="2"');
    expect(pos1).toBeGreaterThan(-1);
    expect(pos2).toBeGreaterThan(-1);
    expect(pos1).toBeLessThan(pos2);
  });

  it("Test 3: below cap — truncated equals false", () => {
    const result = assembleInput({
      subject: "Korte vraag",
      bodyFull: "Korte body.",
      priors: [
        {
          position: 1,
          senderEmail: "ap@cbre.com",
          subject: "RE",
          receivedAt: "2026-05-11T09:00:00Z",
          bodyText: "Kort.",
        },
      ],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    expect(result.truncated).toBe(false);
  });

  it("Test 4: over cap with non-tenant inbound — keeps oldest non-tenant + inbound, drops middle", () => {
    const bigBody = "x".repeat(2000);
    const result = assembleInput({
      subject: "Re: Re: Re: factuur 33050611",
      bodyFull: bigBody,
      priors: [
        {
          position: 1,
          senderEmail: "elger@smeba-fire.be",
          subject: "Re: Re",
          receivedAt: "2026-05-13T09:00:00Z",
          bodyText: "f".repeat(1500),
        },
        {
          position: 2,
          senderEmail: "gwenda@smeba.nl",
          subject: "Re",
          receivedAt: "2026-05-12T09:00:00Z",
          bodyText: "g".repeat(1500),
        },
        {
          position: 3,
          senderEmail: "ap@cbre.com",
          subject: "factuur 33050611",
          receivedAt: "2026-05-10T09:00:00Z",
          bodyText: "ORIGINEEL DEBITEUR BERICHT " + "d".repeat(1500),
        },
        {
          position: 4,
          senderEmail: "ap@cbre.com",
          subject: "factuur 33050611",
          receivedAt: "2026-05-09T09:00:00Z",
          bodyText: "h".repeat(2000),
        },
      ],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("truncated: 3 messages dropped from middle of thread");
    expect(result.text).toContain("ORIGINEEL DEBITEUR BERICHT");
    expect(result.text).toContain(bigBody.slice(0, 500));
  });

  it("Test 5: over cap with no non-tenant prior — fallback newest-first marker", () => {
    const bigBody = "x".repeat(3000);
    const result = assembleInput({
      subject: "Lange interne ketting",
      bodyFull: bigBody,
      priors: [
        {
          position: 1,
          senderEmail: "elger@smeba-fire.be",
          subject: "Re",
          receivedAt: "2026-05-12T09:00:00Z",
          bodyText: "a".repeat(2500),
        },
        {
          position: 2,
          senderEmail: "gwenda@smeba.nl",
          subject: "FW",
          receivedAt: "2026-05-11T09:00:00Z",
          bodyText: "b".repeat(2500),
        },
        {
          position: 3,
          senderEmail: "ap@smeba.nl",
          subject: "FW",
          receivedAt: "2026-05-10T09:00:00Z",
          bodyText: "c".repeat(2500),
        },
      ],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("kept most recent");
  });

  it("Test 6: tenant detection — smeba-fire.be tenant, cbre non-tenant", () => {
    const bigBody = "x".repeat(2000);
    const result = assembleInput({
      subject: "S",
      bodyFull: bigBody,
      priors: [
        {
          position: 1,
          senderEmail: "elger@smeba-fire.be",
          subject: "Re",
          receivedAt: "2026-05-12T09:00:00Z",
          bodyText: "tenant-reply " + "t".repeat(2000),
        },
        {
          position: 2,
          senderEmail: "someone@cbre.com",
          subject: "Orig",
          receivedAt: "2026-05-10T09:00:00Z",
          bodyText: "NON_TENANT_ORIGIN " + "n".repeat(2000),
        },
      ],
      tenantDomains: ["smeba-fire.be"],
      capChars: 6000,
    });
    expect(result.truncated).toBe(true);
    // The cbre prior must be preserved (it's the non-tenant inbound).
    expect(result.text).toContain("NON_TENANT_ORIGIN");
    // The smeba-fire.be tenant prior is the one that should be dropped from middle.
    expect(result.text).not.toContain("tenant-reply t");
  });

  it("Test 7: inputChars equals final string length", () => {
    const result = assembleInput({
      subject: "Test",
      bodyFull: "Body",
      priors: [],
      tenantDomains: TENANT_DOMAINS,
      capChars: 8000,
    });
    expect(result.inputChars).toBe(result.text.length);
  });
});
