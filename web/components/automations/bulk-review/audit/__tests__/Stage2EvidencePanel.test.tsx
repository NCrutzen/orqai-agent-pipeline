import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("../ScreenshotThumb", () => ({
  ScreenshotThumb: ({ path, label }: { path: string; label: string }) => (
    <div data-testid={`mock-thumb-${label}`}>{path ?? "null"}</div>
  ),
}));

import { Stage2EvidencePanel } from "../Stage2EvidencePanel";
import type { Stage2AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";

const empty: Stage2AuditPayload = {
  stage: 2,
  identifier_source: null,
  confidence: null,
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
};

const fullPayload: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "identifier",
  confidence: "high",
  top_candidates: [
    { account_id: "ACC-001", name: "Acme BV", score: 0.97 },
    { account_id: "ACC-002", name: "Beta NV", score: 0.85 },
    { account_id: "ACC-003", name: "Gamma Ltd", score: 0.72 },
  ],
  screenshot_paths: {
    before: "automation-screenshots/run-1/before.png",
    after: "automation-screenshots/run-1/after.png",
  },
  raw: {},
};

const unresolved: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "unresolved",
  confidence: "low",
  top_candidates: [
    { account_id: "ACC-X", name: "Should-not-render", score: 0.4 },
  ],
  screenshot_paths: { before: null, after: null },
  raw: {},
};

const fiveCandidates: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "sender",
  confidence: "medium",
  top_candidates: [
    { account_id: "A1", name: "One", score: 0.9 },
    { account_id: "A2", name: "Two", score: 0.8 },
    { account_id: "A3", name: "Three", score: 0.7 },
    { account_id: "A4", name: "Four", score: 0.6 },
    { account_id: "A5", name: "Five", score: 0.5 },
  ],
  screenshot_paths: { before: null, after: null },
  raw: {},
};

describe("Stage2EvidencePanel", () => {
  it("full payload renders identifier source, confidence, candidates, and both thumbs", () => {
    render(<Stage2EvidencePanel payload={fullPayload} />);
    expect(screen.getByText("identifier")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText(/ACC-001/)).toBeTruthy();
    expect(screen.getByText(/Acme BV/)).toBeTruthy();
    expect(screen.getByText(/0\.97/)).toBeTruthy();
    expect(screen.getByTestId("mock-thumb-Before")).toBeTruthy();
    expect(screen.getByTestId("mock-thumb-After")).toBeTruthy();
  });

  it("unresolved renders locked copy and SKIPS candidate table", () => {
    render(<Stage2EvidencePanel payload={unresolved} />);
    expect(
      screen.getByText("Customer could not be resolved. No candidates returned."),
    ).toBeTruthy();
    expect(screen.queryByText(/Should-not-render/)).toBeNull();
  });

  it("missing both screenshots renders locked iController capture copy", () => {
    render(<Stage2EvidencePanel payload={fiveCandidates} />);
    expect(
      screen.getByText("No iController capture for this run."),
    ).toBeTruthy();
    expect(screen.queryByTestId("mock-thumb-Before")).toBeNull();
    expect(screen.queryByTestId("mock-thumb-After")).toBeNull();
  });

  it("truncates top_candidates to first 3", () => {
    render(<Stage2EvidencePanel payload={fiveCandidates} />);
    expect(screen.getByText(/A1/)).toBeTruthy();
    expect(screen.getByText(/A2/)).toBeTruthy();
    expect(screen.getByText(/A3/)).toBeTruthy();
    expect(screen.queryByText(/A4/)).toBeNull();
    expect(screen.queryByText(/A5/)).toBeNull();
  });

  it("all-null payload renders only top-level empty-state line", () => {
    render(<Stage2EvidencePanel payload={empty} />);
    expect(
      screen.getByText("No evidence captured for this stage."),
    ).toBeTruthy();
  });

  it("includes raw JSON slot placeholder for full payload", () => {
    render(<Stage2EvidencePanel payload={fullPayload} />);
    expect(screen.getByTestId("stage2-raw-json-slot")).toBeTruthy();
  });
});
