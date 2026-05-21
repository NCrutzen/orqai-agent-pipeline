// Phase 86 Plan 02 Task 1 — RED tests for normalizeLabel().
//
// Behaviour contract (see 86-02-PLAN.md <task type="auto" tdd="true"> Task 1):
//   - lowercase
//   - strip non-[a-z0-9_]
//   - collapse multi-underscore
//   - trim leading/trailing underscore
//   - idempotent: normalizeLabel(normalizeLabel(x)) === normalizeLabel(x)

import { describe, it, expect } from "vitest";

import { normalizeLabel } from "../normalize";

describe("normalizeLabel — snake_case canonical form", () => {
  it("lowercases + replaces whitespace with underscore", () => {
    expect(normalizeLabel("WKA Data Request")).toBe("wka_data_request");
  });

  it("replaces hyphens with underscore", () => {
    expect(normalizeLabel("wka-data-request")).toBe("wka_data_request");
  });

  it("trims surrounding whitespace (replaced + collapsed)", () => {
    expect(normalizeLabel("  wka  ")).toBe("wka");
  });

  it("collapses runs of underscores and trims leading/trailing", () => {
    expect(normalizeLabel("_a__b_")).toBe("a_b");
  });

  it("replaces non-alphanumeric punctuation with underscore", () => {
    expect(normalizeLabel("Foo.Bar/Baz")).toBe("foo_bar_baz");
  });
});

describe("normalizeLabel — idempotency", () => {
  const fixtures = [
    "WKA Data Request",
    "wka-data-request",
    "  wka  ",
    "_a__b_",
    "Foo.Bar/Baz",
    "",
    "already_clean",
    "coupa_po_notification",
  ];

  for (const f of fixtures) {
    it(`normalizeLabel(normalizeLabel(${JSON.stringify(f)})) === normalizeLabel(${JSON.stringify(f)})`, () => {
      const once = normalizeLabel(f);
      const twice = normalizeLabel(once);
      expect(twice).toBe(once);
    });
  }
});

describe("normalizeLabel — edge cases", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeLabel("")).toBe("");
  });

  it("returns empty string for pure-punctuation input", () => {
    expect(normalizeLabel("---")).toBe("");
  });

  it("preserves digits", () => {
    expect(normalizeLabel("Invoice 33050836")).toBe("invoice_33050836");
  });
});
