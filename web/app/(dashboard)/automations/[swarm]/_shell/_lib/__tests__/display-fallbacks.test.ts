// Phase 82.3 Plan 10 — RED tests for display-layer fallbacks.
import { describe, expect, it } from "vitest";

import { displaySender, displaySubject } from "../display-fallbacks";

describe("displaySender", () => {
  it("returns the trimmed from_name when it is a real name", () => {
    expect(displaySender("Alice", "a@b.com")).toBe("Alice");
  });

  it("falls through to from_email when from_name is the 'Planning' sentinel", () => {
    expect(displaySender("Planning", "real@b.com")).toBe("real@b.com");
  });

  it("returns '(unknown sender)' when from_name is 'Planning' and from_email is null", () => {
    expect(displaySender("Planning", null)).toBe("(unknown sender)");
  });

  it("returns from_email when from_name is null", () => {
    expect(displaySender(null, "fallback@b.com")).toBe("fallback@b.com");
  });

  it("returns '(unknown sender)' when both are blank whitespace", () => {
    expect(displaySender("  ", "  ")).toBe("(unknown sender)");
  });

  it("returns '(unknown sender)' when both are null", () => {
    expect(displaySender(null, null)).toBe("(unknown sender)");
  });

  it("returns '(unknown sender)' when both are undefined", () => {
    expect(displaySender(undefined, undefined)).toBe("(unknown sender)");
  });
});

describe("displaySubject", () => {
  it("returns the subject when non-empty", () => {
    expect(displaySubject("Hello")).toBe("Hello");
  });

  it("returns '(no subject)' when empty string", () => {
    expect(displaySubject("")).toBe("(no subject)");
  });

  it("returns '(no subject)' when whitespace-only", () => {
    expect(displaySubject("   ")).toBe("(no subject)");
  });

  it("returns '(no subject)' when null", () => {
    expect(displaySubject(null)).toBe("(no subject)");
  });

  it("returns '(no subject)' when undefined", () => {
    expect(displaySubject(undefined)).toBe("(no subject)");
  });
});
