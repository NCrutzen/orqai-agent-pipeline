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
import { isStageBlocked, isHandlerBlocked } from "../index";

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

// Phase 135 Plan 01 Task 2 (MODEL-02) — handler tri-state RED scaffold.
//
// RED ON PURPOSE until 135-02: these assertions read the POST-cutover
// `gating_config` key with a tri-state `stage_4_handlers` map
// (`off | dry | live`). Pre-cutover `isHandlerBlocked` reads `dry_run_config`
// (a boolean map), so against a `gating_config` fixture it returns the
// fail-closed default (true) for EVERY case — making the `"live" → not blocked`
// assertion fail now. 135-02 flips the internals to the tri-state contract:
//   "live"  → not blocked (false)
//   "dry"   → blocked (true)
//   "off"   → blocked (true)
//   missing → blocked (true, fail-closed)
// The boolean return contract (MIGRATE-02) is preserved; only the source key +
// the tri-state interpretation change.
describe("handler tri-state (MODEL-02)", () => {
  // Loose post-cutover swarm shape (gating_config jsonb, tri-state handlers).
  function swarm(handlers: Record<string, "off" | "dry" | "live">) {
    return {
      gating_config: { stage_4_handlers: handlers },
    } as unknown as Parameters<typeof isHandlerBlocked>[0];
  }

  it('"live" → NOT blocked (false)', () => {
    expect(isHandlerBlocked(swarm({ "invoice-copy": "live" }), "invoice-copy")).toBe(false);
  });

  it('"dry" → blocked (true)', () => {
    expect(isHandlerBlocked(swarm({ "invoice-copy": "dry" }), "invoice-copy")).toBe(true);
  });

  it('"off" → blocked (true)', () => {
    expect(isHandlerBlocked(swarm({ "invoice-copy": "off" }), "invoice-copy")).toBe(true);
  });

  it("missing handler entry → blocked (true, fail-closed)", () => {
    expect(isHandlerBlocked(swarm({ "label-resolver": "live" }), "invoice-copy")).toBe(true);
  });
});
