import { describe, it, expect } from "vitest";
import { stripFences } from "@/lib/automations/support-tickets/orq-util";

describe("stripFences", () => {
  it("returns bare JSON unchanged", () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });

  it("strips ```json ... ``` fence", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips bare ``` ... ``` fence (no json tag)", () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("trims surrounding whitespace", () => {
    expect(stripFences('   {"a":1}   ')).toBe('{"a":1}');
    expect(stripFences('  \n```json\n{"a":1}\n```  \n')).toBe('{"a":1}');
  });

  it("returns input unchanged if no closing fence (malformed)", () => {
    const input = '```json\n{"a":1}';
    // Trimmed but otherwise unchanged — caller's JSON.parse will catch malformed.
    expect(stripFences(input)).toBe(input.trim());
  });
});
