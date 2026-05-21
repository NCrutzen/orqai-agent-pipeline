import { describe, it, expect } from "vitest";
import { PIPELINE_STAGES, getStageByName } from "../stages";

describe("PIPELINE_STAGES", () => {
  // Phase 88.2-04: registry expanded to 8 stages — added "discussion" at
  // stepOrder 0 (silent stage handled by discussion-agent, not a fetched .md
  // instruction file). Length + name list + stepOrder sequence updated.
  it("defines exactly 8 pipeline stages", () => {
    expect(PIPELINE_STAGES).toHaveLength(8);
  });

  it("has stages in correct execution order", () => {
    const names = PIPELINE_STAGES.map((s) => s.name);
    expect(names).toEqual([
      "discussion",
      "architect",
      "tool-resolver",
      "researcher",
      "spec-generator",
      "orchestration-generator",
      "dataset-generator",
      "readme-generator",
    ]);
  });

  it("each stage has name, displayName, and stepOrder", () => {
    // Phase 88.2-04: `discussion` stage uses discussion-agent.ts directly
    // and intentionally has mdFile = "" (no fetched instruction file). Other
    // stages still require an mdFile.
    for (const stage of PIPELINE_STAGES) {
      expect(stage.name).toBeTruthy();
      expect(stage.displayName).toBeTruthy();
      expect(typeof stage.stepOrder).toBe("number");
      if (stage.name !== "discussion") {
        expect(stage.mdFile).toBeTruthy();
      }
    }
  });

  it("stepOrder values are sequential starting from 0", () => {
    const orders = PIPELINE_STAGES.map((s) => s.stepOrder);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("getStageByName", () => {
  it("returns the correct stage for a valid name", () => {
    const stage = getStageByName("architect");
    expect(stage).toBeDefined();
    expect(stage!.name).toBe("architect");
    expect(stage!.displayName).toBe("Designing agent swarm architecture");
  });

  it("returns undefined for an unknown stage name", () => {
    const stage = getStageByName("nonexistent");
    expect(stage).toBeUndefined();
  });
});
