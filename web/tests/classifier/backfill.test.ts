// Phase 60-00 (D-04). Stub for the backfill Inngest one-shot. Real assertions
// arrive in 60-02 once the function is implemented.

import { describe, it } from "vitest";

describe("D-04: classifier-backfill seeds 6 hardcoded debtor-email rules", () => {
  it.todo(
    "inserts 6 rows with status='promoted' and notes for category-rollup rules",
  );
  it.todo(
    "computes ci_lo via wilsonCiLower (subject_paid_marker N=169 -> 0.978)",
  );
  it.todo(
    "uses ON CONFLICT(swarm_type,rule_key) DO UPDATE so re-running is idempotent",
  );
  it.todo("returns { seeded: 6 } from the step");
});
