// Phase 999.7 Wave 0 (RED). Tests for strip-quoted-history helper.
// Helper module ships in Plan 02; RED state by design until then.
// REQ-STRIP-01..04 mapping per .planning/phases/999.7-.../999.7-RESEARCH.md.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  stripQuotedHistory,
  type StripResult,
} from "../strip-quoted-history";

const FIXTURES = path.join(__dirname, "fixtures");

function load(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

const outlookNl = load("outlook-nl-reply.txt");
const gmailNl = load("gmail-nl-reply.txt");
const mobile = load("mobile-client-reply.txt");
const cited = load("cited-quoting.txt");
const sigAfterQuote = load("signature-after-quote.txt");
const noQuote = load("no-quote-history.txt");
const longSample = load("12k-token-real-sample.txt");

describe("STRIP-01 Outlook NL reply: removes 'Van: ... <email>' header block", () => {
  it("retains the operator's reply preamble and signature, drops the Van: block", () => {
    const result: StripResult = stripQuotedHistory(outlookNl);
    expect(result.stripped).toContain("Bedankt voor uw bericht");
    expect(result.stripped).toContain("Met vriendelijke groet");
    expect(result.stripped).toContain("Operator Naam");
    expect(result.stripped).not.toContain("Van: KLANT <klant@voorbeeld.nl>");
    expect(result.stripped).not.toContain("Verzonden: woensdag 7 mei 2026");
    expect(result.changed).toBe(true);
  });
});

describe("STRIP-01 Gmail NL reply: removes 'Op ... schreef ...:' divider + > lines", () => {
  it("retains the reply preamble and removes Op-schreef block plus all '> ' lines", () => {
    const result: StripResult = stripQuotedHistory(gmailNl);
    expect(result.stripped).toContain("Bedankt, ontvangen.");
    expect(result.stripped).not.toContain(
      "Op woensdag 7 mei 2026 om 14:30 schreef KLANT",
    );
    expect(/^> /m.test(result.stripped)).toBe(false);
    expect(result.changed).toBe(true);
  });
});

describe("STRIP-01 mobile client: removes 'Van:' block on Outlook mobile reply", () => {
  it("retains 'Akkoord, hierbij goedgekeurd.' and drops the Van: header below it", () => {
    const result: StripResult = stripQuotedHistory(mobile);
    expect(result.stripped).toContain("Akkoord, hierbij goedgekeurd.");
    expect(result.stripped).not.toContain("Van: debiteuren@smeba.nl");
    expect(result.changed).toBe(true);
  });
});

describe("STRIP-01 cited '>' quoting: drops every line starting with '> '", () => {
  it("retains the operator's reply and removes all > lines", () => {
    const result: StripResult = stripQuotedHistory(cited);
    expect(result.stripped).toContain("Hierbij de gevraagde informatie.");
    const gtLines = result.stripped
      .split("\n")
      .filter((line) => line.startsWith("> "));
    expect(gtLines.length).toBe(0);
    expect(result.changed).toBe(true);
  });
});

describe("STRIP-01 signature-after-quote: visible reply preserved", () => {
  it("keeps a non-empty stripped body containing the operator's reply line", () => {
    const result: StripResult = stripQuotedHistory(sigAfterQuote);
    expect(result.stripped.trim().length).toBeGreaterThan(0);
    expect(result.stripped).toContain("De betaling is gedaan vanmorgen.");
  });
});

describe("STRIP-01 no-quote baseline: first-touch email passes through unchanged", () => {
  it("returns changed=false, stripped===input, delta_chars===0 for fixture 6", () => {
    const result: StripResult = stripQuotedHistory(noQuote);
    expect(result.changed).toBe(false);
    expect(result.stripped).toBe(noQuote);
    expect(result.delta_chars).toBe(0);
    expect(result.fallback_reason).toBeUndefined();
  });
});

describe("STRIP-03 deterministic: same input yields deep-equal output (replay safety)", () => {
  it("calling stripQuotedHistory twice on Outlook NL fixture returns deep-equal results", () => {
    const a = stripQuotedHistory(outlookNl);
    const b = stripQuotedHistory(outlookNl);
    expect(a).toEqual(b);
  });
});

describe("STRIP-04 empty input: short-circuits without invoking parser", () => {
  it("returns { stripped: '', changed: false, delta_chars: 0 } with no fallback_reason", () => {
    const result: StripResult = stripQuotedHistory("");
    expect(result.stripped).toBe("");
    expect(result.changed).toBe(false);
    expect(result.delta_chars).toBe(0);
    expect(result.fallback_reason).toBeUndefined();
  });
});

describe("STRIP-04 parser-returned-empty fallback: greedy match falls back to original body", () => {
  it("body that starts with 'On 1 Jan 2020, x@y wrote:' divider falls back to input", () => {
    const greedy = "On 1 Jan 2020, x@y wrote:\n> quoted body line";
    const result: StripResult = stripQuotedHistory(greedy);
    expect(result.stripped).toBe(greedy);
    expect(result.fallback_reason).toBe("parser_returned_empty");
    expect(result.changed).toBe(false);
    expect(result.delta_chars).toBe(0);
  });
});

describe("12k regression: long debtor thread shrinks by > 8000 characters", () => {
  it("strip reduces fixture 7 by more than 8000 chars and stripped body is non-empty", () => {
    const result: StripResult = stripQuotedHistory(longSample);
    expect(result.delta_chars).toBeLessThan(-8000);
    expect(result.stripped.trim().length).toBeGreaterThan(0);
    expect(result.changed).toBe(true);
  });
});
