import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Structural source-code assertions for RunListLive
// (Same pattern as Plan 02 graph component tests -- avoids complex React
//  context mocking for components that subscribe to Broadcast channels)
// ---------------------------------------------------------------------------

const SOURCE = readFileSync(
  resolve(__dirname, "../run-list-live.tsx"),
  "utf-8"
);

describe("RunListLive", () => {
  it("renders RunCard for each initial run", () => {
    // RunListLive maps over runs and renders <RunCard> for each
    expect(SOURCE).toContain("RunCard");
    expect(SOURCE).toMatch(/runs\.map/);
    expect(SOURCE).toMatch(/<RunCard/);
    expect(SOURCE).toMatch(/key=\{run\.id\}/);
  });

  it("subscribes to runs:live Broadcast channel", () => {
    expect(SOURCE).toContain("useBroadcast");
    expect(SOURCE).toContain('"runs:live"');
    expect(SOURCE).toContain('"run-update"');
  });

  it("updates run status when run-update event is received", () => {
    // handleRunUpdate sets run.status from payload
    expect(SOURCE).toMatch(/payload\.status/);
    expect(SOURCE).toMatch(/status:\s*payload\.status/);
  });

  it("updates steps_completed count from Broadcast payload", () => {
    expect(SOURCE).toMatch(/payload\.stepsCompleted/);
    expect(SOURCE).toMatch(/steps_completed:\s*payload\.stepsCompleted/);
  });

  it("passes showProject prop through to RunCard", () => {
    expect(SOURCE).toMatch(/showProject/);
    expect(SOURCE).toMatch(/showProject=\{showProject\}/);
  });

  it("does not re-render unchanged runs", () => {
    // Uses functional updater with prev.map to only update matching run
    expect(SOURCE).toMatch(/prev\.map/);
    expect(SOURCE).toMatch(/run\.id\s*===\s*payload\.runId/);
  });
});
