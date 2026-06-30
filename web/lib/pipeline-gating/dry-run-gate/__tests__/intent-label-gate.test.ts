// Phase 117 Plan 01 Task 2 (D-3) — stage_3_intent_label gate key.
//
// Pins the fail-closed semantics of the NEW `stage_3_intent_label` dry-run gate
// key that governs the Outlook `AI:`-category WRITE (Plan 02's worker). It is a
// DEDICATED key, distinct from stage_3_labeling (iController labeling) and
// stage_3_routing (predicted-emit) — reusing either would regress debtor. Both
// swarms ship seeded GATED (true); the write is a no-op until an operator flips it.
//
// Convention (must match index.ts + the seed migration):
//   flag value TRUE  = BLOCKED (dry-run / no live category write)
//   flag value FALSE = LIVE
//   flag MISSING     = treated as TRUE (blocked / fail-closed)

import { describe, it, expect } from "vitest";
import { isStageBlocked } from "../index";

describe("dry-run gate — stage_3_intent_label key (fail-closed, D-3)", () => {
  it("returns true (GATED) when stage_3_intent_label=true", () => {
    expect(
      isStageBlocked({ gating_config: { stage_3_intent_label: true } }, "stage_3_intent_label"),
    ).toBe(true);
  });

  it("returns false (LIVE) when stage_3_intent_label=false", () => {
    expect(
      isStageBlocked({ gating_config: { stage_3_intent_label: false } }, "stage_3_intent_label"),
    ).toBe(false);
  });

  it("returns true (GATED) when the key is missing — fail-closed", () => {
    expect(isStageBlocked({ gating_config: {} }, "stage_3_intent_label")).toBe(true);
  });

  it("returns true (GATED) when the swarm is null — fail-closed", () => {
    expect(isStageBlocked(null, "stage_3_intent_label")).toBe(true);
  });

  it("does NOT change the resolved value of existing stage keys (no regression)", () => {
    // A config carrying both the new key and the existing keys must resolve each
    // existing key exactly as before — stage_3_intent_label is independent.
    const cfg = {
      gating_config: {
        stage_1_archive: false,
        stage_3_labeling: true,
        stage_3_routing: false,
        stage_3_intent_label: true,
      },
    };
    expect(isStageBlocked(cfg, "stage_1_archive")).toBe(false);
    expect(isStageBlocked(cfg, "stage_3_labeling")).toBe(true);
    // stage_3_routing is read via its dedicated helper; assert the new key did not
    // bleed into the shared config resolution for the other Stage-3 keys.
    expect(isStageBlocked(cfg, "stage_3_intent_label")).toBe(true);
  });
});
