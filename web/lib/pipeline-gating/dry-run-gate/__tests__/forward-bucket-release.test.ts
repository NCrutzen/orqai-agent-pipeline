// Phase 132 Plan 01 (Task 3, D-03 / D-04) — the per-bucket forward RELEASE gate.
//
// PINNED POLARITY — INVERSE to the held-flags. isForwardBucketReleased reads
// swarms.dry_run_config.stage_4_forward_buckets[bucket]:
//   value TRUE        = RELEASED (live forward fires)
//   value FALSE       = HELD (no live forward)
//   entry/map MISSING = HELD (fail-closed, D-04 default held/observe)
//
// This is the OPPOSITE of isStageBlocked / isStage3RoutingGated where TRUE =
// blocked/held. The polarity is pinned here so the second-mental-model trap
// (RESEARCH Pattern 2) is caught by a test, not a production forward.

import { describe, it, expect } from "vitest";
import { isForwardBucketReleased } from "../index";

describe("isForwardBucketReleased — per-bucket release gate (fail-closed, D-04)", () => {
  it("returns true (RELEASED) ONLY when stage_4_forward_buckets[bucket] === true", () => {
    expect(
      isForwardBucketReleased(
        { gating_config: { stage_4_forward_buckets: { storingen: true } } },
        "storingen",
      ),
    ).toBe(true);
  });

  it("returns false (HELD) when dry_run_config is missing entirely — fail-closed", () => {
    expect(isForwardBucketReleased({}, "storingen")).toBe(false);
    expect(isForwardBucketReleased(null, "storingen")).toBe(false);
    expect(isForwardBucketReleased(undefined, "storingen")).toBe(false);
  });

  it("returns false (HELD) when stage_4_forward_buckets map is absent — fail-closed", () => {
    expect(
      isForwardBucketReleased(
        { gating_config: { stage_3_routing: false } },
        "storingen",
      ),
    ).toBe(false);
  });

  it("isolates per bucket: {storingen:true} releases storingen but holds verkoop", () => {
    const swarm = {
      gating_config: { stage_4_forward_buckets: { storingen: true } },
    };
    expect(isForwardBucketReleased(swarm, "storingen")).toBe(true);
    expect(isForwardBucketReleased(swarm, "verkoop")).toBe(false);
  });

  it("returns false (HELD) when a bucket entry is explicitly false", () => {
    expect(
      isForwardBucketReleased(
        { gating_config: { stage_4_forward_buckets: { storingen: false } } },
        "storingen",
      ),
    ).toBe(false);
  });
});
