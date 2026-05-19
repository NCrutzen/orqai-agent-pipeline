import { describe, it, expect } from "vitest";
import { normalizeBody } from "../normalize-body";

describe("normalizeBody — Smeba forwarded signature wall", () => {
  it("strips ZWNJ wall + Q2Q banner + Internal envelope from a Chantal Koetsenruijter forward", () => {
    // Reproduces the input from Orq trace 01KRZCJWPDRMZ0MGHHWV9YZ0Q0
    // (verdict was injection_suspected; should drop to safe after normalize).
    const wall = "  ‌".repeat(82);
    const body =
      `Met vriendelijke groet, Chantal Koetsenruijter${wall}\n\n\n\n\n\n\n` +
      `Internal (crediteuren@smeba.nl)\n\n\n` +
      `  Safe  Spam  Phish  More...  FAQ  Protection by Q2Q\n\n\n\n\n\n\n\n` +
      `Met vriendelijke groet,\n\n\nChantal Koetsenruijter`;

    const r = normalizeBody(body);
    expect(r.changed).toBe(true);
    expect(r.normalized).not.toContain("‌");
    expect(r.normalized).not.toContain("Protection by Q2Q");
    expect(r.normalized).not.toContain("Internal (crediteuren@smeba.nl)");
    expect(r.normalized).toContain("Chantal Koetsenruijter");
    expect(r.removed).toContain("zero_width");
    expect(r.removed).toContain("q2q_banner");
    expect(r.removed).toContain("sender_envelope");
  });
});

describe("normalizeBody — Reavas external-sender banner", () => {
  it("strips CAUTION prefix + External envelope but keeps the real message", () => {
    const body =
      `CAUTION: External Sender Dag allen, objecten verkocht.\n\n\n` +
      `External (evewijk@reavas.nl)\n\n\n` +
      `  Safe  Spam  Phish  More...  FAQ  Protection by Q2Q\n\n\n` +
      `CAUTION: External Sender\n\n\n` +
      `Dag allen,\n\nDeze panden zijn verkocht.`;

    const r = normalizeBody(body);
    expect(r.changed).toBe(true);
    expect(r.normalized).not.toMatch(/CAUTION:\s*External Sender/);
    expect(r.normalized).not.toContain("External (evewijk@reavas.nl)");
    expect(r.normalized).not.toContain("Protection by Q2Q");
    expect(r.normalized).toContain("Deze panden zijn verkocht.");
    expect(r.removed).toContain("caution_prefix");
  });
});

describe("normalizeBody — First-Time Sender chrome", () => {
  it("strips 'First-Time Sender   Details' line", () => {
    const body =
      `Caution: External (vve@dpi.nl)\n` +
      `First-Time Sender   Details\n\n` +
      `Beste, we ontvangen offertes zonder context.`;

    const r = normalizeBody(body);
    expect(r.normalized).not.toContain("First-Time Sender");
    expect(r.normalized).not.toContain("Caution: External (vve@dpi.nl)");
    expect(r.normalized).toContain("Beste, we ontvangen offertes zonder context.");
    expect(r.removed).toContain("first_time_sender");
    expect(r.removed).toContain("sender_envelope");
  });
});

describe("normalizeBody — fallback when result would be empty", () => {
  it("returns original body and fallback_reason='normalized_to_empty' when nothing remains", () => {
    const body =
      `External (someone@example.com)\n` +
      `  Safe  Spam  Phish  More...  FAQ  Protection by Q2Q\n` +
      `CAUTION: External Sender`;

    const r = normalizeBody(body);
    expect(r.normalized).toBe(body);
    expect(r.changed).toBe(false);
    expect(r.delta_chars).toBe(0);
    expect(r.fallback_reason).toBe("normalized_to_empty");
    expect(r.removed).toBe("");
  });
});

describe("normalizeBody — empty input", () => {
  it("short-circuits on empty string", () => {
    const r = normalizeBody("");
    expect(r.normalized).toBe("");
    expect(r.changed).toBe(false);
    expect(r.delta_chars).toBe(0);
    expect(r.fallback_reason).toBeUndefined();
    expect(r.removed).toBe("");
  });
});

describe("normalizeBody — clean body passes through unchanged", () => {
  it("returns input unchanged when no chrome is present", () => {
    const body = "Beste,\n\nKunt u mij een kopie sturen van factuur 33052208?\n\nBedankt.";
    const r = normalizeBody(body);
    expect(r.normalized).toBe(body);
    expect(r.changed).toBe(false);
    expect(r.delta_chars).toBe(0);
    expect(r.removed).toBe("");
  });
});

describe("normalizeBody — deterministic (replay safety)", () => {
  it("twice on the same input returns deep-equal results", () => {
    const body =
      `‌‌‌\nInternal (a@b.nl)\n  Safe  Phish  Protection by Q2Q\n\n\n\n\nhi.`;
    const a = normalizeBody(body);
    const b = normalizeBody(body);
    expect(a).toEqual(b);
  });
});

describe("normalizeBody — excess blank lines collapse to 2", () => {
  it("collapses 5+ consecutive newlines but preserves paragraph breaks", () => {
    const body = "line1\n\n\n\n\n\nline2";
    const r = normalizeBody(body);
    expect(r.normalized).toBe("line1\n\nline2");
    expect(r.removed).toContain("excess_blank_lines");
  });
});
