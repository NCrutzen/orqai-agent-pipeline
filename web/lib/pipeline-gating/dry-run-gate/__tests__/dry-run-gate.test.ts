// Phase 114 Plan 02 (D-12 / RESEARCH Pitfall 5 + OQ-4) — stage_2_resolution gate key.
//
// Pins the fail-closed semantics of the new `stage_2_resolution` dry-run gate
// key that governs the sales Stage 2 resolution audit write
// (email_pipeline.resolution_audit). Sales is all-blocked by default, so the
// audit write needs its own fail-closed gate key rather than overloading
// stage_3_labeling.
//
// Convention (must match index.ts + the seed migration):
//   flag value TRUE  = BLOCKED (dry-run / no live side effect)
//   flag value FALSE = LIVE
//   flag MISSING     = treated as TRUE (blocked / fail-closed)

import { describe, it, expect } from "vitest";
import { isStageBlocked } from "../index";

describe("dry-run gate — stage_2_resolution key (fail-closed)", () => {
  it("returns true (BLOCKED) when stage_2_resolution=true", () => {
    expect(
      isStageBlocked({ dry_run_config: { stage_2_resolution: true } }, "stage_2_resolution"),
    ).toBe(true);
  });

  it("returns false (LIVE) when stage_2_resolution=false", () => {
    expect(
      isStageBlocked({ dry_run_config: { stage_2_resolution: false } }, "stage_2_resolution"),
    ).toBe(false);
  });

  it("returns true (BLOCKED) when the key is missing — fail-closed", () => {
    expect(isStageBlocked({ dry_run_config: {} }, "stage_2_resolution")).toBe(true);
  });

  it("returns true (BLOCKED) when the swarm is null — fail-closed", () => {
    expect(isStageBlocked(null, "stage_2_resolution")).toBe(true);
  });
});
