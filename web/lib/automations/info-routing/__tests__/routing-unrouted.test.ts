// Phase 131 Plan 03 Task 1 (ROUTE-04 / ROUTE-06) — buildRoutingVerdict unit
// tests. The verdict builder is a pure, IO-free function: it takes the parsed
// agent output (or the unrouted marker), the active routing_destinations rows,
// and the configured unrouted threshold, and returns the RESEARCH §Discretion 2
// 6-field verdict.
//
// Covered:
//   - high-confidence (bucket×brand) resolves to a mailbox → routable verdict
//   - confidence below the medium floor → unrouted (bucket='unrouted', mailbox null)
//   - a valid bucket×brand the agent picked but with NO active registry row →
//     unrouted (no-match path)
//   - parseAgentOutputOrUnrouted returning {unrouted:true} → unrouted verdict,
//     never throws
//   - cross-brand: agent picks inspecties/fire-control at info@smeba →
//     resolves the fire-control mailbox (not smeba)
//   - dedup defaults to {status:'routable', matched_layer:null}; the optional
//     dedup arg overrides it (Plan 04 wiring seam — no signature break)

import { describe, it, expect } from "vitest";
import { buildRoutingVerdict } from "../verdict";
import type { InfoRoutingAgentOutput } from "../coordinator-schema";
import { UNROUTED_OUTCOME } from "../coordinator-schema";
import type { RoutingDestinationRow } from "../../../swarms/types";

const THRESHOLD = 0.6; // require >= medium (low/medium/high → 0.33/0.66/1.0)

const destinations: RoutingDestinationRow[] = [
  {
    destination_key: "inspecties",
    brand: "smeba",
    target_mailbox: "planning@smeba.nl",
    outlook_category: "Inspecties",
    active: true,
  },
  {
    destination_key: "inspecties",
    brand: "fire-control",
    target_mailbox: "planning@fire-control.nl",
    outlook_category: "Inspecties",
    active: true,
  },
  {
    destination_key: "order_entry",
    brand: "smeba",
    target_mailbox: "order@smeba.nl",
    outlook_category: "Order-entry",
    active: true,
  },
  {
    destination_key: "unrouted",
    brand: "smeba",
    target_mailbox: null,
    outlook_category: null,
    active: true,
  },
];

function ok(value: InfoRoutingAgentOutput): { unrouted: false; value: InfoRoutingAgentOutput } {
  return { unrouted: false, value };
}

describe("buildRoutingVerdict — ROUTE-04 / ROUTE-06", () => {
  it("high-confidence (bucket×brand) that resolves → routable verdict with all 6 fields", () => {
    const v = buildRoutingVerdict(
      ok({ bucket: "order_entry", brand: "smeba", confidence: "high", reasoning: "r" }),
      destinations,
      THRESHOLD,
    );
    expect(v.bucket).toBe("order_entry");
    expect(v.brand).toBe("smeba");
    expect(v.target_mailbox).toBe("order@smeba.nl");
    expect(v.confidence).toBe("high");
    expect(v.dedup).toEqual({ status: "routable", matched_layer: null });
    expect(v.unrouted).toBe(false);
    expect(v.routing_version).toBeTruthy();
  });

  it("confidence below the medium floor (low) → unrouted, bucket='unrouted', target_mailbox null", () => {
    const v = buildRoutingVerdict(
      ok({ bucket: "order_entry", brand: "smeba", confidence: "low", reasoning: "r" }),
      destinations,
      THRESHOLD,
    );
    expect(v.unrouted).toBe(true);
    expect(v.bucket).toBe("unrouted");
    expect(v.brand).toBeNull();
    expect(v.target_mailbox).toBeNull();
  });

  it("valid bucket×brand the agent picked but with NO active registry row → unrouted (no-match path)", () => {
    const v = buildRoutingVerdict(
      // berki has no seeded inspecties row → no match
      ok({ bucket: "inspecties", brand: "berki", confidence: "high", reasoning: "r" }),
      destinations,
      THRESHOLD,
    );
    expect(v.unrouted).toBe(true);
    expect(v.bucket).toBe("unrouted");
    expect(v.target_mailbox).toBeNull();
  });

  it("parseAgentOutputOrUnrouted → {unrouted:true} (invalid/empty agent output) → unrouted verdict, never throws", () => {
    expect(() =>
      buildRoutingVerdict(UNROUTED_OUTCOME, destinations, THRESHOLD),
    ).not.toThrow();
    const v = buildRoutingVerdict(UNROUTED_OUTCOME, destinations, THRESHOLD);
    expect(v.unrouted).toBe(true);
    expect(v.bucket).toBe("unrouted");
    expect(v.brand).toBeNull();
    expect(v.target_mailbox).toBeNull();
    expect(v.dedup).toEqual({ status: "routable", matched_layer: null });
  });

  it("cross-brand: inspecties/fire-control at info@smeba resolves the fire-control mailbox (not smeba)", () => {
    const v = buildRoutingVerdict(
      ok({ bucket: "inspecties", brand: "fire-control", confidence: "high", reasoning: "r" }),
      destinations,
      THRESHOLD,
    );
    expect(v.unrouted).toBe(false);
    expect(v.bucket).toBe("inspecties");
    expect(v.brand).toBe("fire-control");
    expect(v.target_mailbox).toBe("planning@fire-control.nl");
  });

  it("medium confidence is at/above the floor → routable", () => {
    const v = buildRoutingVerdict(
      ok({ bucket: "order_entry", brand: "smeba", confidence: "medium", reasoning: "r" }),
      destinations,
      THRESHOLD,
    );
    expect(v.unrouted).toBe(false);
    expect(v.target_mailbox).toBe("order@smeba.nl");
  });

  it("accepts an optional dedup arg (Plan 04 wiring seam — no signature break)", () => {
    const v = buildRoutingVerdict(
      ok({ bucket: "order_entry", brand: "smeba", confidence: "high", reasoning: "r" }),
      destinations,
      THRESHOLD,
      { status: "already_addressed", matched_layer: "to_cc" },
    );
    expect(v.dedup).toEqual({ status: "already_addressed", matched_layer: "to_cc" });
    // dedup status does NOT force unrouted — Plan 132 honors do-not-forward; the
    // verdict still carries the resolved bucket/mailbox.
    expect(v.unrouted).toBe(false);
    expect(v.target_mailbox).toBe("order@smeba.nl");
  });
});
