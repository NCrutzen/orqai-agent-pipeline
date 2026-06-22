// Phase 122 (D-06) — numericConfidence FULL-mapping regression guard.
//
// WAVE 0 — partially RED. Pins the COMPLETE text→numeric mapping so the Plan 02
// widening (Confidence gains "suggestie") cannot silently displace an existing
// branch. The "suggestie" === 0.7 assertion is RED today (the helper does not
// handle "suggestie" yet — it falls through to the `return null` sentinel). The
// high/medium/low/none assertions are GREEN now and MUST STAY GREEN through the
// widening — that is the displacement guard: "medium" === 0.7 pins that suggestie
// reuses the SAME numeric slot as medium WITHOUT shifting medium off 0.7.
//
// Named/explicit assertions on every tier (not a loop) so a branch-displacement
// regression names exactly which tier broke.

import { describe, it, expect } from "vitest";
import { numericConfidence } from "@/lib/pipeline-events/types";

describe("Phase 122 D-06: numericConfidence full mapping (suggestie reuses the medium 0.7 slot)", () => {
  it("maps every tier explicitly; suggestie === 0.7 (RED until Plan 02 widens the helper)", () => {
    expect(numericConfidence("high")).toBe(0.9);
    expect(numericConfidence("medium")).toBe(0.7);
    // RED today — the helper has no "suggestie" branch yet (Plan 02 adds it).
    // The cast keeps the file type-checkable before the union widens; the runtime
    // assertion is the RED signal.
    expect(
      numericConfidence("suggestie" as Parameters<typeof numericConfidence>[0]),
    ).toBe(0.7);
    expect(numericConfidence("low")).toBe(0.4);
    expect(numericConfidence("none")).toBeNull();
  });
});
