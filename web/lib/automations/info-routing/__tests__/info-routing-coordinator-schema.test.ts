import { describe, expect, it } from "vitest";
import { DESTINATION_KEYS_BY_SWARM } from "../../../swarms/routing-destinations.generated";
import {
  INFO_ROUTING_BUCKET_KEYS,
  infoRoutingAgentOutputSchema,
  parseAgentOutputOrUnrouted,
  UNROUTED_OUTCOME,
} from "../coordinator-schema";

// Phase 131 Plan 02 Task 1 — closed-list Zod gate over the info-routing
// coordinator agent output. Off-list / empty / malformed → the unrouted outcome,
// NEVER a throw (ROUTE-03 acceptance). The bucket enum is single-sourced from the
// Plan-01 codegen file (no hand-written list).

describe("infoRoutingAgentOutputSchema — closed-list parse", () => {
  it("parses a valid agent output (bucket + brand + confidence + reasoning)", () => {
    const raw = {
      bucket: "inspecties",
      brand: "fire-control",
      confidence: "high",
      reasoning: "Inspectie-aanvraag voor brandblussers.",
    };
    const result = infoRoutingAgentOutputSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("allows brand=null (anyOf nullable)", () => {
    const raw = {
      bucket: "algemeen",
      brand: null,
      confidence: "medium",
      reasoning: "Algemene vraag zonder merk-signaal.",
    };
    const result = infoRoutingAgentOutputSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects an off-list bucket (e.g. debtor's 'debiteuren')", () => {
    const raw = {
      bucket: "debiteuren",
      brand: "smeba",
      confidence: "high",
      reasoning: "Off-list bucket not in DESTINATION_KEYS.",
    };
    const result = infoRoutingAgentOutputSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe("parseAgentOutputOrUnrouted — never throws, unrouted fallback", () => {
  it("returns the parsed value for a valid output", () => {
    const raw = {
      bucket: "storingen",
      brand: "berki",
      confidence: "high",
      reasoning: "Storingsmelding.",
    };
    const out = parseAgentOutputOrUnrouted(raw);
    expect(out.unrouted).toBe(false);
    if (!out.unrouted) {
      expect(out.value.bucket).toBe("storingen");
      expect(out.value.brand).toBe("berki");
    }
  });

  it("off-list bucket → unrouted outcome (no throw)", () => {
    const out = parseAgentOutputOrUnrouted({
      bucket: "debiteuren",
      brand: "smeba",
      confidence: "high",
      reasoning: "x",
    });
    expect(out).toBe(UNROUTED_OUTCOME);
    expect(out.unrouted).toBe(true);
  });

  it("null input → unrouted outcome (no throw)", () => {
    expect(() => parseAgentOutputOrUnrouted(null)).not.toThrow();
    expect(parseAgentOutputOrUnrouted(null).unrouted).toBe(true);
  });

  it("empty object → unrouted outcome (no throw)", () => {
    expect(() => parseAgentOutputOrUnrouted({})).not.toThrow();
    expect(parseAgentOutputOrUnrouted({}).unrouted).toBe(true);
  });

  it("missing required field → unrouted outcome (no throw)", () => {
    const out = parseAgentOutputOrUnrouted({
      bucket: "inspecties",
      brand: "fire-control",
      // confidence + reasoning missing
    });
    expect(out.unrouted).toBe(true);
  });

  it("malformed types → unrouted outcome (no throw)", () => {
    const out = parseAgentOutputOrUnrouted({
      bucket: 42,
      brand: ["smeba"],
      confidence: "very-high",
      reasoning: { nope: true },
    });
    expect(out.unrouted).toBe(true);
  });
});

describe("single-source enum assertion", () => {
  it("the bucket enum equals DESTINATION_KEYS_BY_SWARM['info-routing'] (codegen, not hand-written)", () => {
    expect(INFO_ROUTING_BUCKET_KEYS).toEqual(
      DESTINATION_KEYS_BY_SWARM["info-routing"],
    );
  });

  it("every DESTINATION_KEYS_BY_SWARM['info-routing'] value parses as a valid bucket", () => {
    for (const bucket of DESTINATION_KEYS_BY_SWARM["info-routing"]) {
      const result = infoRoutingAgentOutputSchema.safeParse({
        bucket,
        brand: null,
        confidence: "low",
        reasoning: "single-source coverage probe",
      });
      expect(result.success).toBe(true);
    }
  });
});
