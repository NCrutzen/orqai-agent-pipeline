/**
 * Phase 113 Plan 03 Task 1 — side-channel-isolation guard for the sales-email
 * Stage 3 retro-classify function (source-grep, mirroring the debtor analog).
 *
 * The retro path writes ONLY stage_3_retro_runs and must NEVER touch live
 * pipeline state. This test source-greps the function file:
 *   - forbidden write targets (automation_runs / agent_runs / pipeline_events /
 *     coordinator_runs) must NOT appear as `.from("<table>")` write targets;
 *   - the ONLY write target is stage_3_retro_runs;
 *   - it calls invokeSalesIntentAgent directly (cache bypass), NOT the live
 *     coordinator;
 *   - run_id is resolved INSIDE a step.run (replay-safe) and crypto.randomUUID
 *     is not called at module/handler top level outside a step;
 *   - inngest.send is not destructured and is never called (no downstream
 *     events).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "../sales-email-stage-3-retro-classify.ts"),
  "utf8",
);

describe("Phase 113 sales-stage-3-retro side-channel isolation", () => {
  it("forbids live-pipeline write targets", () => {
    expect(src).not.toMatch(/from\(["']automation_runs["']\)/);
    expect(src).not.toMatch(/from\(["']agent_runs["']\)/);
    expect(src).not.toMatch(/from\(["']pipeline_events["']\)/);
    expect(src).not.toMatch(/from\(["']coordinator_runs["']\)/);
  });

  it("writes ONLY stage_3_retro_runs", () => {
    expect(src).toMatch(/from\(["']stage_3_retro_runs["']\)/);
  });

  it("calls invokeSalesIntentAgent directly (cache bypass, not the coordinator)", () => {
    expect(src).toMatch(/invokeSalesIntentAgent/);
    // No import from the live coordinator orchestrator wrapper.
    expect(src).not.toMatch(/debtor-email-coordinator/);
    expect(src).not.toMatch(/from\s+["']@\/lib\/inngest\/functions\/.*coordinator/);
  });

  it("resolves run_id inside a step.run (replay-safe)", () => {
    expect(src).toMatch(/resolve-run-id/);
    // crypto.randomUUID appears exactly once, on the same line as the
    // resolve-run-id step body (replay-safe id generation inside step.run).
    const uuidCount = (src.match(/crypto\.randomUUID\(\)/g) ?? []).length;
    expect(uuidCount).toBe(1);
    const resolveLine = src
      .split("\n")
      .find((l) => l.includes("crypto.randomUUID()"));
    expect(resolveLine).toBeDefined();
    // The randomUUID call lives in the resolve-run-id step (the line is the
    // arrow body of step.run("resolve-run-id", ...)).
    // Find the actual call site (the LAST `resolve-run-id` occurrence — the
    // header comment mentions it first, the real call comes after) and assert
    // crypto.randomUUID is within a few lines of it (inside the step body).
    const callIdx = src.lastIndexOf("resolve-run-id");
    const uuidIdx = src.indexOf("crypto.randomUUID()");
    expect(callIdx).toBeGreaterThan(-1);
    expect(uuidIdx).toBeGreaterThan(callIdx);
    expect(uuidIdx - callIdx).toBeLessThan(120);
  });

  it("does not destructure or call inngest.send (no downstream events)", () => {
    expect(src).not.toMatch(/const\s+\{\s*send\s*\}\s*=\s*inngest/);
    expect(src).not.toMatch(/inngest\.send\(/);
  });
});
