/**
 * Tests for clickup-status-map.ts (Plan 05-01 Task 1 — TDD RED phase)
 *
 * Tests the canonical ClickUp-status → notification-status mapping contract.
 * Plan 05-03 (outbound Inngest fn) and Plan 05-04 (admin view) import from
 * this module — this test file locks the contract before any consumer is built.
 */

import { describe, it, expect } from "vitest";
import {
  mapClickupStatus,
  CANONICAL_OUTBOUND_STATUSES,
  CLICKUP_STATUS_LOOKUP,
} from "../clickup-status-map";

// ---------------------------------------------------------------------------
// CANONICAL_OUTBOUND_STATUSES shape
// ---------------------------------------------------------------------------

describe("CANONICAL_OUTBOUND_STATUSES", () => {
  it("exports exactly 4 statuses in the prescribed order", () => {
    expect(CANONICAL_OUTBOUND_STATUSES).toEqual([
      "assigned",
      "in-progress",
      "resolved",
      "closed",
    ]);
  });

  it("is a readonly const (no mutation at runtime)", () => {
    // Check it's an array-like with length 4
    expect(CANONICAL_OUTBOUND_STATUSES).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// CLICKUP_STATUS_LOOKUP — exported const for Plan 05-04 admin filter
// ---------------------------------------------------------------------------

describe("CLICKUP_STATUS_LOOKUP", () => {
  it("exports an object mapping raw strings to canonical statuses or null", () => {
    expect(typeof CLICKUP_STATUS_LOOKUP).toBe("object");
  });

  it("contains at least one mapping for each canonical status", () => {
    const values = Object.values(CLICKUP_STATUS_LOOKUP);
    expect(values).toContain("assigned");
    expect(values).toContain("in-progress");
    expect(values).toContain("resolved");
    expect(values).toContain("closed");
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — exact canonical input strings
// ---------------------------------------------------------------------------

describe("mapClickupStatus — canonical status strings (exact match)", () => {
  it("maps 'assigned' → 'assigned'", () => {
    expect(mapClickupStatus("assigned")).toBe("assigned");
  });

  it("maps 'in-progress' → 'in-progress'", () => {
    expect(mapClickupStatus("in-progress")).toBe("in-progress");
  });

  it("maps 'resolved' → 'resolved'", () => {
    expect(mapClickupStatus("resolved")).toBe("resolved");
  });

  it("maps 'closed' → 'closed'", () => {
    expect(mapClickupStatus("closed")).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — non-notify-worthy ClickUp statuses → null
// ---------------------------------------------------------------------------

describe("mapClickupStatus — non-notify-worthy statuses → null", () => {
  it("maps 'to do' → null", () => {
    expect(mapClickupStatus("to do")).toBeNull();
  });

  it("maps 'open' → null", () => {
    expect(mapClickupStatus("open")).toBeNull();
  });

  it("maps 'backlog' → null", () => {
    expect(mapClickupStatus("backlog")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — common ClickUp variants for each canonical status
// ---------------------------------------------------------------------------

describe("mapClickupStatus — ClickUp-specific aliases", () => {
  it("maps 'in review queue' → 'assigned'", () => {
    expect(mapClickupStatus("in review queue")).toBe("assigned");
  });

  it("maps 'in progress' → 'in-progress'", () => {
    expect(mapClickupStatus("in progress")).toBe("in-progress");
  });

  it("maps 'doing' → 'in-progress'", () => {
    expect(mapClickupStatus("doing")).toBe("in-progress");
  });

  it("maps 'fixed' → 'resolved'", () => {
    expect(mapClickupStatus("fixed")).toBe("resolved");
  });

  it("maps 'done' → 'resolved'", () => {
    expect(mapClickupStatus("done")).toBe("resolved");
  });

  it("maps 'complete' → 'closed'", () => {
    expect(mapClickupStatus("complete")).toBe("closed");
  });

  it("maps 'completed' → 'closed'", () => {
    expect(mapClickupStatus("completed")).toBe("closed");
  });

  it("maps 'archived' → 'closed'", () => {
    expect(mapClickupStatus("archived")).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — case-insensitive matching
// ---------------------------------------------------------------------------

describe("mapClickupStatus — case-insensitive", () => {
  it("maps 'ASSIGNED' → 'assigned'", () => {
    expect(mapClickupStatus("ASSIGNED")).toBe("assigned");
  });

  it("maps 'In-Progress' → 'in-progress'", () => {
    expect(mapClickupStatus("In-Progress")).toBe("in-progress");
  });

  it("maps 'RESOLVED' → 'resolved'", () => {
    expect(mapClickupStatus("RESOLVED")).toBe("resolved");
  });

  it("maps 'CLOSED' → 'closed'", () => {
    expect(mapClickupStatus("CLOSED")).toBe("closed");
  });

  it("maps 'IN PROGRESS' → 'in-progress'", () => {
    expect(mapClickupStatus("IN PROGRESS")).toBe("in-progress");
  });

  it("maps 'Done' → 'resolved'", () => {
    expect(mapClickupStatus("Done")).toBe("resolved");
  });

  it("maps 'TO DO' → null", () => {
    expect(mapClickupStatus("TO DO")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — whitespace trimming
// ---------------------------------------------------------------------------

describe("mapClickupStatus — whitespace trimming", () => {
  it("trims leading whitespace: '  assigned' → 'assigned'", () => {
    expect(mapClickupStatus("  assigned")).toBe("assigned");
  });

  it("trims trailing whitespace: 'resolved  ' → 'resolved'", () => {
    expect(mapClickupStatus("resolved  ")).toBe("resolved");
  });

  it("trims both ends: '  closed  ' → 'closed'", () => {
    expect(mapClickupStatus("  closed  ")).toBe("closed");
  });

  it("trims + lowercases combined: '  IN PROGRESS  ' → 'in-progress'", () => {
    expect(mapClickupStatus("  IN PROGRESS  ")).toBe("in-progress");
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — null / undefined / empty → null
// ---------------------------------------------------------------------------

describe("mapClickupStatus — null / undefined / empty inputs", () => {
  it("returns null for null", () => {
    expect(mapClickupStatus(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(mapClickupStatus(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(mapClickupStatus("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(mapClickupStatus("   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapClickupStatus — unknown statuses → null
// ---------------------------------------------------------------------------

describe("mapClickupStatus — unknown statuses → null", () => {
  it("returns null for 'wont fix'", () => {
    expect(mapClickupStatus("wont fix")).toBeNull();
  });

  it("returns null for 'on hold'", () => {
    expect(mapClickupStatus("on hold")).toBeNull();
  });

  it("returns null for 'pending review'", () => {
    expect(mapClickupStatus("pending review")).toBeNull();
  });

  it("returns null for a random string 'xyz-status-123'", () => {
    expect(mapClickupStatus("xyz-status-123")).toBeNull();
  });
});
