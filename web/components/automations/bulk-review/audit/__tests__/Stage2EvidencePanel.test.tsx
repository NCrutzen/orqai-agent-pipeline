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

// Phase 82.9 — evidence expansion fixtures (D-01 discriminated inputs + D-03
// rich candidates + D-04 legacy fallback). Mirrors Stage3 panel coverage.

// Phase 82.9
const fixtureThreadInheritance: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "thread",
  confidence: "high",
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: {
    kind: "thread_inheritance",
    prior_email_label_id: "label-abc-123",
    conversation_id: "conv-xyz-789",
  },
  candidates: undefined,
  reasoning: null,
};

// Phase 82.9
const fixtureSenderMatch: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "sender",
  confidence: "high",
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: {
    kind: "sender_match",
    sender_email: "billing@acme-bv.example",
    candidates: [
      {
        id: "ACC-100",
        name: "Acme BV",
        contact_person: "Jane Operator",
        recent_invoices: ["INV-2026-001", "INV-2026-002"],
      },
    ],
  },
  candidates: [
    {
      id: "ACC-100",
      name: "Acme BV",
      contact_person: "Jane Operator",
      recent_invoices: ["INV-2026-001", "INV-2026-002"],
    },
  ],
  reasoning: null,
};

// Phase 82.9
const fixtureIdentifierMatch: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "identifier",
  confidence: "high",
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: {
    kind: "identifier_match",
    matched_identifiers: ["INV-2026-555", "INV-2026-556"],
    candidates: [
      {
        id: "ACC-200",
        name: "Beta NV",
        contact_person: null,
        recent_invoices: [],
      },
    ],
  },
  candidates: [
    {
      id: "ACC-200",
      name: "Beta NV",
      contact_person: null,
      recent_invoices: [],
    },
  ],
  reasoning: null,
};

// Phase 82.9
const fixtureLlmTiebreaker: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "identifier",
  confidence: "medium",
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: {
    kind: "llm_tiebreaker",
    sender_email: "finance@gamma.example",
    matched_identifiers: ["INV-2026-999"],
    candidates: [
      {
        id: "ACC-300",
        name: "Gamma Ltd",
        contact_person: "Chris Contact",
        recent_invoices: ["INV-2026-999"],
      },
      {
        id: "ACC-301",
        name: "Gamma Holding",
        contact_person: null,
        recent_invoices: [],
      },
    ],
    llm_reason: "Best match — closest brand.",
  },
  candidates: [
    {
      id: "ACC-300",
      name: "Gamma Ltd",
      contact_person: "Chris Contact",
      recent_invoices: ["INV-2026-999"],
    },
    {
      id: "ACC-301",
      name: "Gamma Holding",
      contact_person: null,
      recent_invoices: [],
    },
  ],
  reasoning: "Best match — closest brand.",
};

// Phase 82.9
const fixtureUnresolved: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "unresolved",
  confidence: "low",
  top_candidates: [],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: {
    kind: "unresolved",
    sender_email: "unknown@nowhere.example",
    matched_identifiers: [],
  },
  candidates: undefined,
  reasoning: null,
};

// Phase 82.9
const fixtureLegacy: Stage2AuditPayload = {
  stage: 2,
  identifier_source: "thread",
  confidence: "high",
  top_candidates: [
    { account_id: "ACC-LEGACY-1", name: "Legacy Customer", score: 0.8 },
  ],
  screenshot_paths: { before: null, after: null },
  raw: {},
  inputs: null,
  candidates: undefined,
  reasoning: null,
};

describe("Stage2EvidencePanel — Phase 82.9 evidence expansion", () => {
  it("thread_inheritance renders prior_email_label_id + conversation_id, no REASONING", () => {
    render(<Stage2EvidencePanel payload={fixtureThreadInheritance} />);
    expect(screen.getByText("label-abc-123")).toBeTruthy();
    expect(screen.getByText("conv-xyz-789")).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
    expect(screen.queryByTestId("stage2-reasoning")).toBeNull();
  });

  it("sender_match renders sender_email + candidate contact_person + recent invoice, no REASONING", () => {
    render(<Stage2EvidencePanel payload={fixtureSenderMatch} />);
    expect(screen.getByText("billing@acme-bv.example")).toBeTruthy();
    expect(screen.getByText(/Jane Operator/)).toBeTruthy();
    expect(screen.getByText("INV-2026-001")).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
  });

  it("identifier_match renders both matched_identifier chips, no REASONING", () => {
    render(<Stage2EvidencePanel payload={fixtureIdentifierMatch} />);
    expect(screen.getByText("INV-2026-555")).toBeTruthy();
    expect(screen.getByText("INV-2026-556")).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
  });

  it("llm_tiebreaker renders REASONING body + matched_identifiers + candidate contact_person", () => {
    render(<Stage2EvidencePanel payload={fixtureLlmTiebreaker} />);
    expect(screen.getByText("REASONING")).toBeTruthy();
    expect(screen.getByTestId("stage2-reasoning")).toBeTruthy();
    expect(screen.getByText("Best match — closest brand.")).toBeTruthy();
    // INV-2026-999 appears twice: once in INPUTS matched_identifiers chip,
    // once in CANDIDATES recent_invoices chip. Assert at least one match.
    expect(screen.getAllByText("INV-2026-999").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Chris Contact/)).toBeTruthy();
  });

  it("unresolved renders sender_email + empty matched_identifiers, no REASONING, no candidates", () => {
    render(<Stage2EvidencePanel payload={fixtureUnresolved} />);
    expect(screen.getByText("INPUTS")).toBeTruthy();
    expect(screen.getByText("unknown@nowhere.example")).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
    // CANDIDATES section skipped on unresolved (matches existing UI contract).
    expect(screen.queryByTestId("stage2-candidates-list")).toBeNull();
  });

  it("legacy row renders muted 'Legacy run — limited evidence captured.' line + preserves EVIDENCE chips + slim candidate fallback", () => {
    render(<Stage2EvidencePanel payload={fixtureLegacy} />);
    expect(
      screen.getByText("Legacy run — limited evidence captured."),
    ).toBeTruthy();
    // EVIDENCE chips preserved (Pitfall 4 back-compat).
    expect(screen.getByText("thread")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    // Slim top_candidates fallback rendered under CANDIDATES.
    expect(screen.getByText(/ACC-LEGACY-1/)).toBeTruthy();
    expect(screen.getByText(/Legacy Customer/)).toBeTruthy();
  });
});
